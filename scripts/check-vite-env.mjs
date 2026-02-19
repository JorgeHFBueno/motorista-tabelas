import { loadEnv } from "vite";

const mode = process.argv[2] || "production";
const env = loadEnv(mode, process.cwd(), "VITE_");

const keys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const missing = keys.filter((k) => !env[k] || !String(env[k]).trim());

console.log("mode:", mode);
console.log("missing:", missing);
process.exit(missing.length ? 1 : 0);
