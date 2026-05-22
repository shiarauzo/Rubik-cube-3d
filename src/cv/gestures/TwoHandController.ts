import type { GestureFrame, HandShape, Handedness, Landmark } from './types';
import type { HandRotation } from './HandRotation';
import type { GridManipulation } from './GridManipulation';
import type { Solver } from '../../solver/Solver';
import type { MoveEngine } from '../../cube/MoveEngine';
import type { CubeModel } from '../../cube/CubeModel';
import type { Move } from '../../types';
import { expandHalfTurns } from '../../cube/Notation';
import { bus } from '../../app/events';
import { GESTURE_CONFIG, type ModeColor } from '../../constants';

export type ControllerState = 'IDLE' | 'ROTATION' | 'MANIPULATION' | 'SOLVER_CHARGING' | 'SOLVING';

export type { ModeColor };

export class TwoHandController {
  private state: ControllerState = 'IDLE';
  private solverChargeStart: number | null = null;
  private lastResetTime = 0;
  private static RESET_COOLDOWN_MS = 1500; // Prevent spam

  constructor(
    private handRotation: HandRotation,
    private gridManipulation: GridManipulation,
    private solver: Solver,
    private engine: MoveEngine,
    private model: CubeModel,
  ) {}

  processFrame(
    frame: GestureFrame,
    landmarks: Map<Handedness, Landmark[]>,
  ): void {
    const leftHand = frame.hands.find((h) => h.hand === 'Left');
    const rightHand = frame.hands.find((h) => h.hand === 'Right');

    // Check for solver gesture (both fists)
    const bothFists = this.checkBothFists(leftHand, rightHand);

    // State machine transitions
    switch (this.state) {
      case 'IDLE':
        this.handleIdle(leftHand, rightHand, bothFists, landmarks);
        break;

      case 'ROTATION':
        this.handleRotation(leftHand, rightHand, bothFists, landmarks);
        break;

      case 'MANIPULATION':
        this.handleManipulation(leftHand, rightHand, bothFists, frame, landmarks);
        break;

      case 'SOLVER_CHARGING':
        this.handleSolverCharging(bothFists);
        break;

      case 'SOLVING':
        // Do nothing while solving - wait for completion
        break;
    }
  }

  private checkBothFists(left?: HandShape, right?: HandShape): boolean {
    return left?.shape === 'fist' && right?.shape === 'fist';
  }

  private checkBothThumbsUp(left?: HandShape, right?: HandShape): boolean {
    return left?.shape === 'thumbUp' && right?.shape === 'thumbUp';
  }

  private handleIdle(
    leftHand: HandShape | undefined,
    rightHand: HandShape | undefined,
    bothFists: boolean,
    landmarks: Map<Handedness, Landmark[]>,
  ): void {
    // Check for reset gesture (both thumbs up) with cooldown
    const now = performance.now();
    if (this.checkBothThumbsUp(leftHand, rightHand)) {
      if (now - this.lastResetTime > TwoHandController.RESET_COOLDOWN_MS) {
        this.handRotation.reset();
        this.lastResetTime = now;
        bus.emit('toast', { message: '👍 Vista reseteada - Cara frontal: F', kind: 'info' });
      }
      return;
    }

    // Priority: solver > manipulation > rotation
    if (bothFists) {
      this.state = 'SOLVER_CHARGING';
      this.solverChargeStart = performance.now();
      this.handRotation.setEnabled(false);
      this.gridManipulation.setActive(false);
      return;
    }

    if (leftHand?.shape === 'pinch') {
      this.state = 'MANIPULATION';
      this.handRotation.setEnabled(false);
      this.gridManipulation.setActive(true);
      return;
    }

    if (leftHand?.shape === 'palmOut' || leftHand?.shape === 'palmIn') {
      this.state = 'ROTATION';
      this.handRotation.setEnabled(true);
      this.gridManipulation.setActive(false);
      // Process rotation immediately
      this.handRotation.processFrame(landmarks, [leftHand, rightHand].filter(Boolean) as HandShape[]);
      return;
    }

    // No active gesture - disable both
    this.handRotation.setEnabled(false);
    this.gridManipulation.setActive(false);
  }

