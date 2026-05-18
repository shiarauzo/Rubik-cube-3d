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

const VALID_FACELET_CHARS = /^[URFDLB]+$/;
const FACELET_LENGTH = 54;
const MIN_MAX_DEPTH = 1;
const MAX_MAX_DEPTH = 30;
const DEFAULT_MAX_DEPTH = 22;

function sendError(message: string): void {
  const out: ErrorMsg = { type: 'error', message };
  (self as unknown as Worker).postMessage(out);
}

function validateFacelets(facelets: unknown): facelets is string {
  if (typeof facelets !== 'string') {
    sendError('Facelets inválidos: debe ser una cadena de texto');
    return false;
  }
  if (facelets.length !== FACELET_LENGTH) {
    sendError(`Facelets inválidos: debe tener ${FACELET_LENGTH} caracteres (tiene ${facelets.length})`);
    return false;
  }
  if (!VALID_FACELET_CHARS.test(facelets)) {
    sendError('Facelets inválidos: solo se permiten caracteres U, R, F, D, L, B');
    return false;
  }
  return true;
}

function validateMaxDepth(maxDepth: unknown): number {
  if (maxDepth === undefined || maxDepth === null) {
    return DEFAULT_MAX_DEPTH;
  }
  if (typeof maxDepth !== 'number' || !Number.isInteger(maxDepth)) {
    return DEFAULT_MAX_DEPTH;
  }
  if (maxDepth < MIN_MAX_DEPTH || maxDepth > MAX_MAX_DEPTH) {
    return DEFAULT_MAX_DEPTH;
  }
  return maxDepth;
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  // Validate message type
  if (!msg || typeof msg !== 'object' || !('type' in msg)) {
    sendError('Mensaje inválido: falta el campo type');
    return;
  }

  try {
    if (msg.type === 'init') {
      ensureInit();
      const out: ReadyMsg = { type: 'ready' };
      (self as unknown as Worker).postMessage(out);
      return;
    }

    if (msg.type === 'solve') {
      // Validate facelets
      if (!validateFacelets(msg.facelets)) {
        return;
      }

      // Validate and sanitize maxDepth
      const maxDepth = validateMaxDepth(msg.maxDepth);

      ensureInit();

      try {
        const cube = Cube.fromString(msg.facelets);
        const solution = cube.solve(maxDepth);
        const moves = solution.split(/\s+/).filter(Boolean);
        const out: SolutionMsg = { type: 'solution', moves };
        (self as unknown as Worker).postMessage(out);
      } catch (cubeErr) {
        // Handle invalid cube state (unsolvable configuration)
        const errMsg = (cubeErr as Error).message;
        if (errMsg.includes('Invalid') || errMsg.includes('invalid')) {
          sendError('Configuración del cubo inválida: estado no resoluble');
        } else {
          sendError(`Error al resolver: ${errMsg}`);
        }
      }
      return;
    }

    // Unknown message type
    sendError(`Tipo de mensaje desconocido: ${String((msg as { type: unknown }).type)}`);
  } catch (err) {
    sendError((err as Error).message);
  }
};

export type { InMsg, OutMsg };
