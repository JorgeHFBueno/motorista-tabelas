import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(process.env.VITE_BUILD_ID ?? "dev"),
  },
  // Same Firebase web config as the WEB: the tracked .env (and .env.emulador) at the repository root.
  envDir: path.resolve(__dirname, ".."),
  server: {
    host: "::",
    // 8080 is the Firestore emulator of the repository root.
    port: 8081,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
