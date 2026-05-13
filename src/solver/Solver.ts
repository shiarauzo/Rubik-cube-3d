import type { Move } from '../types';
import { bus } from '../app/events';

export class Solver {
  private worker: Worker;
  private ready = false;
  private readyPromise: Promise<void>;
  private pending = new Map<number, { resolve: (moves: Move[]) => void; reject: (err: Error) => void }>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });

    // Single permanent listener for all messages
    this.worker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data;

      // Handle solve responses with request correlation
      if (data.type === 'solution' || data.type === 'error') {
        const id = data.id;
        const handler = this.pending.get(id);
        if (!handler) return; // Ignore untracked responses

        this.pending.delete(id);

        if (data.type === 'solution') {
          const moves = data.moves as Move[];
          bus.emit('solver:solution', { moves });
          handler.resolve(moves);
        } else if (data.type === 'error') {
          bus.emit('solver:error', { message: data.message });
          handler.reject(new Error(data.message));
        }
      }
    });

    this.readyPromise = new Promise((resolve, reject) => {
      const onMsg = (e: MessageEvent) => {
        const data = e.data;
        if (data.type === 'ready') {
          this.ready = true;
          this.worker.removeEventListener('message', onMsg);
          bus.emit('solver:ready', undefined);
          resolve();
        } else if (data.type === 'error' && !data.id) {
          // Init error (no id)
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
    const id = this.nextId++;
    bus.emit('solver:solving', undefined);
    return new Promise<Move[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'solve', facelets, id });
    });
  }
}
