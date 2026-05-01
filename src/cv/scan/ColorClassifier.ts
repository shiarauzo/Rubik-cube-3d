import type { StickerColor } from '../../types';
import type { RGB, HSV } from '../../util/color';
import { rgbToHsv, hueDist } from '../../util/color';

/**
 * Center-anchored HSV classifier.
 *
 * 1. Identifies the 6 center stickers by HSV rules.
 * 2. Classifies the remaining 48 by weighted HSV distance to the 6 centers,
 *    so it adapts to lighting (the centers ARE the per-session reference).
 * 3. Validates color counts (each must appear 9 times).
 */
export class ColorClassifier {
  classify(samples54: RGB[]): { stickers: StickerColor[]; ok: boolean; reason?: string } {
    if (samples54.length !== 54) throw new Error('expected 54 samples');
    const hsv: HSV[] = samples54.map((s) => rgbToHsv(s));

    const centerIdxs = [4, 13, 22, 31, 40, 49];
    const centerHsv = centerIdxs.map((i) => hsv[i]);

    const centerLabels = centerHsv.map((h) => labelByHsvRule(h));
    const labelSet = new Set(centerLabels);
    if (labelSet.size !== 6 || centerLabels.includes(null as unknown as StickerColor)) {
      return {
        stickers: [],
        ok: false,
        reason: 'Centros ambiguos: revisa la iluminación o vuelve a escanear.',
      };
    }

    const stickers: StickerColor[] = new Array(54);
    for (let i = 0; i < 54; i++) {
      const ci = centerIdxs.indexOf(i);
      if (ci !== -1) {
        stickers[i] = centerLabels[ci]!;
      } else {
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < 6; k++) {
          const d = hsvDist(hsv[i], centerHsv[k]);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        stickers[i] = centerLabels[best]!;
      }
    }

    const counts: Record<StickerColor, number> = { W: 0, Y: 0, R: 0, O: 0, G: 0, B: 0 };
    for (const s of stickers) counts[s]++;
    for (const c of Object.keys(counts) as StickerColor[]) {
      if (counts[c] !== 9) {
        return {
          stickers,
          ok: false,
          reason: `Conteos inválidos (${c}=${counts[c]}). Reintenta el escaneo.`,
        };
      }
    }

    return { stickers, ok: true };
  }
}

function labelByHsvRule(h: HSV): StickerColor | null {
  if (h.v < 0.18) return null;
  if (h.s < 0.22 && h.v > 0.55) return 'W';
  if (h.s < 0.22) return null;
  const hue = h.h;
  if (hue < 15 || hue >= 340) return 'R';
  if (hue >= 15 && hue < 38) return 'O';
  if (hue >= 38 && hue < 75) return 'Y';
  if (hue >= 75 && hue < 170) return 'G';
  if (hue >= 170 && hue < 265) return 'B';
  // 265-340 falls in red/magenta range; treat as R if very saturated.
  return 'R';
}

function hsvDist(a: HSV, b: HSV): number {
  const hueWeight = a.s > 0.25 && b.s > 0.25 ? 2.0 : 0;
  const dh = hueDist(a.h, b.h) / 180; // normalize to 0..1
  const ds = Math.abs(a.s - b.s);
  const dv = Math.abs(a.v - b.v);
  return hueWeight * dh * dh + 1.0 * ds * ds + 0.7 * dv * dv;
}
