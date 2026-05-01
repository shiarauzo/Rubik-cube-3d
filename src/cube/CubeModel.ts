import Cube from 'cubejs';
import type { Move, StickerColor } from '../types';
import { FACE_COLOR } from '../types';
import { expandHalfTurns } from './Notation';

const FACE_LETTER_TO_COLOR: Record<string, StickerColor> = {
  U: FACE_COLOR.U,
  R: FACE_COLOR.R,
  F: FACE_COLOR.F,
  D: FACE_COLOR.D,
  L: FACE_COLOR.L,
  B: FACE_COLOR.B,
};

const COLOR_TO_FACE_LETTER: Record<StickerColor, string> = {
  W: 'U',
  R: 'R',
  G: 'F',
  Y: 'D',
  O: 'L',
  B: 'B',
};

export class CubeModel {
  private cube: Cube;

  constructor() {
    this.cube = new Cube();
  }

  applyMove(move: Move): void {
    this.cube.move(move);
  }

  applySequence(moves: Move[]): void {
    if (moves.length === 0) return;
    this.cube.move(moves.join(' '));
  }

  /** Returns the cube's facelet string (54 chars in URFDLB order). */
  getFacelets(): string {
    return this.cube.asString();
  }

  /** Returns the array of 54 sticker colors in URFDLB order. */
  getStickers(): StickerColor[] {
    const facelets = this.getFacelets();
    const out: StickerColor[] = new Array(54);
    for (let i = 0; i < 54; i++) {
      out[i] = FACE_LETTER_TO_COLOR[facelets[i]];
    }
    return out;
  }

  setFromFacelets(facelets: string): void {
    if (facelets.length !== 54) {
      throw new Error(`Facelet string must be 54 chars, got ${facelets.length}`);
    }
    this.cube = Cube.fromString(facelets);
  }

  setFromStickers(colors: StickerColor[]): void {
    if (colors.length !== 54) throw new Error('Need exactly 54 colors');
    const s = colors.map((c) => COLOR_TO_FACE_LETTER[c]).join('');
    this.setFromFacelets(s);
  }

  isSolved(): boolean {
    return this.cube.isSolved();
  }

  reset(): void {
    this.cube = new Cube();
  }

  clone(): CubeModel {
    const m = new CubeModel();
    m.cube = this.cube.clone();
    return m;
  }

  /** For solver IO: expand R2-style halves to atomic quarter pairs if needed. */
  static expandHalfTurns = expandHalfTurns;
}
