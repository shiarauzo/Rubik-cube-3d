import type { Move, Face } from '../types';
import { FACES } from '../types';

const SUFFIXES = ['', "'", '2'] as const;

const OPPOSITE: Record<Face, Face> = {
  U: 'D', D: 'U',
  R: 'L', L: 'R',
  F: 'B', B: 'F',
};

export function generateScramble(length = 22): Move[] {
  const out: Move[] = [];
  let lastFace: Face | null = null;
  let prevFace: Face | null = null;
  while (out.length < length) {
    const face = FACES[Math.floor(Math.random() * 6)];
    if (face === lastFace) continue;
    if (lastFace && OPPOSITE[face] === lastFace && prevFace === face) continue;
    const suffix = SUFFIXES[Math.floor(Math.random() * 3)];
    out.push(`${face}${suffix}` as Move);
    prevFace = lastFace;
    lastFace = face;
  }
  return out;
}
