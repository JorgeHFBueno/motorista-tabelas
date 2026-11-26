import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
// Cache local do Firestore em todas as abas e no PWA, compartilhado entre elas: com ele, reabrir uma consulta em até
// 30 minutos cobra só os documentos que mudaram. O enableIndexedDbPersistence de antes só ligava o cache na primeira
// aba; as outras (e o PWA aberto junto do navegador) liam tudo de novo a cada abertura.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const storage = getStorage(app);
export const functions = getFunctions(app, 'southamerica-east1');
const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

if (useFirebaseEmulators) {
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export const analytics = useFirebaseEmulators ? null : getAnalytics(app);
