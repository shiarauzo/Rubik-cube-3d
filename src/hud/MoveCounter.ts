export class MoveCounter {
  private count = 0;

  constructor(private readonly el: HTMLElement) {
    this.render();
  }

  increment(): void {
    this.count += 1;
    this.render();
  }

  reset(): void {
    this.count = 0;
    this.render();
  }

  private render(): void {
    this.el.textContent = String(this.count);
  }
}
