import type { CubeView } from '../../cube/CubeView';
import type { Landmark, Handedness, HandShape } from './types';

// Discrete rotation angles for each zone
const FRONT = 0;
const LEFT = Math.PI / 2;      // 90 degrees
const RIGHT = -Math.PI / 2;    // -90 degrees
const UP = -Math.PI / 4;       // -45 degrees tilt
const DOWN = Math.PI / 4;      // 45 degrees tilt

// Zone thresholds (normalized 0-1 coordinates)
const LEFT_ZONE = 0.35;
const RIGHT_ZONE = 0.65;
const UP_ZONE = 0.35;
const DOWN_ZONE = 0.65;

export class HandRotation {
  private targetY = 0;
  private targetX = 0;
  private currentY = 0;
  private currentX = 0;

  constructor(private view: CubeView) {}

  processFrame(landmarks: Map<Handedness, Landmark[]>, hands?: HandShape[]): void {
    const rightHand = landmarks.get('Right');

    // Check if right hand is open palm → reset to front view
    const rightHandShape = hands?.find(h => h.hand === 'Right');
    const isOpenPalm = rightHandShape?.shape === 'palmIn' || rightHandShape?.shape === 'palmOut';

    if (!rightHand || isOpenPalm) {
      // Return to front when hand is not visible or open palm
      this.targetX = 0;
      this.targetY = 0;
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
