export interface TutorialStep {
  icon: string;
  action: string;
  hint: string;
  gesture: 'open' | 'pinch' | 'fist';
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: '✋',
    action: 'Abre la mano y muevela',
    hint: '↑ ↓ para rotar',
    gesture: 'open'
  },
  {
    icon: '🤏',
    action: 'Pinch y arrastra',
    hint: 'para mover capas',
    gesture: 'pinch'
  },
  {
    icon: '✊✊',
    action: 'Dos punos 1.5s',
    hint: 'para resolver',
    gesture: 'fist'
  },
];

export class ARTutorial {
  private container: HTMLDivElement;
  private currentStep = 0;
  private visible = false;
  private onComplete: (() => void) | null = null;
  private hasShownBefore = false;
  private gestureDetected = false;
  private gestureHoldTime = 0;
  private readonly GESTURE_HOLD_MS = 800;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'ar-hint';
    parent.appendChild(this.container);

    this.hasShownBefore = localStorage.getItem('ar-tutorial-seen') === 'true';
  }

  private render(): void {
    const step = TUTORIAL_STEPS[this.currentStep];
    const animClass = step.gesture === 'open' ? 'anim-wave' : step.gesture === 'pinch' ? 'anim-pinch' : 'anim-fist';

    this.container.innerHTML = `
      <div class="ar-hint-content">
        <span class="ar-hint-icon ${animClass}">${step.icon}</span>
        <span class="ar-hint-text">${step.action}<span class="hint-action">${step.hint}</span></span>
        <span class="ar-hint-step">${this.currentStep + 1}/${TUTORIAL_STEPS.length}</span>
      </div>
    `;
  }

  /** Call this every frame with detected gesture */
  update(detectedGesture: 'open' | 'pinch' | 'fist' | 'none'): void {
    if (!this.visible) return;

    const step = TUTORIAL_STEPS[this.currentStep];

    if (detectedGesture === step.gesture) {
      if (!this.gestureDetected) {
        this.gestureDetected = true;
        this.gestureHoldTime = performance.now();
        this.container.classList.add('detecting');
      } else if (performance.now() - this.gestureHoldTime > this.GESTURE_HOLD_MS) {
        this.container.classList.remove('detecting');
        this.container.classList.add('success');

        setTimeout(() => {
          this.container.classList.remove('success');
          this.nextStep();
        }, 400);

        this.gestureDetected = false;
      }
    } else {
      this.gestureDetected = false;
      this.container.classList.remove('detecting');
    }
  }

  private nextStep(): void {
    if (this.currentStep < TUTORIAL_STEPS.length - 1) {
      this.currentStep++;
      this.render();
    } else {
      this.complete();
    }
  }

  show(onComplete?: () => void): void {
    if (this.hasShownBefore) {
      onComplete?.();
      return;
    }

    this.onComplete = onComplete ?? null;
    this.currentStep = 0;
    this.gestureDetected = false;
    this.visible = true;
    this.render();
    this.container.classList.add('active');
  }

  private complete(): void {
    this.visible = false;
    this.container.classList.remove('active', 'detecting', 'success');
    localStorage.setItem('ar-tutorial-seen', 'true');
    this.hasShownBefore = true;
    this.onComplete?.();
  }

  forceShow(onComplete?: () => void): void {
    this.hasShownBefore = false;
    this.show(onComplete);
    this.hasShownBefore = true;
  }

  hide(): void {
    this.visible = false;
    this.container.classList.remove('active', 'detecting', 'success');
  }

  isVisible(): boolean {
    return this.visible;
  }

  skip(): void {
    this.complete();
  }
}
