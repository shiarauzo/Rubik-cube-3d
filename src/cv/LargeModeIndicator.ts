import type { ModeColor, ControllerState } from './gestures/TwoHandController';

const COLOR_MAP: Record<ModeColor, string> = {
  white: '#ffffff',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
};

const HINT_MAP: Record<string, string> = {
  ROTAR: 'Mueve la mano para girar',
  MANIPULAR: 'Arrastra para mover capa',
  CARGANDO: 'Manten los punos...',
  RESOLVIENDO: 'Calculando solucion...',
};

export class LargeModeIndicator {
  private container: HTMLDivElement;
  private label: HTMLSpanElement;
  private hint: HTMLSpanElement;
  private lastState: ControllerState = 'IDLE';
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private fadeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'mode-indicator-large';
    this.container.innerHTML = `
      <span class="mode-label-large"></span>
      <span class="mode-hint-large"></span>
    `;
    parent.appendChild(this.container);

    this.label = this.container.querySelector('.mode-label-large')!;
    this.hint = this.container.querySelector('.mode-hint-large')!;
  }

  update(state: ControllerState, color: ModeColor, modeLabel: string): void {
    // Only show when state changes from IDLE to active state
    const isActive = state !== 'IDLE';
    const stateChanged = state !== this.lastState;

    if (stateChanged && isActive) {
      // Clear any pending timeouts
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      if (this.fadeTimeout) {
        clearTimeout(this.fadeTimeout);
        this.fadeTimeout = null;
      }

      // Update content
      this.label.textContent = modeLabel;
      this.hint.textContent = HINT_MAP[modeLabel] || '';
      this.container.style.setProperty('--mode-color', COLOR_MAP[color]);

      // Show indicator
      this.container.classList.remove('fade-out');
      this.container.classList.add('active');

      // Auto-hide after 1.5 seconds
      this.fadeTimeout = setTimeout(() => {
        this.container.classList.add('fade-out');
        this.hideTimeout = setTimeout(() => {
          this.container.classList.remove('active', 'fade-out');
        }, 200);
      }, 1500);
    }

    // For SOLVER_CHARGING state, keep showing
    if (state === 'SOLVER_CHARGING' || state === 'SOLVING') {
      if (this.fadeTimeout) {
        clearTimeout(this.fadeTimeout);
        this.fadeTimeout = null;
      }
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }

      this.label.textContent = modeLabel;
      this.hint.textContent = HINT_MAP[modeLabel] || '';
      this.container.style.setProperty('--mode-color', COLOR_MAP[color]);
      this.container.classList.remove('fade-out');
      this.container.classList.add('active');
    }

    this.lastState = state;
  }

  hide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = null;
    }
    this.container.classList.remove('active', 'fade-out');
    this.lastState = 'IDLE';
  }
}
