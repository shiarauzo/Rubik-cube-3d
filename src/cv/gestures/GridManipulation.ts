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

// Move hint mappings for each cell position and drag direction
const MOVE_HINTS: Record<string, { arrow: string; move: string }[]> = {
  // Row 0 (U layer)
  '0-0': [
    { arrow: '←', move: 'U' },
    { arrow: '→', move: "U'" },
    { arrow: '↑', move: 'L' },
    { arrow: '↓', move: "L'" },
  ],
  '0-1': [
    { arrow: '←', move: 'U' },
    { arrow: '→', move: "U'" },
  ],
  '0-2': [
    { arrow: '←', move: 'U' },
    { arrow: '→', move: "U'" },
    { arrow: '↑', move: "R'" },
    { arrow: '↓', move: 'R' },
  ],
  // Row 1 (middle - L/R only)
  '1-0': [
    { arrow: '↑', move: 'L' },
    { arrow: '↓', move: "L'" },
  ],
  '1-1': [], // Center - no moves
  '1-2': [
    { arrow: '↑', move: "R'" },
    { arrow: '↓', move: 'R' },
  ],
  // Row 2 (D layer)
  '2-0': [
    { arrow: '←', move: "D'" },
    { arrow: '→', move: 'D' },
    { arrow: '↑', move: 'L' },
    { arrow: '↓', move: "L'" },
  ],
  '2-1': [
    { arrow: '←', move: "D'" },
    { arrow: '→', move: 'D' },
  ],
  '2-2': [
    { arrow: '←', move: "D'" },
    { arrow: '→', move: 'D' },
    { arrow: '↑', move: "R'" },
    { arrow: '↓', move: 'R' },
  ],
};

export class GridManipulation {
  private phase: Phase = 'IDLE';
  private grabState: GrabState | null = null;
  private gridOverlay: HTMLElement;
  private cells: HTMLElement[];
  private moveHint: HTMLElement;
  private dragPreview: HTMLElement;

  constructor(
    private view: CubeView,
    private engine: MoveEngine,
  ) {
    this.gridOverlay = document.getElementById('grid-overlay')!;
    this.cells = Array.from(this.gridOverlay.querySelectorAll('.grid-cell'));
    this.moveHint = document.getElementById('move-hint')!;
    this.dragPreview = document.getElementById('drag-preview')!;
  }

  setActive(active: boolean): void {
    this.gridOverlay.classList.toggle('active', active);
    if (!active) {
      this.clearHighlights();
      this.hideMoveHint();
      this.hideDragPreview();
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

    // Show move hints for this cell
    this.showMoveHint(cell);
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
    this.grabState.lastX = pinch.x;
    this.grabState.lastY = pinch.y;
    this.phase = 'DRAGGING';

    // Hide move hint, show drag preview instead
    this.hideMoveHint();

    // Highlight the row or column based on direction
    this.highlightLayer();

    // Show initial drag preview
    const pending = this.calculatePendingMove();
    if (pending) {
      this.showDragPreview(pending.move, pending.direction);
    }
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

    // Show drag preview with pending move
    const pending = this.calculatePendingMove();
    if (pending) {
      this.showDragPreview(pending.move, pending.direction);
    }
  }

  private clearHighlights(): void {
    for (const cell of this.cells) {
      cell.classList.remove('pinch-active', 'highlight-row', 'highlight-col');
    }
    // Clear 3D cube highlight
    this.view.highlightLayer(null);
  }

  private showMoveHint(cell: GridCell): void {
    const key = `${cell.row}-${cell.col}`;
    const hints = MOVE_HINTS[key] || [];

    if (hints.length === 0) {
      this.hideMoveHint();
      return;
    }

    const html = `<div class="hint-row">${hints
      .map(
        (h) =>
          `<span class="hint-item"><span class="hint-arrow">${h.arrow}</span><span class="hint-move">${h.move}</span></span>`,
      )
      .join('')}</div>`;

    this.moveHint.innerHTML = html;
    this.moveHint.classList.add('visible');
  }

  private hideMoveHint(): void {
    this.moveHint.classList.remove('visible');
  }

  private showDragPreview(move: Move, direction: 'left' | 'right' | 'up' | 'down'): void {
    const arrows: Record<string, string> = {
      left: '←',
      right: '→',
      up: '↑',
      down: '↓',
    };

    this.dragPreview.innerHTML = `<span class="preview-move">${move}</span><span class="preview-arrow">${arrows[direction]}</span>`;
    this.dragPreview.className = `drag-preview visible direction-${direction}`;
  }

  private hideDragPreview(): void {
    this.dragPreview.classList.remove('visible');
  }

  private calculatePendingMove(): { move: Move; direction: 'left' | 'right' | 'up' | 'down' } | null {
    if (!this.grabState || !this.grabState.direction) return null;

    const { cell, direction, startX, lastX, startY, lastY } = this.grabState;
    const dx = lastX - startX;
    const dy = lastY - startY;

    if (direction === 'horizontal') {
      const face = ROW_TO_FACE[cell.row];
      if (!face) return null;
      // Video is mirrored, so raw dx < 0 means visual drag to the right
      const rightDrag = dx < 0;
      if (face === 'U') {
        return { move: rightDrag ? "U'" : 'U', direction: rightDrag ? 'right' : 'left' };
      } else if (face === 'D') {
        return { move: rightDrag ? 'D' : "D'", direction: rightDrag ? 'right' : 'left' };
      }
    } else if (direction === 'vertical') {
      const face = COL_TO_FACE[cell.col];
      if (!face) return null;
      const downDrag = dy > 0;
      if (face === 'R') {
        return { move: downDrag ? 'R' : "R'", direction: downDrag ? 'down' : 'up' };
      } else if (face === 'L') {
        return { move: downDrag ? "L'" : 'L', direction: downDrag ? 'down' : 'up' };
      }
    }

    return null;
  }

  private cancelGrab(): void {
    this.clearHighlights();
    this.hideMoveHint();
    this.hideDragPreview();
    this.grabState = null;
    this.phase = 'IDLE';
  }

  private releaseGrab(): void {
    if (!this.grabState || !this.grabState.direction) {
      this.cancelGrab();
      return;
    }

    // Get the pending move from current drag state
    const pending = this.calculatePendingMove();

    if (pending && !this.engine.isBusy()) {
      this.engine.queueMove(pending.move);
    }

    this.clearHighlights();
    this.hideMoveHint();
    this.hideDragPreview();
    this.grabState = null;
    this.phase = 'IDLE';
  }
}