  private handleRotation(
    leftHand: HandShape | undefined,
    rightHand: HandShape | undefined,
    bothFists: boolean,
    landmarks: Map<Handedness, Landmark[]>,
  ): void {
    // Check for reset gesture (both thumbs up)
    const now = performance.now();
    if (this.checkBothThumbsUp(leftHand, rightHand)) {
      if (now - this.lastResetTime > TwoHandController.RESET_COOLDOWN_MS) {
        this.handRotation.reset();
        this.lastResetTime = now;
        bus.emit('toast', { message: '👍 Vista reseteada - Cara frontal: F', kind: 'info' });
      }
      return;
    }

    // Check for mode transitions
    if (bothFists) {
      this.state = 'SOLVER_CHARGING';
      this.solverChargeStart = performance.now();
      this.handRotation.setEnabled(false);
      return;
    }

    if (leftHand?.shape === 'pinch') {
      this.state = 'MANIPULATION';
      this.handRotation.setEnabled(false);
      this.gridManipulation.setActive(true);
      return;
    }

    // Left hand palmIn triggers snap
    if (leftHand?.shape === 'palmIn') {
      this.handRotation.processFrame(landmarks, [leftHand, rightHand].filter(Boolean) as HandShape[]);
      return;
    }

    // Left hand palmOut continues rotation
    if (leftHand?.shape === 'palmOut') {
      this.handRotation.processFrame(landmarks, [leftHand, rightHand].filter(Boolean) as HandShape[]);
      return;
    }

    // Left hand no longer in rotation gesture - return to idle
    this.state = 'IDLE';
    this.handRotation.setEnabled(false);
  }

  private handleManipulation(
    leftHand: HandShape | undefined,
    rightHand: HandShape | undefined,
    bothFists: boolean,
    _frame: GestureFrame,
    landmarks: Map<Handedness, Landmark[]>,
  ): void {
    // Check for mode transitions
    if (bothFists) {
      this.state = 'SOLVER_CHARGING';
      this.solverChargeStart = performance.now();
      this.gridManipulation.setActive(false);
      return;
    }

    // Left hand must maintain pinch to stay in manipulation mode
    if (leftHand?.shape !== 'pinch') {
      this.state = 'IDLE';
      this.gridManipulation.setActive(false);
      return;
    }

    // Only process right hand for grid manipulation
    const rightOnlyHands = rightHand ? [rightHand] : [];
    this.gridManipulation.processFrame(rightOnlyHands, landmarks);
  }

  private handleSolverCharging(bothFists: boolean): void {
    if (!bothFists) {
      // Cancelled - return to idle
      this.state = 'IDLE';
      this.solverChargeStart = null;
      return;
    }

    const elapsed = performance.now() - (this.solverChargeStart ?? 0);
    if (elapsed >= GESTURE_CONFIG.SOLVER_CHARGE_TIME_MS) {
      this.triggerSolver();
    }
  }

  private async triggerSolver(): Promise<void> {
    this.state = 'SOLVING';
    this.solverChargeStart = null;

    if (this.engine.isBusy()) {
      bus.emit('toast', { message: 'Espera a que termine la animación...', kind: 'warn' });
      this.state = 'IDLE';
      return;
    }

    if (!this.solver.isReady()) {
      bus.emit('toast', { message: 'Solver cargando, espera unos segundos...', kind: 'warn' });
      this.state = 'IDLE';
      return;
    }

    if (this.model.isSolved()) {
      bus.emit('toast', { message: 'Ya está resuelto', kind: 'info' });
      this.state = 'IDLE';
      return;
    }

    try {
      const facelets = this.model.getFacelets();
      const moves = await this.solver.solve(facelets);
      const expanded = expandHalfTurns(moves as Move[]);
      for (const m of expanded) {
        await this.engine.queueMove(m);
      }
    } catch (err) {
      bus.emit('toast', { message: `Error al resolver: ${(err as Error).message}`, kind: 'error' });
    } finally {
      this.state = 'IDLE';
    }
  }

  getState(): ControllerState {
    return this.state;
  }

  getSolverProgress(): number {
    if (this.state !== 'SOLVER_CHARGING' || !this.solverChargeStart) {
      return 0;
    }
    const elapsed = performance.now() - this.solverChargeStart;
    return Math.min(1, elapsed / GESTURE_CONFIG.SOLVER_CHARGE_TIME_MS);
  }

  getModeColor(): ModeColor {
    switch (this.state) {
      case 'ROTATION':
        return 'blue';
      case 'MANIPULATION':
        return 'green';
      case 'SOLVER_CHARGING':
      case 'SOLVING':
        return 'purple';
      default:
        return 'white';
    }
  }

  getModeLabel(): string {
    switch (this.state) {
      case 'ROTATION':
        return 'ROTAR';
      case 'MANIPULATION':
        return 'MANIPULAR';
      case 'SOLVER_CHARGING':
        return 'CARGANDO...';
      case 'SOLVING':
        return 'RESOLVIENDO...';
      default:
        return '';
    }
  }
}
