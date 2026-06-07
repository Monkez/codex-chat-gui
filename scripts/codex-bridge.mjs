import http from "node:http"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Codex } from "@openai/codex-sdk"
import { cleanCodexErrorMessage, sdkItemToUiMessage, stripAnsi } from "./codex-ui-adapter.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const port = Number(process.env.CODEX_BRIDGE_PORT ?? 8787)
const activeLogins = new Map()
const approvalPolicies = new Set(["never", "on-request", "on-failure", "untrusted"])
const sandboxModes = new Set(["read-only", "workspace-write", "danger-full-access"])
const reasoningEfforts = new Set(["minimal", "low", "medium", "high", "xhigh"])
const codexClient = new Codex()

function codexBin() {
  return process.platform === "win32"
    ? path.join(rootDir, "node_modules", ".bin", "codex.cmd")
    : path.join(rootDir, "node_modules", ".bin", "codex")
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8")
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function runCodex(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(codexBin(), args, {
      cwd: rootDir,
      env: process.env,
      windowsHide: true,
      shell: process.platform === "win32",
      ...options,
    })
    const stdout = []
    const stderr = []
    child.stdout?.on("data", (chunk) => stdout.push(chunk))
    child.stderr?.on("data", (chunk) => stderr.push(chunk))
    child.on("error", (error) => {
      resolve({ code: 1, stdout: "", stderr: error.message })
    })
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      })
    })
  })
}

async function authStatus() {
  const result = await runCodex(["login", "status"])
  const output = stripAnsi(`${result.stdout}\n${result.stderr}`).trim()
  return {
    authenticated: result.code === 0,
    status: result.code === 0 ? "authenticated" : "signed_out",
    detail: output || (result.code === 0 ? "Codex is authenticated." : "Codex is not authenticated."),
  }
}

function parseDeviceOutput(output) {
  const cleanOutput = stripAnsi(output)
  const verificationUrl = cleanOutput.match(/https:\/\/[^\s)]+/i)?.[0]
  const userCode = cleanOutput.match(/\b[A-Z0-9]{4}[- ][A-Z0-9]{4}\b/)?.[0]
  return { verificationUrl, userCode }
}

function deviceLoginDetail(parsed, fallbackOutput = "") {
  if (parsed.verificationUrl || parsed.userCode) {
    return "Open the verification page and approve Codex access."
  }
  const fallback = stripAnsi(fallbackOutput).trim()
  return fallback || "Waiting for Codex to provide a device login code..."
}

