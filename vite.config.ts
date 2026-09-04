import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Cache all built assets (JS, CSS, HTML) so the app shell loads offline
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB — bundle is ~2.2 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // MoneyFlow's Web Share Target handler. generateSW writes the worker for
        // us, so a custom fetch listener has to arrive this way.
        importScripts: ['/share-handler.js'],
        // Return cached app shell for any navigation (SPA fallback)
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Runtime cache for Firebase/CDN requests
        runtimeCaching: [
          {
            // Firestore REST API — network first, fall back to cache
            urlPattern: /^https:\/\/firestore\.googleapis\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'Utility Kit',
        short_name: 'UtilKit',
        theme_color: '#242424',
        background_color: '#242424',
        display: 'standalone',
        icons: [
          { src: '/vite.svg', sizes: '48x48', type: 'image/svg+xml' },
        ],
        // Long-pressing the installed Utility Kit icon on Android lists these;
        // a shortcut can then be dragged straight onto the home screen.
        shortcuts: [
          {
            name: 'Fuel & Trip Tracker',
            short_name: 'Fuel Log',
            description: 'Log a vehicle trip and fuel fill',
            url: '/fuel',
            icons: [{ src: '/fuel-icon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
          {
            name: 'MoneyFlow',
            short_name: 'MoneyFlow',
            description: 'Log a cash in or cash out transaction',
            url: '/money',
            icons: [{ src: '/money-icon.svg', sizes: 'any', type: 'image/svg+xml' }],
          },
        ],
      },
    }),
  ],
})
