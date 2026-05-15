import * as THREE from 'three';
import type { CubeView } from '../../cube/CubeView';
import type { Landmark, Handedness, HandShape } from './types';

// Adaptive smoothing
const SMOOTHING_MIN = 0.08; // Fast when far from target
const SMOOTHING_MAX = 0.25; // Slow when near target

// Swipe detection
const SWIPE_THRESHOLD = 0.12;
const SWIPE_TIME_MS = 300;

// Zoom limits
const MAX_ZOOM = 12;
const DEFAULT_ZOOM = 5.4;

export class HandRotation {
  private targetY = 0;
  private targetX = 0;
  private currentY = 0;
  private currentX = 0;
  private enabled = true;

  // Swipe detection state
  private swipeStartPos: { x: number; y: number; time: number } | null = null;
  private lastWristPos: { x: number; y: number } | null = null;

  // Zoom state
  private targetZoom = DEFAULT_ZOOM;
  private currentZoom = DEFAULT_ZOOM;

  // Reference to camera for zoom
  private camera: THREE.PerspectiveCamera | null = null;

  // Snap animation state
  private isSnapping = false;

  constructor(private view: CubeView) {}

  setCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.currentZoom = camera.position.length();
    this.targetZoom = this.currentZoom;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.swipeStartPos = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  processFrame(landmarks: Map<Handedness, Landmark[]>, hands?: HandShape[]): void {
    if (!this.enabled) return;

    const leftHand = landmarks.get('Left');
    const leftShape = hands?.find(h => h.hand === 'Left');

    // Check for zoom gesture (all fingers together = pinch closed)
    if (leftShape?.shape === 'fist') {
      // Zoom out when fist
      this.targetZoom = Math.min(MAX_ZOOM, this.targetZoom + 0.15);
    } else if (leftShape?.shape === 'palmOut' || leftShape?.shape === 'palmIn') {
      // Zoom in when palm open (gradually return to default)
      if (this.targetZoom > DEFAULT_ZOOM) {
        this.targetZoom = Math.max(DEFAULT_ZOOM, this.targetZoom - 0.1);
      }
    }

    // Apply zoom smoothly
    if (this.camera) {
      this.currentZoom += (this.targetZoom - this.currentZoom) * 0.1;
      const dir = this.camera.position.clone().normalize();
      this.camera.position.copy(dir.multiplyScalar(this.currentZoom));
    }

    if (!leftHand) {
      this.lastWristPos = null;
      this.swipeStartPos = null;
      return;
    }

    const wrist = leftHand[0];
    const x = 1 - wrist.x; // Mirror for flipped video
    const y = wrist.y;

    // Check for swipe gesture
    if (leftShape?.shape === 'palmOut' || leftShape?.shape === 'palmIn') {
      if (this.lastWristPos) {
        // Track swipe start
        if (!this.swipeStartPos) {
          this.swipeStartPos = { x, y, time: performance.now() };
        }

        // Check for completed swipe
        const swipeDx = x - this.swipeStartPos.x;
        const swipeDy = y - this.swipeStartPos.y;
        const swipeTime = performance.now() - this.swipeStartPos.time;

        if (swipeTime < SWIPE_TIME_MS) {
          if (Math.abs(swipeDx) > SWIPE_THRESHOLD && Math.abs(swipeDx) > Math.abs(swipeDy)) {
            // Horizontal swipe - add momentum to Y rotation
            this.targetY += swipeDx > 0 ? Math.PI / 2 : -Math.PI / 2;
            this.swipeStartPos = null;
          } else if (Math.abs(swipeDy) > SWIPE_THRESHOLD && Math.abs(swipeDy) > Math.abs(swipeDx)) {
            // Vertical swipe - add momentum to X rotation
            this.targetX += swipeDy > 0 ? Math.PI / 4 : -Math.PI / 4;
            this.targetX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetX));
            this.swipeStartPos = null;
          }
        } else {
          // Reset swipe if taking too long (continuous movement)
          this.swipeStartPos = { x, y, time: performance.now() };
        }

        // Continuous rotation based on hand position
        // Horizontal: left/right of center rotates cube
        const centerOffsetX = (x - 0.5) * 2; // -1 to 1
        const centerOffsetY = (y - 0.5) * 2; // -1 to 1

        this.targetY = centerOffsetX * Math.PI * 0.6; // Max ±108 degrees
        this.targetX = centerOffsetY * Math.PI * 0.25; // Max ±45 degrees
      }

      this.lastWristPos = { x, y };
    } else {
      this.swipeStartPos = null;
    }

    // Adaptive smoothing - more smoothing when close to target (reduces overshoot)
    const deltaX = Math.abs(this.targetX - this.currentX);
    const deltaY = Math.abs(this.targetY - this.currentY);
    const maxDelta = Math.max(deltaX, deltaY);

    const smoothing = SMOOTHING_MIN + (SMOOTHING_MAX - SMOOTHING_MIN) * (1 - Math.min(1, maxDelta / (Math.PI / 4)));

    // Smooth interpolation
    this.currentY += (this.targetY - this.currentY) * smoothing;
    this.currentX += (this.targetX - this.currentX) * smoothing;

    // Apply rotation
    this.view.group.rotation.y = this.currentY;
    this.view.group.rotation.x = this.currentX;
  }

  snapToNearest90(): void {
    if (this.isSnapping) return;

    const snappedY = Math.round(this.currentY / (Math.PI / 2)) * (Math.PI / 2);
    const snappedX = Math.round(this.currentX / (Math.PI / 2)) * (Math.PI / 2);

    this.animateSnap(this.currentY, snappedY, this.currentX, snappedX, 200);
  }

  private animateSnap(fromY: number, toY: number, fromX: number, toX: number, duration: number): void {
    this.isSnapping = true;
    const start = performance.now();

    const tick = (): void => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic

      this.currentY = fromY + (toY - fromY) * eased;
      this.currentX = fromX + (toX - fromX) * eased;
      this.view.group.rotation.y = this.currentY;
      this.view.group.rotation.x = this.currentX;

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        this.isSnapping = false;
      }
    };
    tick();
  }

  reset(): void {
    this.targetX = 0;
    this.targetY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.targetZoom = DEFAULT_ZOOM;
    this.view.group.rotation.x = 0;
    this.view.group.rotation.y = 0;
    this.swipeStartPos = null;
    this.lastWristPos = null;
  }
}
