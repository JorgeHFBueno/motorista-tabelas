// Web config of the app-motor-api project, read from VITE_FIREBASE_* (portal/.env). No built-in fallback.
const readEnvValue = (name: string): string => {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
};

export const firebaseConfig = {
  apiKey: readEnvValue("VITE_FIREBASE_API_KEY"),
  authDomain: readEnvValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: readEnvValue("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: readEnvValue("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readEnvValue("VITE_FIREBASE_APP_ID"),
};

export const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
