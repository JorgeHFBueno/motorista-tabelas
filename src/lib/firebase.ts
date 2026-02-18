import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

function requireEnv(name: string): string {
  const v = (import.meta as any).env?.[name] as string | undefined;
  if (!v || !String(v).trim()) {
    // Erro explícito pra não virar "tela branca"
    throw new Error(`[Firebase] Missing env var ${name}. Verifique seu .env antes do build/deploy.`);
  }
  return v;
}

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv("VITE_FIREBASE_APP_ID"),
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// opcional: não exportar promise se não usa; mas pode manter
const authPersistenceReady = setPersistence(auth, browserLocalPersistence);

export { app, auth, db, storage, authPersistenceReady };
