import type { CubeView } from '../../cube/CubeView';

/**
 * Whole-cube reorientation driven by a left-hand pinch + drag.
 *
 * The rotation is mechanical and discrete: each deliberate drag past a
 * threshold snaps the cube 90° to the next face. The cube never moves on its
 * own — it only reacts to an active drag, so simply turning the camera on (or
 * showing an open hand) leaves the cube exactly where it was.
 */

// One mechanical step = 90°.
const STEP = Math.PI / 2;

// How far the pinch must travel (normalized 0-1 coords) to commit one step.
const DRAG_THRESHOLD = 0.1;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export class HandRotation {
  private targetY = 0;
  private targetX = 0;
  private currentY = 0;
  private currentX = 0;
  private enabled = false;

  // Drag tracking (pinch midpoint, raw unmirrored coords)
  private dragging = false;
  private startX = 0;
  private startY = 0;
  private axisLocked: 'horizontal' | 'vertical' | null = null;

  constructor(private view: CubeView) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.endDrag();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Begin a drag gesture at the given pinch point. */
  startDrag(x: number, y: number): void {
    if (!this.enabled) return;
    this.dragging = true;
    this.startX = x;
    this.startY = y;
    this.axisLocked = null;
  }

  /** End the current drag gesture (pinch released). */
  endDrag(): void {
    this.dragging = false;
    this.axisLocked = null;
  }

  /**
   * Update the drag. Once the pinch travels past the threshold the cube snaps
   * 90° in that direction, and the drag origin resets so a longer drag rotates
   * several faces in a row.
   */
  updateDrag(x: number, y: number): void {
    if (!this.enabled || !this.dragging) return;

    const dx = x - this.startX;
    const dy = y - this.startY;

    // Lock the axis on the first significant movement so a horizontal drag
    // never accidentally tilts the cube and vice versa.
    if (this.axisLocked === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD) return;
      this.axisLocked = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (this.axisLocked === 'horizontal') {
      // Video is mirrored: raw dx > 0 means the hand visually moved left.
      if (dx > DRAG_THRESHOLD) {
        this.targetY += STEP; // drag left → next face on the left
        this.resetOrigin(x, y);
      } else if (dx < -DRAG_THRESHOLD) {
        this.targetY -= STEP; // drag right → next face on the right
        this.resetOrigin(x, y);
      }
    } else {
      // Tilt is clamped to ±90° so the cube never flips fully over.
      if (dy < -DRAG_THRESHOLD) {
        this.targetX = clamp(this.targetX - STEP, -STEP, STEP); // drag up
        this.resetOrigin(x, y);
      } else if (dy > DRAG_THRESHOLD) {
        this.targetX = clamp(this.targetX + STEP, -STEP, STEP); // drag down
        this.resetOrigin(x, y);
      }
    }
  }

  private resetOrigin(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
  }

  /**
   * Ease the cube toward its target orientation. Called every frame so the
   * snap animates smoothly even after the drag input stops arriving.
   */
  update(): void {
    const smoothing = 0.18;
    this.currentY += (this.targetY - this.currentY) * smoothing;
    this.currentX += (this.targetX - this.currentX) * smoothing;
    this.view.group.rotation.y = this.currentY;
    this.view.group.rotation.x = this.currentX;
  }

  reset(): void {
    this.targetX = 0;
    this.targetY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.view.group.rotation.x = 0;
    this.view.group.rotation.y = 0;
    this.endDrag();
  }
}
