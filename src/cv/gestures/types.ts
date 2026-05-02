import type { Face, Move } from '../../types';

export type Handedness = 'Left' | 'Right';

export interface Landmark { x: number; y: number; z: number }

export type FingerCurl = 'extended' | 'curled';

export interface HandShape {
  hand: Handedness;
  shape: 'fist' | 'open' | 'pointUp' | 'pointDown' | 'pointLeft' | 'pointRight' | 'thumbUp' | 'thumbDown' | 'palmIn' | 'palmOut' | 'pinch' | 'unknown';
  wrist: Landmark;
}

export interface GestureFrame {
  hands: HandShape[];
  ts: number;
}

export interface PendingMove {
  face: Face;
  dir: 'CW' | 'CCW' | '180';
}

export type EmitMove = (move: Move) => void;
