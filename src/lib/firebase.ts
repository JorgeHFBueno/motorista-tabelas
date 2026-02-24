import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const REQUIRED_FIREBASE_ENV_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const FIREBASE_RULES_PROJECT_ID = import.meta.env.VITE_FIREBASE_RULES_PROJECT_ID;

type RequiredEnvName = (typeof REQUIRED_FIREBASE_ENV_VARS)[number];

export let firebaseInitError: Error | null = null;

function validateFirebaseEnv(): void {
  const missingVars = REQUIRED_FIREBASE_ENV_VARS.filter((name) => {
    const value = import.meta.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingVars.length > 0) {
    // NÃO lança erro aqui para não derrubar a UI (white screen)
    firebaseInitError = new Error(`[Firebase] Missing env var ${missingVars[0]}`);
  }
}

function requireEnv(name: RequiredEnvName): string {
  // Ainda assim, garantimos string aqui; se faltar, vai virar "" e o init é bloqueado pelo validate
  const v = import.meta.env[name];
  return typeof v === "string" ? v : "";
}

// 1) valida env sem quebrar a renderização
validateFirebaseEnv();

// 2) só monta config se estiver tudo OK
const firebaseConfig =
  firebaseInitError === null
    ? {
        apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
        authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
        projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
        storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
        messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
        appId: requireEnv("VITE_FIREBASE_APP_ID"),
      }
    : null;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (firebaseConfig) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const { projectId, authDomain } = app.options;
    console.info("[Firebase][project-check] active config", { projectId, authDomain });

    if (
      typeof FIREBASE_RULES_PROJECT_ID === "string"
      && FIREBASE_RULES_PROJECT_ID.trim().length > 0
      && FIREBASE_RULES_PROJECT_ID !== projectId
    ) {
      console.error("[Firebase][project-check] mismatch", {
        activeProjectId: projectId,
        rulesProjectId: FIREBASE_RULES_PROJECT_ID,
        message:
          "As regras podem ter sido aplicadas em outro projeto Firebase. Verifique o VITE_FIREBASE_RULES_PROJECT_ID.",
      });
    }
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  } catch (error) {
    firebaseInitError =
      error instanceof Error
        ? error
        : new Error("[Firebase] Failed to initialize Firebase services.");
  }
}

// 4) authPersistenceReady sempre resolve (pra UI não travar)
const authPersistenceReady: Promise<void> = auth
  ? setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error("[Firebase] Erro ao configurar persistência de autenticação", error);
    })
  : Promise.resolve();

export { app, auth, db, storage, authPersistenceReady };

export function requireFirebase() {
  if (firebaseInitError) throw firebaseInitError;
  if (!app || !auth || !db || !storage) {
    throw new Error("[Firebase] Firebase not initialized.");
  }
  return { app, auth, db, storage, authPersistenceReady };
}