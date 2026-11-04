import { loadEnv } from "vite";

const mode = process.argv[2] || "development";
const env = loadEnv(mode, process.cwd(), "VITE_");

const projectId = env.VITE_FIREBASE_PROJECT_ID || "(missing)";
const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN || "(missing)";
const rulesProjectId = env.VITE_FIREBASE_RULES_PROJECT_ID || "(not-set)";

console.log("[Firebase project check]");
console.log("mode:", mode);
console.log("projectId:", projectId);
console.log("authDomain:", authDomain);
console.log("rulesProjectId:", rulesProjectId);

if (rulesProjectId !== "(not-set)" && rulesProjectId !== projectId) {
  console.error(
    "[Firebase project check] Divergência detectada: VITE_FIREBASE_PROJECT_ID != VITE_FIREBASE_RULES_PROJECT_ID.",
  );
  process.exit(1);
}