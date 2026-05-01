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
  onScanCapture: () => void;
  onScanRestart: () => void;
}

export class Hud {
  readonly timer: Timer;
  readonly moves: MoveCounter;
  private modeButtons: Record<Mode, HTMLButtonElement>;
  private cameraBtn: HTMLButtonElement;
  private solveBtn: HTMLButtonElement;
  private scrambleBtn: HTMLButtonElement;
  private scanPanel: HTMLDivElement;
  private gestureHint: HTMLDivElement;
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
        <button data-mode="gestures">Gestos</button>
        <button data-mode="scan">Escanear</button>
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
      gestures: bar.querySelector<HTMLButtonElement>('button[data-mode="gestures"]')!,
      scan: bar.querySelector<HTMLButtonElement>('button[data-mode="scan"]')!,
    };
    for (const m of ['mouse', 'gestures', 'scan'] as Mode[]) {
      this.modeButtons[m].addEventListener('click', () => handlers.onModeChange(m));
    }

    this.cameraBtn = bar.querySelector<HTMLButtonElement>('#hud-camera')!;
    this.cameraBtn.addEventListener('click', handlers.onCameraToggle);

    this.scanPanel = document.createElement('div');
    this.scanPanel.id = 'scan-panel';
    this.scanPanel.innerHTML = `
      <h3>Escaneo del cubo</h3>
      <div class="progress" id="scan-progress"></div>
      <p id="scan-msg">Muestra la cara <b>U</b> (blanca) hacia la cámara y pulsa <kbd>Espacio</kbd> o el botón.</p>
      <div class="actions">
        <button class="hud-btn primary" id="scan-capture">Capturar</button>
        <button class="hud-btn" id="scan-restart">Reiniciar</button>
      </div>
    `;
    document.getElementById('hud-root')!.appendChild(this.scanPanel);
    this.scanPanel.querySelector<HTMLButtonElement>('#scan-capture')!.addEventListener('click', handlers.onScanCapture);
    this.scanPanel.querySelector<HTMLButtonElement>('#scan-restart')!.addEventListener('click', handlers.onScanRestart);

    this.gestureHint = document.createElement('div');
    this.gestureHint.id = 'gesture-hint';
    this.gestureHint.innerHTML = `
      <h3>Modo gestos (dos manos)</h3>
      <p>
        <b>Izquierda</b> elige cara: índice ↑ <code>U</code>, → <code>R</code>, ↓ <code>D</code>, ← <code>L</code>;
        palma hacia ti <code>F</code>, palma fuera <code>B</code>.<br/>
        <b>Derecha</b> confirma: 👍 / swipe der → <b>CW</b>; 👎 / swipe izq → <b>CCW</b>.
      </p>
    `;
    document.getElementById('hud-root')!.appendChild(this.gestureHint);

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
      this.modeButtons[k].classList.toggle('active', k === m);
    }
    this.scanPanel.classList.toggle('active', m === 'scan');
    this.gestureHint.classList.toggle('active', m === 'gestures');
  }

  setScanProgress(faceIndex: number, total: number, msg: string): void {
    const prog = this.scanPanel.querySelector<HTMLDivElement>('#scan-progress')!;
    prog.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const span = document.createElement('span');
      if (i < faceIndex) span.className = 'done';
      else if (i === faceIndex) span.className = 'current';
      prog.appendChild(span);
    }
    this.scanPanel.querySelector<HTMLElement>('#scan-msg')!.innerHTML = msg;
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
