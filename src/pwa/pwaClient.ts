import { registerSW } from 'virtual:pwa-register';

type PwaStatus = {
  offlineReady: boolean;
  needRefresh: boolean;
  updateServiceWorker?: (reloadPage?: boolean) => void;
};

type PwaListener = (status: PwaStatus) => void;

let initialized = false;
let status: PwaStatus = { offlineReady: false, needRefresh: false };
const listeners = new Set<PwaListener>();

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

export function initPwa() {
  if (initialized) return;
  initialized = true;

  const updateSW = registerSW({
    onNeedRefresh() {
      status = { offlineReady: status.offlineReady, needRefresh: true, updateServiceWorker: updateSW };
      notify();
    },
    onOfflineReady() {
      status = { offlineReady: true, needRefresh: status.needRefresh, updateServiceWorker: updateSW };
      notify();
    },
  });
}