import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DEBUG_LOG = path.join(root, ".cursor", "debug-e6c1ae.log");
const startMs = Date.now();

function writeLog(message, data = {}) {
  try {
    const line =
      JSON.stringify({
        sessionId: "e6c1ae",
        timestamp: Date.now(),
        message,
        data: { ...data, hypothesisId: "startup", elapsedMs: Date.now() - startMs },
      }) + "\n";
    fs.appendFileSync(DEBUG_LOG, line);
  } catch (_) {}
}

writeLog("dev-with-timing: spawn vite", {});

const child = spawn("npm", ["run", "dev"], {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
});

let sawReady = false;
child.stdout?.on("data", (chunk) => {
  const s = chunk.toString();
  process.stdout.write(s);
  if (!sawReady && (s.includes("ready in") || s.includes("Local:"))) {
    sawReady = true;
    writeLog("dev-with-timing: vite ready in stdout", { elapsedMs: Date.now() - startMs });
  }
});
child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code) => {
  writeLog("dev-with-timing: vite process exit", { code, elapsedMs: Date.now() - startMs });
});
