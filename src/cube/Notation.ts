import type { Move, Face } from '../types';

export function expandHalfTurns(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    if (m.endsWith('2')) {
      const face = m[0] as Face;
      out.push(face, face);
    } else {
      out.push(m);
    }
  }
  return out;
}
