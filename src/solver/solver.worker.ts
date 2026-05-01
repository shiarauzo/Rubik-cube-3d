import Cube from 'cubejs';

let initialized = false;

interface InitMsg { type: 'init' }
interface SolveMsg { type: 'solve'; facelets: string; maxDepth?: number }
type InMsg = InitMsg | SolveMsg;

interface ReadyMsg { type: 'ready' }
interface SolutionMsg { type: 'solution'; moves: string[] }
interface ErrorMsg { type: 'error'; message: string }
type OutMsg = ReadyMsg | SolutionMsg | ErrorMsg;

function ensureInit(): void {
  if (initialized) return;
  Cube.initSolver();
  initialized = true;
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      ensureInit();
      const out: ReadyMsg = { type: 'ready' };
      (self as unknown as Worker).postMessage(out);
      return;
    }
    if (msg.type === 'solve') {
      ensureInit();
      const cube = Cube.fromString(msg.facelets);
      const solution = cube.solve(msg.maxDepth ?? 22);
      const moves = solution.split(/\s+/).filter(Boolean);
      const out: SolutionMsg = { type: 'solution', moves };
      (self as unknown as Worker).postMessage(out);
      return;
    }
  } catch (err) {
    const out: ErrorMsg = { type: 'error', message: (err as Error).message };
    (self as unknown as Worker).postMessage(out);
  }
};

export type { InMsg, OutMsg };
