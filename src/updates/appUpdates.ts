export const APP_UPDATE_INTERVAL = 5 * 60 * 1000;
export type UpdateState = {
  supported: boolean;
  available: boolean;
  checking: boolean;
  applying: boolean;
  error: string;
};
type Platform = {
  workers: ServiceWorkerContainer | undefined;
  online: () => boolean;
  reload: () => void;
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  visibility: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
};

/** Downloads updates in the background. Only an explicit action reloads this tab. */
export class AppUpdates {
  private state: UpdateState;
  private listeners = new Set<() => void>();
  private registration: ServiceWorkerRegistration | undefined;
  private started = false;
  private lastCheck = 0;
  private checking = false;
  private reloadRequested = false;
  private hadController = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private applyTimer: ReturnType<typeof setTimeout> | undefined;
  private observed = new Set<ServiceWorker>();
  constructor(private platform: Platform) {
    this.state = {
      supported: !!platform.workers,
      available: false,
      checking: false,
      applying: false,
      error: '',
    };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private inspect = () => {
    const registration = this.registration;
    if (registration?.waiting && this.platform.workers?.controller)
      this.patch({ available: true, error: '' });
    const worker = registration?.installing;
    if (!worker || this.observed.has(worker)) return;
    this.observed.add(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') this.inspect();
    });
  };
  private controllerChanged = () => {
    if (this.reloadRequested) {
      clearTimeout(this.applyTimer);
      this.platform.reload();
    } else if (this.hadController) {
      // Another tab may activate the worker; never reload this tab behind the user.
      this.patch({ available: true });
    }
    this.hadController = true;
  };
  private wake = () => {
    void this.check();
  };
  private visible = () => {
    if (this.platform.visibility.visibilityState === 'visible') this.wake();
  };
  start() {
    if (this.started || !this.platform.workers) return;
    this.started = true;
    this.hadController = !!this.platform.workers.controller;
    this.platform.workers.addEventListener('controllerchange', this.controllerChanged);
    this.platform.events.addEventListener('online', this.wake);
    this.platform.events.addEventListener('focus', this.wake);
    this.platform.visibility.addEventListener('visibilitychange', this.visible);
    this.timer = setInterval(this.wake, APP_UPDATE_INTERVAL);
    this.wake();
  }
  stop() {
    this.started = false;
    clearInterval(this.timer);
    clearTimeout(this.applyTimer);
    this.platform.workers?.removeEventListener('controllerchange', this.controllerChanged);
    this.platform.events.removeEventListener('online', this.wake);
    this.platform.events.removeEventListener('focus', this.wake);
    this.platform.visibility.removeEventListener('visibilitychange', this.visible);
    this.registration?.removeEventListener('updatefound', this.inspect);
  }
  async check(force = false) {
    if (!this.platform.workers || this.checking || !this.platform.online()) return;
    if (!force && this.lastCheck && Date.now() - this.lastCheck < APP_UPDATE_INTERVAL) return;
    this.checking = true;
    this.lastCheck = Date.now();
    this.patch({ checking: true, error: '' });
    try {
      if (!this.registration) {
        const base = import.meta.env.BASE_URL;
        this.registration = await this.platform.workers.register(`${base}sw.js`, {
          scope: base,
          updateViaCache: 'none',
        });
        this.registration.addEventListener('updatefound', this.inspect);
      } else if (!this.registration.installing) await this.registration.update();
      this.inspect();
    } catch {
      this.patch({ error: 'Não foi possível verificar atualizações. Tentaremos novamente.' });
    } finally {
      this.checking = false;
      this.patch({ checking: false });
    }
  }
  apply = () => {
    if (!this.state.available || this.state.applying) return;
    this.patch({ applying: true, error: '' });
    if (!this.registration?.waiting) {
      // The update was already activated by another tab.
      this.platform.reload();
      return;
    }
    this.reloadRequested = true;
    try {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      this.applyTimer = setTimeout(() => {
        this.reloadRequested = false;
        this.patch({
          applying: false,
          error: 'Não foi possível atualizar agora. Tente novamente.',
        });
      }, 15000);
    } catch {
      this.reloadRequested = false;
      this.patch({ applying: false, error: 'Não foi possível atualizar agora. Tente novamente.' });
    }
  };
}

export const appUpdates = new AppUpdates({
  workers: import.meta.env.PROD ? navigator.serviceWorker : undefined,
  online: () => navigator.onLine,
  reload: () => location.reload(),
  events: window,
  visibility: document,
});
