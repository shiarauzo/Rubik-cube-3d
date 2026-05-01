import type { Face, StickerColor } from '../../types';
import type { Webcam } from '../Webcam';
import { ColorSampler } from './ColorSampler';
import { ColorClassifier } from './ColorClassifier';
import { GridOverlay } from './GridOverlay';
import { bus } from '../../app/events';

/** Scan order matches cubejs facelet ordering: U, R, F, D, L, B. */
const SCAN_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

const FACE_LABEL: Record<Face, string> = {
  U: 'Cara U (blanca, arriba)',
  R: 'Cara R (roja, derecha)',
  F: 'Cara F (verde, frente)',
  D: 'Cara D (amarilla, abajo)',
  L: 'Cara L (naranja, izquierda)',
  B: 'Cara B (azul, atrás)',
};

export interface ScanResult {
  stickers54: StickerColor[];
}

export class ScanController {
  private current = 0;
  private buffer: StickerColor[] = [];
  private sampler = new ColorSampler();
  private classifier = new ColorClassifier();
  private rawByFace: { face: Face; rgbs: ReturnType<ColorSampler['capture']> }[] = [];

  constructor(
    private readonly webcam: Webcam,
    private readonly overlay: GridOverlay,
    private readonly onComplete: (res: ScanResult) => void,
  ) {}

  start(): void {
    this.current = 0;
    this.buffer = [];
    this.rawByFace = [];
    this.refresh();
  }

  reset(): void {
    this.start();
  }

  /** Trigger a capture of the current face. Advances internal state. */
  capture(): void {
    if (!this.webcam.isOn()) {
      bus.emit('toast', { message: 'Activa la cámara primero', kind: 'warn' });
      return;
    }
    const face = SCAN_ORDER[this.current];
    const rgbs = this.sampler.capture(this.webcam.video);
    this.rawByFace.push({ face, rgbs });
    this.current += 1;

    if (this.current >= SCAN_ORDER.length) {
      this.classifyAll();
    } else {
      bus.emit('scan:progress', { faceIndex: this.current, total: 6 });
      this.refresh();
    }
  }

  /** Render the grid overlay for the current face. */
  refresh(): void {
    if (this.current < SCAN_ORDER.length) {
      const face = SCAN_ORDER[this.current];
      const { w, h } = this.webcam.getSize();
      this.overlay.resize(w, h);
      this.overlay.draw(face);
      bus.emit('scan:progress', { faceIndex: this.current, total: 6 });
    } else {
      this.overlay.clear();
    }
  }

  faceLabel(): string {
    if (this.current >= SCAN_ORDER.length) return 'Procesando…';
    return FACE_LABEL[SCAN_ORDER[this.current]];
  }

  isComplete(): boolean {
    return this.current >= SCAN_ORDER.length;
  }

  private classifyAll(): void {
    const all: ReturnType<ColorSampler['capture']> = [];
    for (const f of SCAN_ORDER) {
      const entry = this.rawByFace.find((e) => e.face === f)!;
      all.push(...entry.rgbs);
    }
    const result = this.classifier.classify(all);
    if (!result.ok) {
      bus.emit('toast', { message: result.reason ?? 'Escaneo inválido', kind: 'error' });
      this.start();
      return;
    }
    this.buffer = result.stickers;
    bus.emit('scan:complete', undefined);
    this.onComplete({ stickers54: this.buffer });
  }
}
