import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const viteEntry = path.join(rootDir, "node_modules", "vite", "bin", "vite.js")

const processes = [
  spawn(process.execPath, [path.join(rootDir, "scripts", "codex-bridge.mjs")], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, CODEX_BRIDGE_PORT: process.env.CODEX_BRIDGE_PORT ?? "8787" },
  }),
  spawn(process.execPath, [viteEntry, "--host", "127.0.0.1"], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true,
  }),
]

let shuttingDown = false

function terminate(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    })
    return
  }
  child.kill("SIGTERM")
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of processes) terminate(child)
  process.exit(code)
}

for (const child of processes) {
  child.on("error", (error) => {
    console.error(error.message)
    shutdown(1)
  })
  child.on("exit", (code, signal) => {
    if (!shuttingDown) shutdown(code ?? (signal ? 1 : 0))
  })
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))
