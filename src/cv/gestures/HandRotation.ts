import type { CubeView } from '../../cube/CubeView';
import type { Landmark, Handedness, HandShape } from './types';

// Discrete rotation angles for each zone
const FRONT = 0;
const LEFT = Math.PI / 2;      // 90 degrees
const RIGHT = -Math.PI / 2;    // -90 degrees
const UP = -Math.PI / 4;       // -45 degrees tilt
const DOWN = Math.PI / 4;      // 45 degrees tilt

// All possible discrete angles
const Y_ANGLES = [FRONT, LEFT, RIGHT, Math.PI]; // 0, 90, -90, 180
const X_ANGLES = [0, UP, DOWN];                  // 0, -45, 45

// Zone thresholds (normalized 0-1 coordinates)
const LEFT_ZONE = 0.35;
const RIGHT_ZONE = 0.65;
const UP_ZONE = 0.35;
const DOWN_ZONE = 0.65;

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

  constructor(private view: CubeView) {}

  processFrame(landmarks: Map<Handedness, Landmark[]>, hands?: HandShape[]): void {
    const rightHand = landmarks.get('Right');
    const leftHand = landmarks.get('Left');

    // Check if left hand is open palm → snap to nearest face
    const leftHandShape = hands?.find(h => h.hand === 'Left');
    const isLeftOpen = leftHand && (leftHandShape?.shape === 'palmIn' || leftHandShape?.shape === 'palmOut');

    if (isLeftOpen) {
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
    } else if (!rightHand) {
      // No right hand visible, keep current position
    } else {
      // Use wrist position (landmark 0) for tracking
      const wrist = rightHand[0];
      // Mirror X because video is flipped
      const x = 1 - wrist.x;
      const y = wrist.y;

      // Determine horizontal zone (left, center, right)
      if (x < LEFT_ZONE) {
        this.targetY = LEFT;
      } else if (x > RIGHT_ZONE) {
        this.targetY = RIGHT;
      } else {
        this.targetY = FRONT;
      }

      // Determine vertical zone (up, center, down)
      if (y < UP_ZONE) {
        this.targetX = UP;
      } else if (y > DOWN_ZONE) {
        this.targetX = DOWN;
      } else {
        this.targetX = 0;
      }
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
