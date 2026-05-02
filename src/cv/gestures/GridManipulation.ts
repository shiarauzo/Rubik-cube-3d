import type { Face, Move } from '../../types';
import type { CubeView } from '../../cube/CubeView';
import type { MoveEngine } from '../../cube/MoveEngine';
import type { HandShape, Handedness, Landmark } from './types';

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

// Map grid position to cube face
// Rows: 0=U layer, 1=E (equator), 2=D layer
// Cols: 0=L layer, 1=M (middle), 2=R layer
const ROW_TO_FACE: Record<number, Face | null> = {
  0: 'U',
  1: null, // E slice - not standard face
  2: 'D',
};

const COL_TO_FACE: Record<number, Face | null> = {
  0: 'L',
  1: null, // M slice - not standard face
  2: 'R',
};

const DRAG_THRESHOLD = 0.04;

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
    const thumb = landmarks[4];
    const index = landmarks[8];
    return {
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
    };
  }

  private getGridCell(x: number, y: number): GridCell | null {
    // Mirror x for flipped video
    const mirroredX = 1 - x;

    // Grid occupies center area with padding (8% on each side = 84% area)
    const padding = 0.08;
    const gridSize = 1 - 2 * padding;

    const relX = (mirroredX - padding) / gridSize;
    const relY = (y - padding) / gridSize;

    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

    const col = Math.floor(relX * 3);
    const row = Math.floor(relY * 3);

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

    // Highlight the active cell
    const cellEl = this.getCellElement(cell.row, cell.col);
    if (cellEl) cellEl.classList.add('pinch-active');
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

    // Highlight the row or column based on direction
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

  private clearHighlights(): void {
    for (const cell of this.cells) {
      cell.classList.remove('pinch-active', 'highlight-row', 'highlight-col');
    }
    // Clear 3D cube highlight
    this.view.highlightLayer(null);
  }

  private cancelGrab(): void {
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
      const face = ROW_TO_FACE[cell.row];
      if (face) {
        // Video is mirrored, so raw dx < 0 means visual drag to the right
        // For U: right drag = U' (counter-clockwise when looking down)
        // For D: right drag = D (clockwise when looking down)
        const rightDrag = dx < 0;
        if (face === 'U') {
          move = rightDrag ? "U'" : 'U';
        } else if (face === 'D') {
          move = rightDrag ? 'D' : "D'";
        }
      }
    } else if (direction === 'vertical') {
      // Vertical drag = rotate the column
      const face = COL_TO_FACE[cell.col];
      if (face) {
        // dy > 0 means drag down
        const downDrag = dy > 0;
        if (face === 'R') {
          move = downDrag ? 'R' : "R'";
        } else if (face === 'L') {
          move = downDrag ? "L'" : 'L';
        }
      }
    }

    if (move && !this.engine.isBusy()) {
      this.engine.queueMove(move as Move);
    }

    this.clearHighlights();
    this.grabState = null;
    this.phase = 'IDLE';
  }
}
