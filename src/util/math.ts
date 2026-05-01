export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeInOutQuart = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

export const TAU = Math.PI * 2;

export function snapToLattice(v: number): number {
  return Math.round(v);
}
