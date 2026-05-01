import { bus } from '../app/events';

export class Webcam {
  private stream: MediaStream | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(public readonly video: HTMLVideoElement) {}

  async start(): Promise<void> {
    if (this.stream) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err) {
      const e = err as DOMException;
      let msg = e.message || 'No se pudo acceder a la cámara';
      if (e.name === 'NotAllowedError') msg = 'Permiso de cámara denegado';
      else if (e.name === 'NotFoundError') msg = 'No se encontró ninguna cámara';
      bus.emit('cv:error', { message: msg });
      throw err;
    }
    this.video.srcObject = this.stream;
    this.readyPromise = new Promise<void>((resolve) => {
      const onReady = () => {
        this.video.removeEventListener('loadedmetadata', onReady);
        this.video.play().then(() => resolve()).catch(() => resolve());
      };
      if (this.video.readyState >= 2) onReady();
      else this.video.addEventListener('loadedmetadata', onReady);
    });
    await this.readyPromise;
    bus.emit('cv:camera-on', undefined);
  }

  stop(): void {
    if (!this.stream) return;
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    bus.emit('cv:camera-off', undefined);
  }

  isOn(): boolean {
    return this.stream !== null;
  }

  /** Width/height of the underlying video element, fallback to defaults. */
  getSize(): { w: number; h: number } {
    return {
      w: this.video.videoWidth || 640,
      h: this.video.videoHeight || 480,
    };
  }
}
