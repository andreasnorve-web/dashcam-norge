import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icon-180.png',
        'icon-192.png',
        'icon-512.png',
      ],
      manifest: {
        name: 'Dashcam Norge',
        short_name: 'Dashcam',
        description:
          'Mobil dashcam med veibaner, skilt, bensinpriser og varsler',
        theme_color: '#0c1118',
        background_color: '#0c1118',
        // browser/minimal-ui: installerbar uten iOS-standalone som ofte bryter kamera.
        display: 'minimal-ui',
        display_override: ['minimal-ui', 'browser'],
        orientation: 'any',
        start_url: '/?source=pwa',
        scope: '/',
        lang: 'nb',
        id: '/dashcam-camera-v4',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
