import type { Face, Move } from '../../types';
import type { CubeView } from '../../cube/CubeView';
import type { MoveEngine } from '../../cube/MoveEngine';
import type { HandShape, Handedness, Landmark } from './types';
import {
  DRAG_THRESHOLD,
  GRID_PADDING,
  GRID_SIZE,
  THUMB_TIP,
  INDEX_TIP,
} from './constants';

type Phase = 'IDLE' | 'PINCHING' | 'DRAGGING';

interface GridCell {
  row: number; // 0=top, 1=middle, 2=bottom
  col: number; // 0=left, 1=middle, 2=right (after mirror flip)
}

interface GrabState {
  hand: Handedness;
  cell: GridCell;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  direction: 'horizontal' | 'vertical' | null;
}

// Map grid position to cube moves
// Rows: 0=U layer, 1=middle (using D for equator behavior), 2=D layer
// Cols: 0=L layer, 1=middle (using R for middle column behavior), 2=R layer
// Note: Middle moves use inverted directions to match intuitive gesture mapping
const ROW_MOVES: Record<number, { cw: Move; ccw: Move }> = {
  0: { cw: 'U', ccw: "U'" },
  1: { cw: "D'", ccw: 'D' }, // Middle row - inverted from normal D move for intuitive gesture
  2: { cw: "D'", ccw: 'D' },
};

const COL_MOVES: Record<number, { down: Move; up: Move }> = {
  0: { down: "L'", up: 'L' },
  1: { down: 'R', up: "R'" }, // Middle col - matches normal R direction
  2: { down: 'R', up: "R'" },
};

// For highlighting (only outer faces)
const ROW_TO_FACE: Record<number, Face | null> = { 0: 'U', 1: null, 2: 'D' };
const COL_TO_FACE: Record<number, Face | null> = { 0: 'L', 1: null, 2: 'R' };

export class GridManipulation {
  private phase: Phase = 'IDLE';
  private grabState: GrabState | null = null;
  private gridOverlay: HTMLElement;
  private cells: HTMLElement[];

  constructor(
    private view: CubeView,
    private engine: MoveEngine,
  ) {
    this.gridOverlay = document.getElementById('grid-overlay')!;
    this.cells = Array.from(this.gridOverlay.querySelectorAll('.grid-cell'));
  }

  setActive(active: boolean): void {
    this.gridOverlay.classList.toggle('active', active);
    if (!active) {
      this.clearHighlights();
      this.phase = 'IDLE';
      this.grabState = null;
    }
  }

  processFrame(hands: HandShape[], landmarks: Map<Handedness, Landmark[]>): void {
    // Block all input while move is animating
    if (this.engine.isBusy()) {
      return;
    }

    const pinchingHand = hands.find((h) => h.shape === 'pinch');

    switch (this.phase) {
      case 'IDLE':
        this.clearHighlights();
        if (pinchingHand) {
          const lm = landmarks.get(pinchingHand.hand);
          if (lm) this.tryStartGrab(pinchingHand.hand, lm);
        }
        break;

      case 'PINCHING':
        if (!pinchingHand || (this.grabState && pinchingHand.hand !== this.grabState.hand)) {
          this.cancelGrab();
        } else if (this.grabState) {
          const lm = landmarks.get(this.grabState.hand);
          if (lm) this.checkDragStart(lm);
        }
        break;

      case 'DRAGGING':
        if (!pinchingHand || (this.grabState && pinchingHand.hand !== this.grabState.hand)) {
          this.releaseGrab();
        } else if (this.grabState) {
          const lm = landmarks.get(this.grabState.hand);
          if (lm) this.updateDrag(lm);
        }
        break;
    }
  }

  private getPinchPoint(landmarks: Landmark[]): { x: number; y: number } {
    const thumb = landmarks[THUMB_TIP];
    const index = landmarks[INDEX_TIP];
    return {
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
    };
  }

  private getGridCell(x: number, y: number): GridCell | null {
    // Mirror x for flipped video
    const mirroredX = 1 - x;

    // Grid occupies center area with padding
    const gridSize = 1 - 2 * GRID_PADDING;

    const relX = (mirroredX - GRID_PADDING) / gridSize;
    const relY = (y - GRID_PADDING) / gridSize;

    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

    const col = Math.floor(relX * GRID_SIZE);
    const row = Math.floor(relY * GRID_SIZE);

    return {
      row: Math.min(2, Math.max(0, row)),
      col: Math.min(2, Math.max(0, col)),
    };
  }

  private getCellElement(row: number, col: number): HTMLElement | null {
    return this.gridOverlay.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  }

