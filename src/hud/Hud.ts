import type { Mode } from '../types';
import { bus } from '../app/events';
import { Timer } from './Timer';
import { MoveCounter } from './MoveCounter';

export interface HudHandlers {
  onScramble: () => void;
  onReset: () => void;
  onSolve: () => void;
  onModeChange: (m: Mode) => void;
  onCameraToggle: () => void;
}

export class Hud {
  readonly timer: Timer;
  readonly moves: MoveCounter;
  private modeButtons: Record<Mode, HTMLButtonElement>;
  private cameraBtn: HTMLButtonElement;
  private solveBtn: HTMLButtonElement;
  private scrambleBtn: HTMLButtonElement;
  private arHint: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private toastTimeout: number | null = null;

  constructor(root: HTMLElement, handlers: HudHandlers) {
    const bar = document.createElement('div');
    bar.className = 'hud-bar';
    bar.innerHTML = `
      <div class="hud-stat"><span class="hud-label">Tiempo</span><span class="hud-value" id="hud-time">0:00.00</span></div>
      <div class="hud-stat"><span class="hud-label">Mov.</span><span class="hud-value" id="hud-moves">0</span></div>
      <button class="hud-btn" id="hud-scramble">Mezclar</button>
      <button class="hud-btn" id="hud-reset">Reset</button>
      <button class="hud-btn primary" id="hud-solve">Resolver</button>
      <div class="hud-mode" id="hud-mode">
        <button data-mode="mouse" class="active">Ratón</button>
        <button data-mode="ar">AR</button>
      </div>
      <button class="hud-btn" id="hud-camera">Cámara on</button>
    `;
    root.appendChild(bar);

    this.timer = new Timer(bar.querySelector('#hud-time')!);
    this.moves = new MoveCounter(bar.querySelector('#hud-moves')!);

    this.scrambleBtn = bar.querySelector<HTMLButtonElement>('#hud-scramble')!;
    this.scrambleBtn.addEventListener('click', handlers.onScramble);

    bar.querySelector<HTMLButtonElement>('#hud-reset')!.addEventListener('click', handlers.onReset);

    this.solveBtn = bar.querySelector<HTMLButtonElement>('#hud-solve')!;
    this.solveBtn.addEventListener('click', handlers.onSolve);
    this.solveBtn.disabled = true;

    this.modeButtons = {
      mouse: bar.querySelector<HTMLButtonElement>('button[data-mode="mouse"]')!,
      ar: bar.querySelector<HTMLButtonElement>('button[data-mode="ar"]')!,
    } as Record<Mode, HTMLButtonElement>;
    for (const m of ['mouse', 'ar'] as Mode[]) {
      this.modeButtons[m].addEventListener('click', () => handlers.onModeChange(m));
    }

    this.cameraBtn = bar.querySelector<HTMLButtonElement>('#hud-camera')!;
    this.cameraBtn.addEventListener('click', handlers.onCameraToggle);

    this.arHint = document.createElement('div');
    this.arHint.id = 'gesture-hint';
    this.arHint.innerHTML = `
      <h3>Modo AR</h3>
      <p>
        <b>Mano derecha</b>: mueve para rotar el cubo.<br/>
        <b>Mano abierta</b> → vista frontal.
      </p>
      <p>
        <b>Pellizca</b> en una celda de la cuadrícula y arrastra<br/>
        para girar esa fila o columna.
      </p>
    `;
    document.getElementById('hud-root')!.appendChild(this.arHint);

    this.toastEl = document.getElementById('toast') as HTMLDivElement;

    this.bindEvents();
  }

  private bindEvents(): void {
    bus.on('move:applied', () => {
      this.moves.increment();
      if (!this.timer.isRunning()) this.timer.startNow();
    });
    bus.on('cube:solved', () => {
      this.timer.pause();
      this.toast('¡Resuelto! 🎉', 'info');
    });
    bus.on('cube:reset', () => {
      this.timer.reset();
      this.moves.reset();
    });
    bus.on('cube:scrambled', () => {
      this.timer.reset();
      this.moves.reset();
    });
    bus.on('solver:ready', () => {
      this.solveBtn.disabled = false;
    });
    bus.on('solver:solving', () => {
      this.solveBtn.disabled = true;
      this.solveBtn.textContent = 'Resolviendo…';
    });
    bus.on('solver:solution', () => {
      this.solveBtn.disabled = false;
      this.solveBtn.textContent = 'Resolver';
    });
    bus.on('solver:error', ({ message }) => {
      this.solveBtn.disabled = false;
      this.solveBtn.textContent = 'Resolver';
      this.toast(`Solver: ${message}`, 'error');
    });
    bus.on('cv:error', ({ message }) => this.toast(`CV: ${message}`, 'error'));
    bus.on('cv:camera-on', () => (this.cameraBtn.textContent = 'Cámara off'));
    bus.on('cv:camera-off', () => (this.cameraBtn.textContent = 'Cámara on'));
    bus.on('toast', ({ message, kind }) => this.toast(message, kind ?? 'info'));
  }

  setMode(m: Mode): void {
    for (const k of Object.keys(this.modeButtons) as Mode[]) {
      if (this.modeButtons[k]) {
        this.modeButtons[k].classList.toggle('active', k === m);
      }
    }
    this.arHint.classList.toggle('active', m === 'ar');
  }

  toast(message: string, kind: 'info' | 'warn' | 'error' = 'info'): void {
    this.toastEl.textContent = message;
    this.toastEl.className = `show ${kind}`;
    if (this.toastTimeout) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.className = '';
    }, 2400);
  }
}
