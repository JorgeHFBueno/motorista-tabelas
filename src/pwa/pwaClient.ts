import { registerSW } from 'virtual:pwa-register';

type PwaStatus = {
  offlineReady: boolean;
  needRefresh: boolean;
  updating: boolean;
  updateError?: string;
  updateServiceWorker?: (reloadPage?: boolean) => void;
};

type PwaListener = (status: PwaStatus) => void;

let initialized = false;
let status: PwaStatus = { offlineReady: false, needRefresh: false, updating: false };
const listeners = new Set<PwaListener>();
let updateTimeout: ReturnType<typeof setTimeout> | undefined;
let devCleanupStarted = false;

function notify() {
  listeners.forEach((listener) => listener(status));
}

export function subscribePwaStatus(listener: PwaListener) {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

function setStatus(next: PwaStatus) {
  status = next;
  notify();
}

function startUpdate(reloadPage = true) {
  if (!status.updateServiceWorker) return;
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  setStatus({ ...status, needRefresh: false, updating: true, updateError: undefined });

  updateTimeout = setTimeout(() => {
    setStatus({
      ...status,
      updating: false,
      updateError: 'Não foi possível aplicar a atualização automaticamente.',
    });
  }, 15000);

  status.updateServiceWorker(reloadPage);
}

export function requestPwaUpdate(reloadPage = true) {
  startUpdate(reloadPage);
}

export function clearPwaUpdateError() {
  if (!status.updateError) return;
  setStatus({ ...status, updating: false, updateError: undefined });
}

async function cleanupDevServiceWorkers() {
  if (devCleanupStarted || !('serviceWorker' in navigator)) return;
  devCleanupStarted = true;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.scope.startsWith(window.location.origin))
        .map((registration) => registration.unregister()),
    );

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => (
            cacheName.includes('workbox') ||
            cacheName.includes('precache') ||
            cacheName.includes('vite-pwa')
          ))
          .map((cacheName) => caches.delete(cacheName)),
      );
    }
  } catch (error) {
    console.warn('[pwa] falha ao limpar service worker/cache no dev', error);
  }
}

export function initPwa() {
  if (initialized) return;
  initialized = true;

  if (!import.meta.env.PROD) {
    void cleanupDevServiceWorkers();
    return;
  }

  const updateSW = registerSW({
    onNeedRefresh() {
      const autoUpdate = true;
      const nextStatus = { ...status, needRefresh: !autoUpdate, updateServiceWorker: updateSW };
      setStatus(nextStatus);
      if (autoUpdate) {
        startUpdate(true);
      }
    },
    onOfflineReady() {
      setStatus({ ...status, offlineReady: true, updateServiceWorker: updateSW });
    },
  });
}
