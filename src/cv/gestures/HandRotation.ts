import type { CubeView } from '../../cube/CubeView';
import type { Landmark, Handedness, HandShape } from './types';

// Rotation mapping: hand Y position (0-1) maps to cube Y rotation
// Hand at top (y=0) → cube rotated left, hand at bottom (y=1) → cube rotated right
const MAX_Y_ROTATION = Math.PI * 0.6; // ±108 degrees range

// Small tilt based on hand X position
const MAX_X_TILT = Math.PI / 6; // ±30 degrees

// All possible snap angles
const Y_ANGLES = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
const X_ANGLES = [0, Math.PI / 6, -Math.PI / 6];

/** Snap to nearest discrete angle */
function snapToNearest(current: number, angles: number[]): number {
  let nearest = angles[0];
  let minDist = Math.abs(current - nearest);
  for (const angle of angles) {
    const dist = Math.abs(current - angle);
    if (dist < minDist) {
      minDist = dist;
      nearest = angle;
    }
  }
  return nearest;
}

export class HandRotation {
  private targetY = 0;
  private targetX = 0;
  private currentY = 0;
  private currentX = 0;
  private enabled = true;

  constructor(private view: CubeView) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  processFrame(landmarks: Map<Handedness, Landmark[]>, hands?: HandShape[]): void {
    if (!this.enabled) return;

    const rightHand = landmarks.get('Right');
    const leftHand = landmarks.get('Left');

    // Check if left hand is palmIn → snap to nearest face
    const leftHandShape = hands?.find(h => h.hand === 'Left');
    const shouldSnap = leftHand && leftHandShape?.shape === 'palmIn';

    if (shouldSnap) {
      // Snap to nearest face and stay still
      const snappedY = snapToNearest(this.currentY, Y_ANGLES);
      const snappedX = snapToNearest(this.currentX, X_ANGLES);
      this.targetY = snappedY;
      this.targetX = snappedX;
      this.currentY = snappedY;
      this.currentX = snappedX;
      this.view.group.rotation.y = snappedY;
      this.view.group.rotation.x = snappedX;
      return; // Skip interpolation
    }

    // Use LEFT hand for rotation (same hand that activates the mode)
    const trackingHand = leftHand || rightHand;
    if (!trackingHand) {
      // No hand visible, keep current position
    } else {
      // Use wrist position (landmark 0) for tracking
      const wrist = trackingHand[0];
      // Mirror X because video is flipped
      const x = 1 - wrist.x;
      const y = wrist.y;

      // Hand Y position (up/down) controls cube Y rotation (left/right view)
      // y=0 (top) → rotate left, y=1 (bottom) → rotate right
      // Center (y=0.5) → front view
      const normalizedY = (y - 0.5) * 2; // -1 to 1
      this.targetY = normalizedY * MAX_Y_ROTATION;

      // Hand X position gives slight tilt (optional, subtle)
      const normalizedX = (x - 0.5) * 2; // -1 to 1
      this.targetX = normalizedX * MAX_X_TILT * 0.3; // Very subtle tilt
    }

    // Smooth interpolation to target (easing)
    const smoothing = 0.12;
    this.currentY += (this.targetY - this.currentY) * smoothing;
    this.currentX += (this.targetX - this.currentX) * smoothing;

    // Apply rotation
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
  }
}
