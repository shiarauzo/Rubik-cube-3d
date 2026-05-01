import type { Face } from '../../types';

const FACE_LABELS: Record<Face, string> = {
  U: 'Cara U (centro blanco)',
  R: 'Cara R (centro rojo)',
  F: 'Cara F (centro verde)',
  D: 'Cara D (centro amarillo)',
  L: 'Cara L (centro naranja)',
  B: 'Cara B (centro azul)',
};

export class GridOverlay {
  private ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  /** Returns the pixel rectangle of the 3x3 sampling area, in canvas coords. */
  computeRect(): { x: number; y: number; size: number } {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const size = Math.floor(Math.min(w, h) * 0.7);
    return { x: Math.floor((w - size) / 2), y: Math.floor((h - size) / 2), size };
  }

  draw(face: Face): void {
    const { x, y, size } = this.computeRect();
    const ctx = this.ctx;
    ctx.save();
    // The video is shown mirrored via CSS (scaleX(-1)), so mirror the canvas too
    // for a consistent visual frame.
    ctx.setTransform(-1, 0, 0, 1, this.canvas.width, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    const cell = size / 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cx = x + c * cell;
        const cy = y + r * cell;
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeRect(cx, cy, cell, cell);
      }
    }
    ctx.restore();

    // Label (drawn unmirrored)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, this.canvas.width, 28);
    ctx.fillStyle = '#fff';
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(FACE_LABELS[face], 8, 14);
    ctx.restore();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
