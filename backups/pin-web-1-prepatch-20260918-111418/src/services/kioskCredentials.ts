import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

export type KioskCredentialStatus = {
  uid: string;
  qrConfigured: boolean;
  qrRevoked: boolean;
  pinConfigured: boolean;
  pinEnabled: boolean;
  updatedAt: unknown | null;
  updatedBy: string | null;
};

export type ProvisionKioskCredentialResponse = {
  uid: string;
  nome: string;
  qrPayload: string;
  replaced: boolean;
};

const functions = getFunctions(app, 'us-central1');

export async function provisionKioskCredential(uid: string) {
  const callable = httpsCallable<{ uid: string }, ProvisionKioskCredentialResponse>(functions, 'provisionKioskCredential');
  return (await callable({ uid })).data;
}

export async function revokeKioskQr(uid: string) {
  const callable = httpsCallable<{ uid: string }, { uid: string; qrRevoked: true }>(functions, 'revokeKioskQr');
  return (await callable({ uid })).data;
}

export async function getKioskCredentialStatus(uids: string[]) {
  const callable = httpsCallable<{ uids: string[] }, { credentials: KioskCredentialStatus[] }>(functions, 'getKioskCredentialStatus');
  return (await callable({ uids })).data.credentials;
}
