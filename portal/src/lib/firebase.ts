import { firebaseConfig, useFirebaseEmulators } from "@/config/firebaseConfig";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

export let firebaseInitError: Error | null = null;

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => value.length === 0)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  firebaseInitError = new Error(
    `[Firebase] Configuração ausente: ${missingKeys.join(", ")}. Defina VITE_FIREBASE_* em portal/.env.`,
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (firebaseInitError === null) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // Same emulator ports as the main app (firebase.json at the repository root).
    if (useFirebaseEmulators) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
    }
  } catch (error) {
    firebaseInitError =
      error instanceof Error ? error : new Error("[Firebase] Falha ao iniciar os serviços.");
  }
}

const authPersistenceReady: Promise<void> = auth
  ? setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error("[Firebase] Erro ao configurar persistência de autenticação", error);
    })
  : Promise.resolve();

export { app, auth, db, storage, authPersistenceReady };