function startDeviceLogin(res) {
  const loginId = randomUUID()
  const child = spawn(codexBin(), ["login", "--device-auth"], {
    cwd: rootDir,
    env: process.env,
    windowsHide: true,
    shell: process.platform === "win32",
  })
  let output = ""
  let responded = false
  const login = {
    child,
    done: false,
    code: null,
    output: "",
    startedAt: Date.now(),
  }
  activeLogins.set(loginId, login)

  function scheduleCleanup() {
    setTimeout(() => {
      activeLogins.delete(loginId)
      if (!login.done) {
        try {
          login.child.kill()
        } catch {
          // ignore
        }
      }
    }, 10 * 60 * 1000).unref?.()
  }

  function maybeRespond() {
    if (responded) return
    const parsed = parseDeviceOutput(output)
    if (!parsed.verificationUrl && !parsed.userCode && Date.now() - login.startedAt < 15000) return
    responded = true
    sendJson(res, 200, {
      ok: true,
      loginId,
      ...parsed,
      detail: deviceLoginDetail(parsed, output),
    })
  }

  child.stdout?.on("data", (chunk) => {
    output += chunk.toString("utf8")
    login.output = output
    maybeRespond()
  })
  child.stderr?.on("data", (chunk) => {
    output += chunk.toString("utf8")
    login.output = output
    maybeRespond()
  })
  child.on("error", (error) => {
    output += error.message
    login.output = output
    login.done = true
    login.code = 1
    if (!responded) {
      responded = true
      sendJson(res, 500, { ok: false, error: error.message })
    }
    scheduleCleanup()
  })
  child.on("close", (code) => {
    login.done = true
    login.code = code ?? 1
    scheduleCleanup()
    if (!responded) {
      responded = true
      sendJson(res, code === 0 ? 200 : 500, {
        ok: code === 0,
        loginId,
        detail: deviceLoginDetail(parseDeviceOutput(output), output),
      })
    }
  })
  setTimeout(maybeRespond, 15000)
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function resolveWorkspacePath(inputPath) {
  const resolved = path.resolve(rootDir, String(inputPath ?? ""))
  const relative = path.relative(rootDir, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the workspace")
  }
  return resolved
}

function openPath(target, mode) {
  if (!fs.existsSync(target)) {
    throw new Error(`Path does not exist: ${target}`)
  }

  if (process.platform === "win32") {
    if (mode === "reveal") {
      spawn("explorer.exe", [`/select,${target}`], { detached: true, stdio: "ignore", windowsHide: true }).unref()
      return
    }
    if (mode === "open-with") {
      spawn("rundll32.exe", ["shell32.dll,OpenAs_RunDLL", target], { detached: true, stdio: "ignore", windowsHide: true }).unref()
      return
    }
    spawn("cmd.exe", ["/c", "start", "", target], { detached: true, stdio: "ignore", windowsHide: true }).unref()
    return
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open"
  const targetForReveal = mode === "reveal" ? path.dirname(target) : target
  spawn(opener, [targetForReveal], { detached: true, stdio: "ignore" }).unref()
}

async function handleRun(req, res) {
  const body = await readBody(req)
  const prompt = String(body.prompt ?? "").trim()
  if (!prompt) {
    sendJson(res, 400, { ok: false, error: "Missing prompt" })
    return
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  })

  const abortController = new AbortController()
  const runId = randomUUID()
  req.on("close", () => abortController.abort())

  try {
    const sandboxMode = sandboxModes.has(body.sandboxMode) ? body.sandboxMode : "workspace-write"
    const approvalPolicy = approvalPolicies.has(body.approvalPolicy) ? body.approvalPolicy : "never"
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined
    const requestedReasoningEffort = reasoningEfforts.has(body.modelReasoningEffort)
      ? body.modelReasoningEffort
      : "low"
    const modelReasoningEffort = requestedReasoningEffort === "minimal" ? "low" : requestedReasoningEffort
    const networkAccessEnabled = Boolean(body.networkAccessEnabled)
    const includeRawEvents = Boolean(body.includeRawEvents)
    const threadOptions = {
      workingDirectory: rootDir,
      skipGitRepoCheck: true,
      sandboxMode,
      approvalPolicy,
      model,
      modelReasoningEffort,
      networkAccessEnabled,
      webSearchMode: networkAccessEnabled ? "live" : "disabled",
    }
    const thread = body.threadId
      ? codexClient.resumeThread(String(body.threadId), threadOptions)
      : codexClient.startThread(threadOptions)

    const { events } = await thread.runStreamed(prompt, { signal: abortController.signal })
    for await (const event of events) {
      if (includeRawEvents) writeSse(res, "codex-event", event)
      if ("item" in event) {
        const message = sdkItemToUiMessage(event.item, event.type, runId)
        if (message) writeSse(res, "ui-message", message)
      }
      if (event.type === "thread.started") {
        writeSse(res, "thread", { threadId: event.thread_id })
      }
      if (event.type === "turn.completed") {
        writeSse(res, "done", { usage: event.usage })
      }
      if (event.type === "turn.failed") {
        writeSse(res, "error", { message: cleanCodexErrorMessage(event.error) })
      }
    }
  } catch (error) {
    writeSse(res, "error", { message: cleanCodexErrorMessage(error) })
  } finally {
    res.end()
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {})
      return
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

    if (req.method === "GET" && url.pathname === "/api/codex/auth/status") {
      sendJson(res, 200, await authStatus())
      return
    }

    if (req.method === "POST" && url.pathname === "/api/codex/auth/device/start") {
      startDeviceLogin(res)
      return
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/codex/auth/device/")) {
      const loginId = url.pathname.split("/").at(-2) === "device"
        ? url.pathname.split("/").at(-1)
        : url.pathname.split("/").at(-2)
      const login = loginId ? activeLogins.get(loginId) : null
      if (!login) {
        sendJson(res, 404, { ok: false, error: "Unknown login session" })
        return
      }
      const status = await authStatus()
      if (status.authenticated && !login.done) {
        login.done = true
        login.code = 0
        try {
          login.child.kill()
        } catch {
          // ignore
        }
        setTimeout(() => activeLogins.delete(loginId), 5000).unref?.()
      }
      sendJson(res, 200, {
        ok: true,
        done: login.done || status.authenticated,
        exitCode: login.code,
        detail: deviceLoginDetail(parseDeviceOutput(login.output), login.output),
        auth: status,
      })
      return
    }

    if (req.method === "POST" && url.pathname === "/api/codex/auth/logout") {
      const result = await runCodex(["logout"])
      sendJson(res, result.code === 0 ? 200 : 500, {
        ok: result.code === 0,
        detail: stripAnsi(`${result.stdout}\n${result.stderr}`).trim(),
      })
      return
    }

    if (req.method === "POST" && url.pathname === "/api/codex/run") {
      await handleRun(req, res)
      return
    }

    if (req.method === "POST" && url.pathname === "/api/host/file-action") {
      const body = await readBody(req)
      const target = resolveWorkspacePath(body.path)
      openPath(target, body.action ?? "open")
      sendJson(res, 200, { ok: true, path: target })
      return
    }

    sendJson(res, 404, { ok: false, error: "Not found" })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(port, () => {
  console.log(`[codex-bridge] listening on http://localhost:${port}`)
})
