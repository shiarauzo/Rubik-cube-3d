export class Timer {
  private start: number | null = null;
  private elapsed = 0;
  private rafId: number | null = null;

  constructor(private readonly el: HTMLElement) {
    this.render();
  }

  startNow(): void {
    if (this.start !== null) return;
    this.start = performance.now();
    this.tick();
  }

  pause(): void {
    if (this.start === null) return;
    this.elapsed += performance.now() - this.start;
    this.start = null;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.render();
  }

  reset(): void {
    this.start = null;
    this.elapsed = 0;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.render();
  }

  isRunning(): boolean {
    return this.start !== null;
  }

  private tick = (): void => {
    this.render();
    if (this.start !== null) this.rafId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    const total = this.elapsed + (this.start !== null ? performance.now() - this.start : 0);
    const seconds = total / 1000;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds * 100) % 100);
    this.el.textContent = `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }
}
