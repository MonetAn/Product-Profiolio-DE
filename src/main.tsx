import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV) {
  console.info("[App] Загрузка приложения…");
}
createRoot(document.getElementById("root")!).render(<App />);
if (import.meta.env.DEV) {
  console.info("[App] React смонтирован");
}
