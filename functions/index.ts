import { onRequest } from 'firebase-functions/v2/https';
import app from './api.js';
import './firebaseAdmin.js';
import adminApp from './adminApi.js';
import mondaySyncApp, { mondayApiToken } from './mondaySync.js';
export { getKioskCredentialStatus, provisionKioskCredential, revokeKioskQr, setKioskPin, setKioskPinEnabled } from './kiosk/kioskAdmin.js';
export { kioskAuthenticatePin } from './kiosk/kioskAuth.js';
export { getVehicleErpCosts } from './vehicleReport.js';

export const api = onRequest(app);
export const adminApi = onRequest(adminApp);
export const mondaySync = onRequest({ region: 'southamerica-east1', secrets: [mondayApiToken] }, mondaySyncApp);
