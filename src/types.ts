export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export type Suffix = '' | "'" | '2';
export type Move = `${Face}${Suffix}`;

export type StickerColor = 'W' | 'Y' | 'R' | 'O' | 'G' | 'B';

export type Mode = 'mouse' | 'gestures' | 'scan';

export const FACE_COLOR: Record<Face, StickerColor> = {
  U: 'W',
  R: 'R',
  F: 'G',
  D: 'Y',
  L: 'O',
  B: 'B',
};

export const COLOR_HEX: Record<StickerColor, number> = {
  W: 0xf5f5f5,
  Y: 0xffd400,
  R: 0xc62828,
  O: 0xef6c00,
  G: 0x2e7d32,
  B: 0x1565c0,
};
