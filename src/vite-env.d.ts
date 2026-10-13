/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const UPDATE_SW: () => void;

interface RegisterSWOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}

declare function registerSW(options?: RegisterSWOptions): {
  update: () => void;
  unregister: () => Promise<boolean>;
};
