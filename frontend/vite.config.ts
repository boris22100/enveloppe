import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: "autoUpdate",
      useCredentials: true,
      useCredentials: true,
      manifest: {
        id: '/',
        name: 'Enveloppe',
        short_name: 'Enveloppe',
        description: 'Webmail JMAP ultraléger multi-serveurs',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0D1B2A',
        background_color: '#08101A',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } }
});
