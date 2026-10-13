import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/roster/**/*.{ts,tsx}',
        'src/matchmaking/**/*.{ts,tsx}',
        'src/home/**/*.{ts,tsx}',
        'src/matches/**/*.{ts,tsx}',
      ],
    },
  },
});
