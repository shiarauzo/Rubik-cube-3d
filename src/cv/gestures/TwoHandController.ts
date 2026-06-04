import type { GestureFrame, HandShape, Handedness, Landmark } from './types';
import type { HandRotation } from './HandRotation';
import type { FaceControl } from './FaceControl';
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
  private rotating = false;
  private static RESET_COOLDOWN_MS = 1500; // Prevent spam

  constructor(
    private handRotation: HandRotation,
    private faceControl: FaceControl,
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
    const now = performance.now();

    // Reset gesture (both thumbs up) — recenters the cube view.
    if (this.checkBothThumbsUp(leftHand, rightHand)) {
      if (now - this.lastResetTime > TwoHandController.RESET_COOLDOWN_MS) {
        this.handRotation.reset();
        this.lastResetTime = now;
        bus.emit('toast', { message: '👍 Vista reseteada - Cara frontal: F', kind: 'info' });
      }
      this.endRotation();
      this.state = 'IDLE';
      return;
    }

    // Solver gesture (both fists) takes priority over everything else.
    if (this.checkBothFists(leftHand, rightHand)) {
      this.handleSolverCharging(now);
      return;
    }
    if (this.state === 'SOLVER_CHARGING') {
      // Fists released before charge completed — cancel.
      this.state = 'IDLE';
      this.solverChargeStart = null;
    }
    if (this.state === 'SOLVING') {
      // Wait for the solve animation to finish.
      return;
    }

    // Left hand → mechanical whole-cube rotation (pinch + drag).
    this.processCubeRotation(leftHand, landmarks);

    // Right hand → color-based face control (tap a color, then ↻/↺).
    const rightOnly = rightHand ? [rightHand] : [];
    this.faceControl.processFrame(rightOnly, landmarks);

    // Derive the display state for the overlay / mode indicator.
    if (this.rotating) {
      this.state = 'ROTATION';
    } else if (rightHand?.shape === 'pinch') {
      this.state = 'MANIPULATION';
    } else {
      this.state = 'IDLE';
    }
  }

  private processCubeRotation(
    leftHand: HandShape | undefined,
    landmarks: Map<Handedness, Landmark[]>,
  ): void {
    const lm = landmarks.get('Left');
    if (leftHand?.shape === 'pinch' && lm) {
      const point = this.getPinchPoint(lm);
      if (!this.rotating) {
        this.rotating = true;
        this.handRotation.startDrag(point.x, point.y);
      } else {
        this.handRotation.updateDrag(point.x, point.y);
      }
    } else {
      this.endRotation();
    }
  }

  private endRotation(): void {
    if (this.rotating) {
      this.rotating = false;
      this.handRotation.endDrag();
    }
  }

  private getPinchPoint(landmarks: Landmark[]): { x: number; y: number } {
    const thumb = landmarks[4];
    const index = landmarks[8];
    return {
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
    };
  }

  private checkBothFists(left?: HandShape, right?: HandShape): boolean {
    return left?.shape === 'fist' && right?.shape === 'fist';
  }

  private checkBothThumbsUp(left?: HandShape, right?: HandShape): boolean {
    return left?.shape === 'thumbUp' && right?.shape === 'thumbUp';
  }

  private handleSolverCharging(now: number): void {
    if (this.state !== 'SOLVER_CHARGING' && this.state !== 'SOLVING') {
      this.state = 'SOLVER_CHARGING';
      this.solverChargeStart = now;
      this.endRotation();
    }
    if (this.state !== 'SOLVER_CHARGING') return;

    const elapsed = now - (this.solverChargeStart ?? now);
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
        return 'GIRAR CARA';
      case 'SOLVER_CHARGING':
        return 'CARGANDO...';
      case 'SOLVING':
        return 'RESOLVIENDO...';
      default:
        return '';
    }
  }
}
