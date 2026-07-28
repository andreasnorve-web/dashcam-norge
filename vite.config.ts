import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Dreper eksisterende SW hos brukere som har gammel PWA-cache.
      // Kamerastream i «app-modus» er upålitelig på iOS — vi vil ikke cache hardt.
      selfDestroying: true,
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
        // KRITISK: standalone/fullscreen bryter getUserMedia på mange iPhones.
        // browser = hjemskjerm åpner som Safari-fane der kamera fungerer.
        display: 'browser',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'nb',
        id: '/dashcam-camera-v3',
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
