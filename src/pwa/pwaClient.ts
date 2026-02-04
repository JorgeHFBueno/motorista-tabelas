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

export function initPwa() {
  if (initialized) return;
  initialized = true;

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