import { onRequest } from 'firebase-functions/v2/https';
import app from './api.js';
import './firebaseAdmin.js';
import adminApp from './adminApi.js';
export { getKioskCredentialStatus, provisionKioskCredential, revokeKioskQr, setKioskPin, setKioskPinEnabled } from './kiosk/kioskAdmin.js';
export { kioskAuthenticatePin } from './kiosk/kioskAuth.js';

export const api = onRequest(app);
export const adminApi = onRequest(adminApp);
