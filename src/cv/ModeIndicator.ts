import type { ModeColor, ControllerState } from './gestures/TwoHandController';

const COLOR_MAP: Record<ModeColor, string> = {
  white: '#ffffff',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
};

export class ModeIndicator {
  private container: HTMLDivElement;
  private label: HTMLSpanElement;
  private progressRing: SVGCircleElement;
  private progressContainer: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'mode-indicator';
    this.container.innerHTML = `
      <span class="mode-label"></span>
      <div class="solver-progress-container">
        <svg class="solver-progress-ring" viewBox="0 0 36 36">
          <circle class="progress-bg" cx="18" cy="18" r="15.9" />
          <circle class="progress-bar" cx="18" cy="18" r="15.9" />
        </svg>
      </div>
    `;
    parent.appendChild(this.container);

    this.label = this.container.querySelector('.mode-label')!;
    this.progressRing = this.container.querySelector('.progress-bar')!;
    this.progressContainer = this.container.querySelector('.solver-progress-container')!;
  }

  update(state: ControllerState, color: ModeColor, label: string, solverProgress: number): void {
    const isActive = state !== 'IDLE';
    this.container.classList.toggle('active', isActive);

    if (!isActive) return;

    this.label.textContent = label;
    this.container.style.setProperty('--mode-color', COLOR_MAP[color]);

    // Show/hide progress ring for solver charging
    const showProgress = state === 'SOLVER_CHARGING';
    this.progressContainer.classList.toggle('active', showProgress);

    if (showProgress) {
      // Circle circumference = 2 * PI * r = 2 * 3.14159 * 15.9 ≈ 100
      const circumference = 100;
      const offset = circumference * (1 - solverProgress);
      this.progressRing.style.strokeDashoffset = `${offset}`;
    }
  }

  hide(): void {
    this.container.classList.remove('active');
    this.progressContainer.classList.remove('active');
  }
}
