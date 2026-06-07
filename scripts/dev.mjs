import { spawn } from "node:child_process"

const processes = [
  spawn("node", ["scripts/codex-bridge.mjs"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CODEX_BRIDGE_PORT: process.env.CODEX_BRIDGE_PORT ?? "8787" },
  }),
  spawn("vite", ["--host", "0.0.0.0"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
]

function shutdown(code = 0) {
  for (const child of processes) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown(code)
  })
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))
