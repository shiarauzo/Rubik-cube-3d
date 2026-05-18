import type { Move } from '../types';
import { bus } from '../app/events';

const DEFAULT_SOLVER_TIMEOUT_MS = 30_000;
const SOLVER_TIMEOUT_MESSAGE = 'El solucionador tardó demasiado. Intenta reiniciar el cubo.';
const SOLVER_WORKER_ERROR_MESSAGE = 'Error del solucionador';

export class Solver {
  private worker: Worker;
  private ready = false;
  private readyPromise: Promise<void>;

  constructor() {
    this.worker = this.createWorker();
    this.readyPromise = this.initWorker();
  }

  private createWorker(): Worker {
    return new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  }

  private initWorker(): Promise<void> {
    this.ready = false;
    const worker = this.worker;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener('message', onMsg);
        worker.removeEventListener('error', onError);
      };
      const onMsg = (e: MessageEvent) => {
        const data = e.data;
        if (data.type === 'ready') {
          this.ready = true;
          cleanup();
          bus.emit('solver:ready', undefined);
          resolve();
        } else if (data.type === 'error') {
          cleanup();
          reject(new Error(data.message));
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || SOLVER_WORKER_ERROR_MESSAGE));
      };

      worker.addEventListener('message', onMsg);
      worker.addEventListener('error', onError);
      worker.postMessage({ type: 'init' });
    });
  }

  private restartWorker(failedWorker: Worker): void {
    failedWorker.terminate();
    if (this.worker === failedWorker) {
      this.worker = this.createWorker();
      this.readyPromise = this.initWorker();
    }
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  isReady(): boolean {
    return this.ready;
  }

  async solve(facelets: string, timeoutMs = DEFAULT_SOLVER_TIMEOUT_MS): Promise<Move[]> {
    await this.readyPromise;
    bus.emit('solver:solving', undefined);
    const worker = this.worker;

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId: number | undefined;

      const cleanup = () => {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
        worker.removeEventListener('message', onMsg);
        worker.removeEventListener('error', onError);
      };

      const fail = (message: string, restartWorker: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        bus.emit('solver:error', { message });
        if (restartWorker) {
          this.restartWorker(worker);
        }
        reject(new Error(message));
      };

      const onMsg = (e: MessageEvent) => {
        const data = e.data;
        if (data.type === 'solution') {
          if (settled) return;
          settled = true;
          cleanup();
          const moves = data.moves as Move[];
          bus.emit('solver:solution', { moves });
          resolve(moves);
        } else if (data.type === 'error') {
          fail(data.message, false);
        }
      };

      const onError = (event: ErrorEvent) => {
        console.error('[Solver] Worker error:', event.error ?? event.message);
        fail(event.message || SOLVER_WORKER_ERROR_MESSAGE, true);
      };

      timeoutId = window.setTimeout(() => {
        fail(SOLVER_TIMEOUT_MESSAGE, true);
      }, timeoutMs);

      worker.addEventListener('message', onMsg);
      worker.addEventListener('error', onError);
      worker.postMessage({ type: 'solve', facelets });
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.ready = false;
  }
}
