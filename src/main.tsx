import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("[build]", import.meta.env.MODE, "__BUILD__", __BUILD__);
console.log("[DIAG] import.meta.env.MODE:", import.meta.env.MODE);
console.log("[DIAG] Service Worker ativo:", "serviceWorker" in navigator);

createRoot(document.getElementById("root")!).render(<App />);