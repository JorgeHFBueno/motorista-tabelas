import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: [
        'logo_vetor.png',
        'perfil1.svg',
        'perfil2.svg',
        'icons/icon-192x192.png',
        'icons/icon-512x512.png'
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
      },      
    })
  ],
  build: {
    // evita o warning de 500 kB
    chunkSizeWarningLimit: 2000,
  }
});
