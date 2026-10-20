import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['agrodoc-icon.svg'],
      manifest: {
        id: '/',
        name: 'AgroDoc Field Intelligence',
        short_name: 'AgroDoc',
        description: 'Tomato crop health monitoring and field intelligence.',
        theme_color: '#1c2a18',
        background_color: '#eef0f3',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/agrodoc-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'agrodoc-tomato-images',
              expiration: { maxEntries: 40, maxAgeSeconds: 2592000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'agrodoc-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 2592000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});