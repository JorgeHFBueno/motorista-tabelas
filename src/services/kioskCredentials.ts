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

export type SetKioskPinResponse = { uid: string; pinConfigured: true; pinEnabled: true };
export type SetKioskPinEnabledResponse = { uid: string; pinConfigured: boolean; pinEnabled: boolean };

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

export async function setKioskPin(uid: string, pin: string) {
  const callable = httpsCallable<{ uid: string; pin: string }, SetKioskPinResponse>(functions, 'setKioskPin');
  return (await callable({ uid, pin })).data;
}

export async function setKioskPinEnabled(uid: string, enabled: boolean) {
  const callable = httpsCallable<{ uid: string; enabled: boolean }, SetKioskPinEnabledResponse>(functions, 'setKioskPinEnabled');
  return (await callable({ uid, enabled })).data;
}
