import type { ServiceAccount } from 'firebase-admin';
import { type App, type AppOptions, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function resolveAdminOptions(): AppOptions | undefined {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!rawServiceAccount) {
    return undefined;
  }

  try {
    const serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
    return { credential: cert(serviceAccount) };
  } catch (error) {
    console.warn('Ignoring invalid FIREBASE_SERVICE_ACCOUNT_JSON during Firebase Admin initialization.', error);
    return undefined;
  }
}

const app: App = getApps()[0] ?? initializeApp(resolveAdminOptions());
const db = getFirestore(app);
const adminAuth = getAuth(app);

export { app, db, adminAuth };
