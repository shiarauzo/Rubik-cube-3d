export type CameraErrorReason = 'denied' | 'not-found' | 'unknown';

interface ModalMessages {
  title: string;
  body: string;
  instructions: string;
}

export class CameraPermissionModal {
  private modal: HTMLDivElement | null = null;
  private onRetry: (() => void) | null = null;

  show(reason: CameraErrorReason, onRetry?: () => void): void {
    this.onRetry = onRetry ?? null;
    this.hide(); // Remove any existing modal

    const messages = this.getMessages(reason);

    this.modal = document.createElement('div');
    this.modal.className = 'camera-modal';
    this.modal.setAttribute('role', 'alertdialog');
    this.modal.setAttribute('aria-labelledby', 'camera-modal-title');
    this.modal.setAttribute('aria-describedby', 'camera-modal-desc');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.innerHTML = `
      <div class="camera-modal-content">
        <div class="camera-modal-icon">${this.getIcon(reason)}</div>
        <h3 id="camera-modal-title">${messages.title}</h3>
        <p id="camera-modal-desc">${messages.body}</p>
        <div class="camera-modal-instructions">${messages.instructions}</div>
        <div class="camera-modal-actions">
          ${onRetry ? '<button class="hud-btn primary camera-modal-retry">Reintentar</button>' : ''}
          <button class="hud-btn camera-modal-close">Cerrar</button>
        </div>
      </div>
    `;
    document.getElementById('hud-root')!.appendChild(this.modal);

    const closeBtn = this.modal.querySelector('.camera-modal-close')!;
    closeBtn.addEventListener('click', () => this.hide());

    const retryBtn = this.modal.querySelector('.camera-modal-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.hide();
        this.onRetry?.();
      });
    }

    // Close on Escape
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.modal) {
        this.hide();
        window.removeEventListener('keydown', onEscape);
      }
    };
    window.addEventListener('keydown', onEscape);

    // Focus the close button
    (closeBtn as HTMLButtonElement).focus();
  }

  hide(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  private getMessages(reason: CameraErrorReason): ModalMessages {
    switch (reason) {
      case 'denied':
        return {
          title: 'Cámara bloqueada',
          body: 'Para usar el modo AR, permite el acceso a la cámara en tu navegador.',
          instructions: this.getBrowserInstructions(),
        };
      case 'not-found':
        return {
          title: 'Cámara no encontrada',
          body: 'No se detectó ninguna cámara en este dispositivo.',
          instructions: 'Conecta una cámara web o usa un dispositivo con cámara integrada.',
        };
      default:
        return {
          title: 'Error de cámara',
          body: 'No se pudo acceder a la cámara.',
          instructions: 'Intenta recargar la página o usar otro navegador.',
        };
    }
  }

  private getBrowserInstructions(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      return 'Haz clic en el icono de candado <kbd>🔒</kbd> junto a la URL → Configuración del sitio → Cámara → Permitir';
    }
    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      return 'Safari → Preferencias → Sitios web → Cámara → Permitir para este sitio';
    }
    if (ua.includes('Firefox')) {
      return 'Haz clic en el icono de candado <kbd>🔒</kbd> junto a la URL → Permisos → Cámara → Permitir';
    }
    if (ua.includes('Edg')) {
      return 'Haz clic en el icono de candado <kbd>🔒</kbd> junto a la URL → Permisos para este sitio → Cámara → Permitir';
    }
    return 'Busca los permisos de cámara en la configuración de tu navegador y permite el acceso para este sitio.';
  }

  private getIcon(reason: CameraErrorReason): string {
    switch (reason) {
      case 'denied':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="16" height="12" rx="2"/><path d="M18 10l4-2v8l-4-2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
      case 'not-found':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="16" height="12" rx="2"/><path d="M18 10l4-2v8l-4-2"/><circle cx="10" cy="12" r="2"/><path d="M10 9v0"/></svg>';
      default:
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>';
    }
  }
}
