import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] ,
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      },
      //includeAssets: ['favicon.ico'],
      //manifest: true
    })
  ],
  build: {
    // evita o warning de 500 kB
    chunkSizeWarningLimit: 2000,
  }
});
