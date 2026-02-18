import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const REQUIRED_FIREBASE_ENV_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

function validateFirebaseEnv(): void {
  const missingVars = REQUIRED_FIREBASE_ENV_VARS.filter((name) => {
    const value = import.meta.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingVars.length > 0) {
    throw new Error(`[Firebase] Missing env var ${missingVars[0]}`);
  }  
}

function requireEnv(name: (typeof REQUIRED_FIREBASE_ENV_VARS)[number]): string {
  return import.meta.env[name];
}

validateFirebaseEnv();

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

const authPersistenceReady = setPersistence(auth, browserLocalPersistence);

export { app, auth, db, storage, authPersistenceReady };
