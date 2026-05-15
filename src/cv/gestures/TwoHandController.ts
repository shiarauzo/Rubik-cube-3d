import type { GestureFrame, HandShape, Handedness, Landmark } from './types';
import type { HandRotation } from './HandRotation';
import type { GridManipulation } from './GridManipulation';
import type { Solver } from '../../solver/Solver';
import type { MoveEngine } from '../../cube/MoveEngine';
import type { CubeModel } from '../../cube/CubeModel';
import type { Move } from '../../types';
import { expandHalfTurns } from '../../cube/Notation';
import { bus } from '../../app/events';
import { SOLVER_CHARGE_TIME } from './constants';

export type ControllerState = 'IDLE' | 'ROTATION' | 'MANIPULATION' | 'ONE_HAND_MANIPULATION' | 'SOLVER_CHARGING' | 'SOLVING';

export type ModeColor = 'white' | 'blue' | 'green' | 'yellow' | 'purple';

export class TwoHandController {
  private state: ControllerState = 'IDLE';
  private solverChargeStart: number | null = null;

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
        this.handleManipulation(leftHand, rightHand, bothFists, landmarks);
        break;

      case 'ONE_HAND_MANIPULATION':
        this.handleOneHandManipulation(leftHand, rightHand, bothFists, landmarks);
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

  private handleIdle(
    leftHand: HandShape | undefined,
    rightHand: HandShape | undefined,
    bothFists: boolean,
    landmarks: Map<Handedness, Landmark[]>,
  ): void {
    // Priority: solver > manipulation > one-hand manipulation > rotation
    if (bothFists) {
      this.state = 'SOLVER_CHARGING';
      this.solverChargeStart = performance.now();
      this.handRotation.setEnabled(false);
      this.gridManipulation.setActive(false);
      return;
    }

    // Two-hand manipulation (left pinch activates, right manipulates)
    if (leftHand?.shape === 'pinch') {
      this.state = 'MANIPULATION';
      this.handRotation.setEnabled(false);
      this.gridManipulation.setActive(true);
      return;
    }

    // One-hand manipulation (only right hand pinch, no left hand)
    if (!leftHand && rightHand?.shape === 'pinch') {
      this.state = 'ONE_HAND_MANIPULATION';
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

    // Left hand palmIn triggers snap to 90 degrees
    if (leftHand?.shape === 'palmIn') {
      this.handRotation.snapToNearest90();
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

  private handleOneHandManipulation(
    leftHand: HandShape | undefined,
    rightHand: HandShape | undefined,
    bothFists: boolean,
    landmarks: Map<Handedness, Landmark[]>,
  ): void {
    // Check for mode transitions
    if (bothFists) {
      this.state = 'SOLVER_CHARGING';
      this.solverChargeStart = performance.now();
      this.gridManipulation.setActive(false);
      return;
    }

    // If left hand appears, could transition to two-hand manipulation or rotation
    if (leftHand) {
      if (leftHand.shape === 'pinch') {
        this.state = 'MANIPULATION';
        // Keep grid manipulation active
        return;
      }
      if (leftHand.shape === 'palmOut' || leftHand.shape === 'palmIn') {
        this.state = 'ROTATION';
        this.handRotation.setEnabled(true);
        this.gridManipulation.setActive(false);
        this.handRotation.processFrame(landmarks, [leftHand, rightHand].filter(Boolean) as HandShape[]);
        return;
      }
    }

    // Right hand must maintain pinch to stay in one-hand manipulation mode
    if (rightHand?.shape !== 'pinch') {
      this.state = 'IDLE';
      this.gridManipulation.setActive(false);
      return;
    }

    // Process right hand for both selection and manipulation
    const rightHandArray = rightHand ? [rightHand] : [];
    this.gridManipulation.processFrame(rightHandArray, landmarks);
  }

  private handleSolverCharging(bothFists: boolean): void {
    if (!bothFists) {
      // Cancelled - return to idle
      this.state = 'IDLE';
      this.solverChargeStart = null;
      return;
    }

    const elapsed = performance.now() - (this.solverChargeStart ?? 0);
    if (elapsed >= SOLVER_CHARGE_TIME) {
      this.triggerSolver();
    }
  }

  private async triggerSolver(): Promise<void> {
    this.state = 'SOLVING';
    this.solverChargeStart = null;

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
    return Math.min(1, elapsed / SOLVER_CHARGE_TIME);
  }

  getModeColor(): ModeColor {
    switch (this.state) {
      case 'ROTATION':
        return 'blue';
      case 'MANIPULATION':
        return 'green';
      case 'ONE_HAND_MANIPULATION':
        return 'yellow';
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
      case 'ONE_HAND_MANIPULATION':
        return 'UNA MANO';
      case 'SOLVER_CHARGING':
        return 'CARGANDO...';
      case 'SOLVING':
        return 'RESOLVIENDO...';
      default:
        return '';
    }
  }
}
