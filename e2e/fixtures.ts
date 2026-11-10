import { test as base, expect } from '@playwright/test';
import { Backend, registerBackend } from './support/backend';
export const test = base.extend<{ backend: Backend }>({
  backend: async ({ context }, provide) => {
    const backend = new Backend();
    await backend.start();
    await backend.route(context);
    await provide(backend);
    await context.unrouteAll({ behavior: 'wait' });
    await backend.close();
  },
  page: async ({ page, backend }, provide) => {
    registerBackend(page, backend);
    await provide(page);
  },
});
export { expect };
