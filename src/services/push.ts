// Push dos avisos do sistema: liga, neste navegador, a notificação do sistema operacional (Windows, Android) para os
// avisos da pessoa. O aparelho fica em avisos/{uid}/dispositivos/{id}; a Function avisosPush envia a cada aviso novo,
// e o service worker do PWA (public/push-sw.js) mostra a notificação. Contrato: The Manuscript, avisos.md.
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { app, db } from '../firebase';

const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/** indisponivel: navegador sem push ou sistema sem service worker (ex.: em desenvolvimento). */
export type EstadoPush = 'indisponivel' | 'desligado' | 'bloqueado' | 'ligado';

export async function estadoPush(): Promise<EstadoPush> {
  if (!VAPID || !('serviceWorker' in navigator) || !('Notification' in window)) return 'indisponivel';
  if (!(await isSupported().catch(() => false)) || !(await navigator.serviceWorker.getRegistration())) return 'indisponivel';
  if (Notification.permission === 'denied') return 'bloqueado';
  return Notification.permission === 'granted' ? 'ligado' : 'desligado';
}

async function idDoAparelho(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].slice(0, 20).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Grava (ou renova) este navegador como aparelho da pessoa. Só com a permissão já dada. */
export async function registrarAparelho(uid: string): Promise<void> {
  const registro = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: registro });
  if (!token) return;
  await setDoc(doc(db, 'avisos', uid, 'dispositivos', await idDoAparelho(token)), {
    token, app: 'interno', navegador: navigator.userAgent.slice(0, 300), atualizadoEm: serverTimestamp(),
  });
}

/** Pede a permissão (precisa de um clique da pessoa) e grava o aparelho. Devolve o estado final. */
export async function ligarPush(uid: string): Promise<EstadoPush> {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'desligado';
  await registrarAparelho(uid);
  return 'ligado';
}
