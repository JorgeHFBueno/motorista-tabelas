import { firebaseConfig, firebaseConfigSource } from "@/config/firebaseConfig";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const FIREBASE_RULES_PROJECT_ID = import.meta.env.VITE_FIREBASE_RULES_PROJECT_ID;

const CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

const PLACEHOLDER_PREFIX = "__LOVABLE_FIREBASE_";

type FirebaseConfigKey = (typeof CONFIG_KEYS)[number];

export let firebaseInitError: Error | null = null;

function isPlaceholder(value: string): boolean {
  return value.startsWith(PLACEHOLDER_PREFIX) && value.endsWith("__");
}

function validateFirebaseConfig(): void {
  const missingKeys = CONFIG_KEYS.filter((key) => {
    const value = firebaseConfig[key];
    return typeof value !== "string" || value.trim().length === 0 || isPlaceholder(value.trim());
  });

  if (missingKeys.length > 0) {
    const firstMissing = missingKeys[0];
    const configSource = firebaseConfigSource[firstMissing as FirebaseConfigKey];
    const keyLabel = `VITE_FIREBASE_${firstMissing.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase()}`;

firebaseInitError = new Error(
      `[Firebase] Missing config ${keyLabel}. Fonte atual: ${configSource}. Defina env VITE_FIREBASE_* ou ajuste o fallback em src/config/firebaseConfig.ts`,
    );
  }
}

validateFirebaseConfig();

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (firebaseInitError === null) {
    try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    if (import.meta.env.DEV) {
      console.info("[Firebase] Config loaded", {
        projectId: firebaseConfig.projectId,
        source: firebaseConfigSource.projectId,
      });
    }

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