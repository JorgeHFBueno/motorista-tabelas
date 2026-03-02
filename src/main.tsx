import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("[build]", import.meta.env.MODE, "__BUILD__", __BUILD__);

createRoot(document.getElementById("root")!).render(<App />);