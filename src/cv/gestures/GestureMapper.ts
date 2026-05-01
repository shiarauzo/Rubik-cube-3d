import type { Face, Move } from '../../types';
import type { GestureFrame, HandShape, Handedness } from './types';
import { bus } from '../../app/events';

type State = 'idle' | 'face-selected' | 'cooldown';

const FACE_FROM_LEFT_SHAPE: Record<string, Face | null> = {
  pointUp: 'U',
  pointRight: 'R',
  palmOut: 'F',
  pointDown: 'D',
  pointLeft: 'L',
  palmIn: 'B',
  fist: null,
  thumbUp: null,
  thumbDown: null,
  open: null,
  unknown: null,
  pointUp_neutral: null,
};

const HOLD_FRAMES = 5;
const COOLDOWN_MS = 350;
const SWIPE_BUFFER = 6;
const SWIPE_DX_MIN = 0.18;

interface WristSample { x: number; y: number; ts: number }

export interface GestureMapperEvents {
  onFaceSelected?: (face: Face | null) => void;
  onMove: (move: Move) => void;
}

export class GestureMapper {
  private state: State = 'idle';
  private heldFace: Face | null = null;
  private holdCount = 0;
  private cooldownUntil = 0;
  private rightWrist: WristSample[] = [];

  constructor(private readonly events: GestureMapperEvents) {}

  process(frame: GestureFrame): void {
    if (frame.ts < this.cooldownUntil) return;
    if (this.state === 'cooldown') {
      this.state = 'idle';
    }

    const left = pickHand(frame.hands, 'Left');
    const right = pickHand(frame.hands, 'Right');

    // Update wrist buffer for right hand
    if (right) {
      this.rightWrist.push({ x: right.wrist.x, y: right.wrist.y, ts: frame.ts });
      if (this.rightWrist.length > SWIPE_BUFFER) this.rightWrist.shift();
    } else {
      this.rightWrist = [];
    }

    // Determine candidate face from left hand
    const candidate = left ? FACE_FROM_LEFT_SHAPE[left.shape] : null;
    if (candidate !== this.heldFace) {
      this.heldFace = candidate;
      this.holdCount = 0;
    } else if (candidate) {
      this.holdCount += 1;
    }

    // Update selection event
    if (this.heldFace && this.holdCount === HOLD_FRAMES) {
      this.state = 'face-selected';
      this.events.onFaceSelected?.(this.heldFace);
    }
    if (!this.heldFace && this.state === 'face-selected') {
      this.state = 'idle';
      this.events.onFaceSelected?.(null);
    }

    // If face selected, look for direction commit
    if (this.state === 'face-selected' && right) {
      const dir = this.detectDirection(right);
      if (dir) {
        const move = (dir === 'CW' ? this.heldFace! : `${this.heldFace!}'`) as Move;
        bus.emit('toast', { message: `Gesto → ${move}`, kind: 'info' });
        this.events.onMove(move);
        this.commit(move, frame.ts);
      }
    }

    // Cancel: left hand fist while in face-selected
    if (this.state === 'face-selected' && left?.shape === 'fist') {
      this.state = 'idle';
      this.heldFace = null;
      this.holdCount = 0;
      this.events.onFaceSelected?.(null);
    }
  }

  /** Set when MoveEngine actually animates the move; resolves race condition. */
  notifyMoveApplied(_move: Move): void {
    /* no-op for now; left here for future bookkeeping */
  }

  private detectDirection(right: HandShape): 'CW' | 'CCW' | null {
    if (right.shape === 'thumbUp') return 'CW';
    if (right.shape === 'thumbDown') return 'CCW';
    if (this.rightWrist.length === SWIPE_BUFFER) {
      const dx = this.rightWrist[SWIPE_BUFFER - 1].x - this.rightWrist[0].x;
      const dy = Math.abs(this.rightWrist[SWIPE_BUFFER - 1].y - this.rightWrist[0].y);
      if (Math.abs(dx) > SWIPE_DX_MIN && dy < 0.1) {
        // Note: image coords +x = right in original frame; selfie display is mirrored,
        // so a "swipe right" in user's view corresponds to dx < 0 in landmarks.
        return dx < 0 ? 'CW' : 'CCW';
      }
    }
    return null;
  }

  private commit(_move: Move, ts: number): void {
    this.cooldownUntil = ts + COOLDOWN_MS;
    this.state = 'cooldown';
    this.heldFace = null;
    this.holdCount = 0;
    this.rightWrist = [];
    this.events.onFaceSelected?.(null);
  }
}

function pickHand(hands: HandShape[], h: Handedness): HandShape | null {
  for (const x of hands) if (x.hand === h) return x;
  return null;
}

export const FACE_FROM_LEFT_SHAPE_PUBLIC = FACE_FROM_LEFT_SHAPE;
