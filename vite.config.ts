import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // В dev — корень (localhost:8080/), для GitHub Pages — base репозитория
  base: mode === 'production' ? '/Product-Profiolio-DE/' : '/',
  server: {
    host: true,
    port: 8080,
    strictPort: false,
    open: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
