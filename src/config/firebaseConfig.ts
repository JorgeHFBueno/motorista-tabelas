const FIREBASE_PREVIEW_FALLBACK = {
  apiKey: "__LOVABLE_FIREBASE_API_KEY__",
  authDomain: "__LOVABLE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__LOVABLE_FIREBASE_PROJECT_ID__",
  storageBucket: "__LOVABLE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__LOVABLE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__LOVABLE_FIREBASE_APP_ID__",
} as const;

function readEnvValue(name: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function resolveConfigValue(envName: string, fallback: string): { value: string; source: "env" | "fallback" } {
  const envValue = readEnvValue(envName);
  if (envValue.length > 0) {
    return { value: envValue, source: "env" };
  }

  return { value: fallback.trim(), source: "fallback" };
}

const apiKey = resolveConfigValue("VITE_FIREBASE_API_KEY", FIREBASE_PREVIEW_FALLBACK.apiKey);
const authDomain = resolveConfigValue("VITE_FIREBASE_AUTH_DOMAIN", FIREBASE_PREVIEW_FALLBACK.authDomain);
const projectId = resolveConfigValue("VITE_FIREBASE_PROJECT_ID", FIREBASE_PREVIEW_FALLBACK.projectId);
const storageBucket = resolveConfigValue(
  "VITE_FIREBASE_STORAGE_BUCKET",
  FIREBASE_PREVIEW_FALLBACK.storageBucket,
);
const messagingSenderId = resolveConfigValue(
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  FIREBASE_PREVIEW_FALLBACK.messagingSenderId,
);
const appId = resolveConfigValue("VITE_FIREBASE_APP_ID", FIREBASE_PREVIEW_FALLBACK.appId);

export const firebaseConfig = {
  apiKey: apiKey.value,
  authDomain: authDomain.value,
  projectId: projectId.value,
  storageBucket: storageBucket.value,
  messagingSenderId: messagingSenderId.value,
  appId: appId.value,
};

export const firebaseConfigSource = {
  apiKey: apiKey.source,
  authDomain: authDomain.source,
  projectId: projectId.source,
  storageBucket: storageBucket.source,
  messagingSenderId: messagingSenderId.source,
  appId: appId.source,
};