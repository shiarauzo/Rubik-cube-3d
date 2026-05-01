import type { RGB } from '../../util/color';
import { medianRgb } from '../../util/color';

const PATCH = 5;            // 5x5 px
const SAMPLES_PER_CELL = 5; // center + 4 nearby

/**
 * Sample 9 colors from a video frame inside a centered 3x3 grid.
 * Reads from an offscreen, *unmirrored* canvas, regardless of how the
 * preview is displayed. Returns 9 RGB colors in row-major order.
 */
export class ColorSampler {
  private offscreen: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.offscreen = document.createElement('canvas');
    this.ctx = this.offscreen.getContext('2d', { willReadFrequently: true })!;
  }

  capture(video: HTMLVideoElement): RGB[] {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (this.offscreen.width !== w) this.offscreen.width = w;
    if (this.offscreen.height !== h) this.offscreen.height = h;
    this.ctx.drawImage(video, 0, 0, w, h);

    const size = Math.floor(Math.min(w, h) * 0.7);
    const x0 = Math.floor((w - size) / 2);
    const y0 = Math.floor((h - size) / 2);
    const cell = size / 3;

    const out: RGB[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cx = x0 + c * cell + cell / 2;
        const cy = y0 + r * cell + cell / 2;
        const samples: RGB[] = [];
        const offsets = [
          [0, 0],
          [-cell * 0.18, -cell * 0.18],
          [cell * 0.18, -cell * 0.18],
          [-cell * 0.18, cell * 0.18],
          [cell * 0.18, cell * 0.18],
        ];
        for (let i = 0; i < SAMPLES_PER_CELL; i++) {
          const px = Math.round(cx + offsets[i][0] - PATCH / 2);
          const py = Math.round(cy + offsets[i][1] - PATCH / 2);
          samples.push(this.averagePatch(px, py));
        }
        out.push(medianRgb(samples));
      }
    }
    return out;
  }

  private averagePatch(x: number, y: number): RGB {
    const data = this.ctx.getImageData(x, y, PATCH, PATCH).data;
    let r = 0, g = 0, b = 0;
    const n = PATCH * PATCH;
    for (let i = 0; i < n; i++) {
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
    }
    return { r: r / n, g: g / n, b: b / n };
  }
}
