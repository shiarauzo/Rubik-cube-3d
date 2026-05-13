export interface TutorialStep {
  title: string;
  description: string;
  icon: string;
  gesture: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'ROTAR',
    description: 'Mueve tu mano izquierda por la pantalla para rotar el cubo y verlo desde diferentes angulos.',
    icon: '✋',
    gesture: 'Mano abierta',
  },
  {
    title: 'MOVER CAPAS',
    description: 'Haz pinch (junta pulgar e indice) y arrastra para girar una capa del cubo.',
    icon: '🤏',
    gesture: 'Pinch + arrastrar',
  },
  {
    title: 'RESOLVER',
    description: 'Cierra ambos punos y mantenlos 1.5 segundos para activar el solucionador automatico.',
    icon: '✊',
    gesture: 'Dos punos',
  },
];

export class ARTutorial {
  private container: HTMLDivElement;
  private currentStep = 0;
  private visible = false;
  private onComplete: (() => void) | null = null;
  private hasShownBefore = false;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'ar-tutorial';
    this.container.innerHTML = this.buildHTML();
    parent.appendChild(this.container);

    this.bindEvents();

    // Check if user has seen tutorial before
    this.hasShownBefore = localStorage.getItem('ar-tutorial-seen') === 'true';
  }

  private buildHTML(): string {
    const stepsHTML = TUTORIAL_STEPS.map((step, i) => `
      <div class="tutorial-step ${i === 0 ? 'active' : ''}" data-step="${i}">
        <div class="step-icon">${step.icon}</div>
        <div class="step-content">
          <h4 class="step-title">${step.title}</h4>
          <p class="step-description">${step.description}</p>
          <span class="step-gesture">${step.gesture}</span>
        </div>
      </div>
    `).join('');

    const dotsHTML = TUTORIAL_STEPS.map((_, i) => `
      <button class="tutorial-dot ${i === 0 ? 'active' : ''}" data-step="${i}" aria-label="Paso ${i + 1}"></button>
    `).join('');

    return `
      <div class="tutorial-backdrop"></div>
      <div class="tutorial-card">
        <div class="tutorial-header">
          <span class="tutorial-badge">MODO AR</span>
          <h3>Controles por Gestos</h3>
        </div>
        <div class="tutorial-steps">
          ${stepsHTML}
        </div>
        <div class="tutorial-footer">
          <div class="tutorial-dots">
            ${dotsHTML}
          </div>
          <div class="tutorial-actions">
            <button class="tutorial-btn secondary tutorial-skip">Saltar</button>
            <button class="tutorial-btn primary tutorial-next">
              <span class="next-text">Siguiente</span>
              <span class="done-text">Empezar</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const nextBtn = this.container.querySelector('.tutorial-next')!;
    const skipBtn = this.container.querySelector('.tutorial-skip')!;
    const dots = this.container.querySelectorAll('.tutorial-dot');
    const backdrop = this.container.querySelector('.tutorial-backdrop')!;

    nextBtn.addEventListener('click', () => this.nextStep());
    skipBtn.addEventListener('click', () => this.complete());
    backdrop.addEventListener('click', () => this.complete());

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => this.goToStep(i));
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if (e.key === 'Escape') this.complete();
      if (e.key === 'ArrowRight' || e.key === 'Enter') this.nextStep();
      if (e.key === 'ArrowLeft') this.prevStep();
    });
  }

  private goToStep(index: number): void {
    if (index < 0 || index >= TUTORIAL_STEPS.length) return;

    this.currentStep = index;
    const steps = this.container.querySelectorAll('.tutorial-step');
    const dots = this.container.querySelectorAll('.tutorial-dot');

    steps.forEach((step, i) => {
      step.classList.toggle('active', i === index);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });

    // Update button text on last step
    const isLast = index === TUTORIAL_STEPS.length - 1;
    this.container.classList.toggle('last-step', isLast);
  }

  private nextStep(): void {
    if (this.currentStep < TUTORIAL_STEPS.length - 1) {
      this.goToStep(this.currentStep + 1);
    } else {
      this.complete();
    }
  }

  private prevStep(): void {
    if (this.currentStep > 0) {
      this.goToStep(this.currentStep - 1);
    }
  }

  show(onComplete?: () => void): void {
    if (this.hasShownBefore) {
      onComplete?.();
      return;
    }

    this.onComplete = onComplete ?? null;
    this.currentStep = 0;
    this.goToStep(0);
    this.visible = true;
    this.container.classList.add('active');
  }

  private complete(): void {
    this.visible = false;
    this.container.classList.remove('active');
    localStorage.setItem('ar-tutorial-seen', 'true');
    this.hasShownBefore = true;
    this.onComplete?.();
  }

  /** Force show even if seen before (for help button) */
  forceShow(onComplete?: () => void): void {
    this.hasShownBefore = false;
    this.show(onComplete);
    this.hasShownBefore = true; // Reset after showing
  }

  hide(): void {
    this.visible = false;
    this.container.classList.remove('active');
  }

  isVisible(): boolean {
    return this.visible;
  }
}