  private tryStartGrab(hand: Handedness, landmarks: Landmark[]): void {
    const pinch = this.getPinchPoint(landmarks);
    const cell = this.getGridCell(pinch.x, pinch.y);

    if (!cell) return;

    this.phase = 'PINCHING';
    this.grabState = {
      hand,
      cell,
      startX: pinch.x,
      startY: pinch.y,
      lastX: pinch.x,
      lastY: pinch.y,
      direction: null,
    };

    // Show predictive highlights for both row and column
    this.showPredictiveHighlight(cell);
  }

  private checkDragStart(landmarks: Landmark[]): void {
    if (!this.grabState) return;

    const pinch = this.getPinchPoint(landmarks);
    const dx = pinch.x - this.grabState.startX;
    const dy = pinch.y - this.grabState.startY;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DRAG_THRESHOLD) return;

    // Determine drag direction
    this.grabState.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    this.phase = 'DRAGGING';

    // Clear predictive highlights and show confirmed direction
    this.clearPredictiveHighlight();
    this.highlightLayer();
  }

  private highlightLayer(): void {
    if (!this.grabState) return;

    this.clearHighlights();

    const { cell, direction } = this.grabState;

    if (direction === 'horizontal') {
      // Highlight the row
      for (let c = 0; c < 3; c++) {
        const el = this.getCellElement(cell.row, c);
        if (el) el.classList.add('highlight-row');
      }
      // Highlight 3D cube layer
      const face = ROW_TO_FACE[cell.row];
      if (face) this.view.highlightLayer(face);
    } else if (direction === 'vertical') {
      // Highlight the column
      for (let r = 0; r < 3; r++) {
        const el = this.getCellElement(r, cell.col);
        if (el) el.classList.add('highlight-col');
      }
      // Highlight 3D cube layer
      const face = COL_TO_FACE[cell.col];
      if (face) this.view.highlightLayer(face);
    }
  }

  private updateDrag(landmarks: Landmark[]): void {
    if (!this.grabState || !this.grabState.direction) return;

    const pinch = this.getPinchPoint(landmarks);

    // Track position for direction detection on release
    this.grabState.lastX = pinch.x;
    this.grabState.lastY = pinch.y;

    // Update highlights as user drags
    this.highlightLayer();
  }

  private showPredictiveHighlight(cell: GridCell): void {
    // Highlight both row and column with reduced opacity
    for (let c = 0; c < 3; c++) {
      const el = this.getCellElement(cell.row, c);
      if (el) el.classList.add('predict-row');
    }
    for (let r = 0; r < 3; r++) {
      const el = this.getCellElement(r, cell.col);
      if (el) el.classList.add('predict-col');
    }
  }

  private clearPredictiveHighlight(): void {
    // Clear all prediction classes from grid cells
    const cells = this.gridOverlay?.querySelectorAll('.grid-cell');
    cells?.forEach((cell) => {
      cell.classList.remove('predict-row', 'predict-col');
    });
  }

  private clearHighlights(): void {
    for (const cell of this.cells) {
      cell.classList.remove('highlight-row', 'highlight-col', 'predict-row', 'predict-col');
    }
    // Clear 3D cube highlight
    this.view.highlightLayer(null);
  }

  private cancelGrab(): void {
    this.clearPredictiveHighlight();
    this.clearHighlights();
    this.grabState = null;
    this.phase = 'IDLE';
  }

  private releaseGrab(): void {
    if (!this.grabState || !this.grabState.direction) {
      this.cancelGrab();
      return;
    }

    const { cell, direction, startX, startY, lastX, lastY } = this.grabState;

    // Calculate total drag delta (in raw video coords, before mirroring)
    const dx = lastX - startX;
    const dy = lastY - startY;

    let move: Move | null = null;

    if (direction === 'horizontal') {
      // Horizontal drag = rotate the row
      const moves = ROW_MOVES[cell.row];
      // Video is mirrored, so raw dx < 0 means visual drag to the right
      const rightDrag = dx < 0;
      move = rightDrag ? moves.ccw : moves.cw;
    } else if (direction === 'vertical') {
      // Vertical drag = rotate the column
      const moves = COL_MOVES[cell.col];
      // dy > 0 means drag down
      const downDrag = dy > 0;
      move = downDrag ? moves.down : moves.up;
    }

    if (move && !this.engine.isBusy()) {
      this.engine.queueMove(move);
    }

    this.clearHighlights();
    this.grabState = null;
    this.phase = 'IDLE';
  }
}
