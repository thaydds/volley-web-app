import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tokens } from '@beachsports/tokens';
import { VitePWA } from 'vite-plugin-pwa';

// Deployed under a GitHub Pages subpath, so scope/start_url/icons must use it too.
const base = '/volley-web-app/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Beach Sports — Vôlei',
        short_name: 'Beach Sports',
        description: 'Monte times, sorteie e acompanhe peladas de vôlei — offline e instalável.',
        lang: 'pt-BR',
        theme_color: tokens['--ds-color-action-default'],
        background_color: tokens['--ds-color-bg-base'],
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: base,
        start_url: base,
        icons: [
          {
            src: `${base}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: `${base}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        categories: ['sports', 'utilities'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globDirectory: 'dist',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    open: false,
  },
});
