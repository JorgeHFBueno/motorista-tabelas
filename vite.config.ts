import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Versão nova fica esperando até o usuário clicar em "Atualizar agora" (PwaUpdateBanner).
      registerType: 'prompt',
      manifest: false,
      includeAssets: [
        'logo-ledur-branco.png',
        'apple-touch-icon.png',
        'perfil1.svg',
        'perfil2.svg',
        'icons/icon-192x192.png',
        'icons/icon-512x512.png'
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}'],
        globIgnores: ['**/react-plotly-*.js'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },      
    })
  ],
  build: {
    // evita o warning de 500 kB
    chunkSizeWarningLimit: 2000,
  }
});
