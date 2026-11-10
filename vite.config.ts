import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative assets keep the frontend portable for GitHub Pages project URLs.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Monoflow — Focus Timer',
        short_name: 'Monoflow',
        description: 'One thing. One flow. Your distraction-free focus companion.',
        theme_color: '#0e0c1e',
        background_color: '#0e0c1e',
        display: 'standalone',
        orientation: 'any',
        scope: './',
        start_url: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ]
});
