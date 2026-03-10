import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initPerfDiagnostics } from "@/lib/perfDiagnostics";

if (import.meta.env.DEV) {
  console.info("[App] Загрузка приложения…");
}
initPerfDiagnostics();
createRoot(document.getElementById("root")!).render(<App />);
if (import.meta.env.DEV) {
  console.info("[App] React смонтирован");
}
