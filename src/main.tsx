/*
 * PWA setup: manifest/service worker configurados para instalação offline.
 * Entrypoint registra o SW com autoUpdate e logs básicos de estado.
 * Arquivos ajustados: manifest.webmanifest, index.html e vite.config.ts.
 * TODO: substituir ícones placeholders por artes finais e adicionar UI para updates/offline.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);

const updateSW = registerSW({
  onNeedRefresh() {
    console.log('Nova versão da aplicação disponível. Atualize para obter as últimas melhorias.');
  },
  onOfflineReady() {
    console.log('Aplicação pronta para uso offline.');
  },
});

// Mantém referência para futuras interações (ex.: botão de atualizar)
void updateSW;