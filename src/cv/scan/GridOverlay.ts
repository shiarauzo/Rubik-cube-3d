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

    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    const cell = size / 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cx = x + c * cell;
        const cy = y + r * cell;
        ctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
      }
    }
    // Soft outer rim
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
    ctx.restore();

    // Label (drawn unmirrored)
    ctx.save();
    ctx.fillStyle = 'rgba(20, 22, 28, 0.55)';
    ctx.fillRect(0, 0, this.canvas.width, 26);
    ctx.fillStyle = '#fafaf7';
    ctx.font = "500 12px 'Inter', ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = 'middle';
    ctx.fillText(FACE_LABELS[face], 10, 13);
    ctx.restore();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
