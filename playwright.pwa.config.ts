import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './pwa-e2e',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4178/volley-web-app/',
    viewport: { width: 320, height: 852 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/pwa-test-server.mjs',
    url: 'http://127.0.0.1:4178/volley-web-app/',
    timeout: 60000,
    reuseExistingServer: false,
  },
});
