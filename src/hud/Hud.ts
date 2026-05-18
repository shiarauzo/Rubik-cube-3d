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
  private keyboardHelpBtn: HTMLButtonElement;
  private keyboardModal: HTMLDivElement | null = null;
  private arHint: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private toastTimeout: number | null = null;

  constructor(root: HTMLElement, handlers: HudHandlers) {
    const bar = document.createElement('div');
    bar.className = 'hud-bar';
    bar.innerHTML = `
      <div class="hud-stat" aria-label="Tiempo transcurrido">
        <span class="hud-label" id="time-label">Tiempo</span>
        <span class="hud-value" id="hud-time" role="timer" aria-labelledby="time-label" aria-live="off">0:00.00</span>
      </div>
      <div class="hud-stat" aria-label="Contador de movimientos">
        <span class="hud-label" id="moves-label">Mov.</span>
        <span class="hud-value" id="hud-moves" aria-labelledby="moves-label" aria-live="polite" aria-atomic="true">0</span>
      </div>
      <button class="hud-btn" id="hud-scramble" aria-label="Mezclar el cubo de Rubik">Mezclar</button>
      <button class="hud-btn" id="hud-reset" aria-label="Reiniciar el cubo">Reset</button>
      <button class="hud-btn primary" id="hud-solve" aria-label="Resolver automáticamente el cubo">Resolver</button>
      <div class="hud-mode" id="hud-mode" role="group" aria-label="Modo de control">
        <button data-mode="mouse" class="active" aria-pressed="true" aria-label="Modo ratón - controlar con mouse">Ratón</button>
        <button data-mode="ar" aria-pressed="false" aria-label="Modo AR - controlar con gestos de mano">AR</button>
      </div>
      <button class="hud-btn" id="hud-camera" aria-label="Encender cámara">Cámara on</button>
      <button class="hud-btn" id="hud-keyboard-help" aria-label="Mostrar atajos de teclado" title="Atajos de teclado">⌨</button>
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

    this.keyboardHelpBtn = bar.querySelector<HTMLButtonElement>('#hud-keyboard-help')!;
    this.keyboardHelpBtn.addEventListener('click', () => this.toggleKeyboardHelp());

    this.arHint = document.createElement('div');
    this.arHint.id = 'gesture-hint';
    this.arHint.innerHTML = `
      <h3>Modo AR - Gestos</h3>
      <p>
        <b>Mano izquierda abierta</b> <code>palmOut</code><br/>
        Activa rotación. Mueve la derecha para rotar.
      </p>
      <p>
        <b>Mano izquierda hacia ti</b> <code>palmIn</code><br/>
        Snap a la cara más cercana.
      </p>
      <p>
        <b>Pellizca con izquierda</b> <code>pinch</code><br/>
        Activa cuadrícula. Arrastra con la derecha.
      </p>
      <p>
        <b>Ambos puños</b> <code>fist + fist</code> 1.5s<br/>
        Resolver el cubo automáticamente.
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
    bus.on('cv:camera-on', () => {
      this.cameraBtn.textContent = 'Cámara off';
      this.cameraBtn.setAttribute('aria-label', 'Apagar cámara');
    });
    bus.on('cv:camera-off', () => {
      this.cameraBtn.textContent = 'Cámara on';
      this.cameraBtn.setAttribute('aria-label', 'Encender cámara');
    });
    bus.on('toast', ({ message, kind }) => this.toast(message, kind ?? 'info'));
  }

  setMode(m: Mode): void {
    for (const k of Object.keys(this.modeButtons) as Mode[]) {
      if (this.modeButtons[k]) {
        const isActive = k === m;
        this.modeButtons[k].classList.toggle('active', isActive);
        this.modeButtons[k].setAttribute('aria-pressed', String(isActive));
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

  private toggleKeyboardHelp(): void {
    if (this.keyboardModal) {
      this.keyboardModal.remove();
      this.keyboardModal = null;
      return;
    }

    this.keyboardModal = document.createElement('div');
    this.keyboardModal.className = 'keyboard-modal';
    this.keyboardModal.setAttribute('role', 'dialog');
    this.keyboardModal.setAttribute('aria-labelledby', 'keyboard-modal-title');
    this.keyboardModal.setAttribute('aria-modal', 'true');
    this.keyboardModal.innerHTML = `
      <div class="keyboard-modal-content">
        <h3 id="keyboard-modal-title">Atajos de Teclado</h3>
        <div class="keyboard-shortcuts">
          <div class="shortcut"><kbd>R</kbd> / <kbd>Shift+R</kbd><span>Cara derecha (R / R')</span></div>
          <div class="shortcut"><kbd>U</kbd> / <kbd>Shift+U</kbd><span>Cara superior (U / U')</span></div>
          <div class="shortcut"><kbd>F</kbd> / <kbd>Shift+F</kbd><span>Cara frontal (F / F')</span></div>
          <div class="shortcut"><kbd>L</kbd> / <kbd>Shift+L</kbd><span>Cara izquierda (L / L')</span></div>
          <div class="shortcut"><kbd>D</kbd> / <kbd>Shift+D</kbd><span>Cara inferior (D / D')</span></div>
          <div class="shortcut"><kbd>B</kbd> / <kbd>Shift+B</kbd><span>Cara trasera (B / B')</span></div>
        </div>
        <button class="hud-btn keyboard-modal-close" aria-label="Cerrar modal de atajos">Cerrar</button>
      </div>
    `;
    document.getElementById('hud-root')!.appendChild(this.keyboardModal);

    const closeBtn = this.keyboardModal.querySelector('.keyboard-modal-close')!;
    closeBtn.addEventListener('click', () => this.toggleKeyboardHelp());

    // Close on Escape key
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.keyboardModal) {
        this.toggleKeyboardHelp();
        window.removeEventListener('keydown', onEscape);
      }
    };
    window.addEventListener('keydown', onEscape);

    // Focus the close button for accessibility
    (closeBtn as HTMLButtonElement).focus();
  }
}
