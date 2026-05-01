import type { Move, Face } from '../types';
import { FACES } from '../types';

const FACE_SET = new Set<Face>(FACES);

export function parseSequence(input: string): Move[] {
  if (!input.trim()) return [];
  const tokens = input.trim().split(/\s+/);
  const out: Move[] = [];
  for (const tok of tokens) {
    if (tok.length === 0) continue;
    if (tok.length > 2) throw new Error(`Invalid move "${tok}"`);
    const face = tok[0] as Face;
    if (!FACE_SET.has(face)) throw new Error(`Invalid face "${tok[0]}"`);
    if (tok.length === 1) {
      out.push(face);
    } else if (tok[1] === "'" || tok[1] === '2') {
      out.push((face + tok[1]) as Move);
    } else {
      throw new Error(`Invalid suffix "${tok[1]}"`);
    }
  }
  return out;
}

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

export function inverse(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i];
    const face = m[0] as Face;
    if (m.endsWith("'")) out.push(face);
    else if (m.endsWith('2')) out.push(m);
    else out.push(`${face}'` as Move);
  }
  return out;
}

export function movesToString(moves: Move[]): string {
  return moves.join(' ');
}
