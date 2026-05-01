import type { Move } from '../types';
import { bus } from '../app/events';

export class Solver {
  private worker: Worker;
  private ready = false;
  private readyPromise: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    this.readyPromise = new Promise((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        const data = e.data;
        if (data.type === 'ready') {
          this.ready = true;
          this.worker.removeEventListener('message', onMsg);
          bus.emit('solver:ready', undefined);
          resolve();
        } else if (data.type === 'error') {
          this.worker.removeEventListener('message', onMsg);
          reject(new Error(data.message));
        }
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ type: 'init' });
    });
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  isReady(): boolean {
    return this.ready;
  }

  async solve(facelets: string): Promise<Move[]> {
    await this.readyPromise;
    bus.emit('solver:solving', undefined);
    return new Promise((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        const data = e.data;
        if (data.type === 'solution') {
          this.worker.removeEventListener('message', onMsg);
          const moves = data.moves as Move[];
          bus.emit('solver:solution', { moves });
          resolve(moves);
        } else if (data.type === 'error') {
          this.worker.removeEventListener('message', onMsg);
          bus.emit('solver:error', { message: data.message });
          reject(new Error(data.message));
        }
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ type: 'solve', facelets });
    });
  }
}
