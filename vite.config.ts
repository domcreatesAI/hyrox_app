import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works from any host or sub-path (GitHub Pages, Netlify, etc.)
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Race Day CRM',
        short_name: 'Race CRM',
        description: 'Manage Hyrox race-day clients, start times, deposits, packages and music.',
        theme_color: '#111214',
        background_color: '#111214',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/__/],
        globPatterns: ['**/*.{js,css,html,svg,png}']
      }
    })
  ],
  server: { port: 5173, strictPort: true }
});
