import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEBUG_LOG = path.join(__dirname, ".cursor", "debug-e6c1ae.log");
function debugLog(msg: string, data: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, JSON.stringify({ t: Date.now(), msg, ...data }) + "\n");
  } catch {}
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/Product-Profiolio-DE/" : "/",
  server: {
    host: true,
    port: 8080,
    strictPort: false,
    open: true,
    hmr: { overlay: false },
  },
  // PostCSS только здесь — не читаем postcss.config.js с диска (на iCloud/синк-диске даёт ETIMEDOUT)
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  optimizeDeps: {
    entries: ["index.html"],
    holdUntilCrawlEnd: false,
    esbuildOptions: { target: "es2020" },
  },
  plugins: [
    react(),
    // Temporarily disabled to rule out preamble/load-order issues (see plan)
    // {
    //   name: "serve-index-first",
    //   configureServer(server) {
    //     const indexPath = path.join(__dirname, "index.html");
    //     const serveIndex = (
    //       req: { url?: string; method?: string },
    //       res: { setHeader: (k: string, v: string) => void; statusCode: number; end: (s: string) => void },
    //       next: () => void
    //     ) => {
    //       const pathname = (req.url ?? "").split("?")[0];
    //       if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    //         try {
    //           const html = fs.readFileSync(indexPath, "utf-8");
    //           res.setHeader("Content-Type", "text/html; charset=utf-8");
    //           res.statusCode = 200;
    //           res.end(html);
    //           return;
    //         } catch {
    //           // fallback to Vite
    //         }
    //       }
    //       next();
    //     };
    //     const logReq = (req: { url?: string; method?: string }, res: { statusCode: number; on: (e: string, fn: () => void) => void }, next: () => void) => {
    //       const url = req.url ?? "";
    //       debugLog("req.start", { url, method: req.method });
    //       res.on("finish", () => debugLog("req.finish", { url, status: res.statusCode }));
    //       next();
    //     };
    //     const m = server.middlewares as { stack?: { route: string; handle: (req: unknown, res: unknown, next: () => void) => void }[] };
    //     if (m.stack) {
    //       m.stack.unshift({ route: "", handle: serveIndex });
    //       m.stack.unshift({ route: "", handle: logReq });
    //     } else {
    //       server.middlewares.use(logReq);
    //       server.middlewares.use(serveIndex);
    //     }
    //   },
    // },
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
}));
