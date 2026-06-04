import type { Face, Move } from '../../types';
import { FACE_COLOR, COLOR_HEX } from '../../types';
import type { CubeView } from '../../cube/CubeView';
import type { MoveEngine } from '../../cube/MoveEngine';
import type { HandShape, Handedness, Landmark } from './types';

/**
 * Color-based face control for AR mode.
 *
 * You play the way you think about a cube: pick the FACE you want by its color
 * (the center colors never change), then turn it. Tap a color button to select
 * that face — it lights up on the 3D cube — then tap ↻ (clockwise) or ↺
 * (counter-clockwise) to turn it. No notation, no grid of codes.
 *
 * Taps are detected on the rising edge of a pinch (with a short cooldown to
 * absorb tracking flicker), so one pinch = one action.
 */

// Screen regions (normalized, mirrored-x space).
const COLOR_BAR_MAX_Y = 0.2;
const TURN_MIN_Y = 0.72;
const TAP_COOLDOWN_MS = 450;

type Hit =
  | { type: 'color'; face: Face }
  | { type: 'turn'; dir: 'cw' | 'ccw' };

function faceColorCss(face: Face): string {
  return '#' + COLOR_HEX[FACE_COLOR[face]].toString(16).padStart(6, '0');
}

export class FaceControl {
  private selected: Face | null = null;
  private wasPinching = false;
  private lastTapAt = 0;

  private root: HTMLElement;
  private turnControls: HTMLElement;
  private colorBtns = new Map<Face, HTMLElement>();

  constructor(
    private view: CubeView,
    private engine: MoveEngine,
  ) {
    this.root = document.getElementById('face-controls')!;
    this.turnControls = document.getElementById('turn-controls')!;
    for (const btn of Array.from(this.root.querySelectorAll('.color-btn')) as HTMLElement[]) {
      const f = btn.getAttribute('data-face') as Face | null;
      if (f) this.colorBtns.set(f, btn);
    }
  }

  setActive(active: boolean): void {
    this.root.classList.toggle('active', active);
    if (!active) this.deselect();
  }

  processFrame(hands: HandShape[], landmarks: Map<Handedness, Landmark[]>): void {
    const pinch = hands.find((h) => h.shape === 'pinch');
    const lm = pinch ? landmarks.get(pinch.hand) : undefined;
    const pinching = !!(pinch && lm);

    // Rising edge of a pinch = a single tap.
    if (pinching && !this.wasPinching && !this.engine.isBusy()) {
      const now = performance.now();
      if (now - this.lastTapAt > TAP_COOLDOWN_MS) {
        const hit = this.buttonAt(this.point(lm!));
        if (hit) {
          this.lastTapAt = now;
          this.handleTap(hit);
        }
      }
    }
    this.wasPinching = pinching;
  }

  /** Pinch midpoint, mirrored into visual screen space. */
  private point(lm: Landmark[]): { x: number; y: number } {
    const thumb = lm[4];
    const index = lm[8];
    return {
      x: 1 - (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
    };
  }

  private buttonAt(p: { x: number; y: number }): Hit | null {
    if (p.x < 0 || p.x > 1) return null;

    if (p.y <= COLOR_BAR_MAX_Y) {
      const faces = Array.from(this.colorBtns.keys());
      const idx = Math.min(faces.length - 1, Math.max(0, Math.floor(p.x * faces.length)));
      return { type: 'color', face: faces[idx] };
    }

    if (this.selected && p.y >= TURN_MIN_Y) {
      return { type: 'turn', dir: p.x < 0.5 ? 'ccw' : 'cw' };
    }

    return null;
  }

  private handleTap(hit: Hit): void {
    if (hit.type === 'color') {
      // Tapping the selected color again clears the selection.
      if (this.selected === hit.face) this.deselect();
      else this.select(hit.face);
      return;
    }

    if (!this.selected) return;
    // Clockwise (↻) = plain face move; counter-clockwise (↺) = prime.
    const suffix = hit.dir === 'cw' ? '' : "'";
    this.engine.queueMove((this.selected + suffix) as Move);
    this.flashTurn(hit.dir);
  }

  private select(face: Face): void {
    this.selected = face;
    for (const [f, btn] of this.colorBtns) btn.classList.toggle('selected', f === face);
    this.turnControls.classList.add('active');
    this.turnControls.style.setProperty('--c', faceColorCss(face));
    this.view.highlightLayer(face);
  }

  private deselect(): void {
    this.selected = null;
    for (const btn of this.colorBtns.values()) btn.classList.remove('selected');
    this.turnControls.classList.remove('active');
    this.view.highlightLayer(null);
  }

  private flashTurn(dir: 'cw' | 'ccw'): void {
    const btn = this.turnControls.querySelector(`[data-dir="${dir}"]`) as HTMLElement | null;
    if (!btn) return;
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 200);
  }
}
