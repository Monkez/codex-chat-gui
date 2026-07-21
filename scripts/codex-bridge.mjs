import http from "node:http"
import { spawn } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Codex } from "@openai/codex-sdk"
import { cleanCodexErrorMessage, sdkItemToUiMessage, stripAnsi } from "./codex-ui-adapter.mjs"
import {
  MAX_PROMPT_CHARS,
  decodeAttachments,
  getAllowedOrigins,
  hasValidSessionToken,
  isAllowedOrigin,
  readJsonBody,
  resolveWorkspacePath,
} from "./bridge-security.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const port = Number(process.env.CODEX_BRIDGE_PORT ?? 8787)
const host = process.env.CODEX_BRIDGE_HOST ?? "127.0.0.1"
const sessionToken = randomBytes(32).toString("base64url")
const allowedOrigins = getAllowedOrigins(process.env.CODEX_ALLOWED_ORIGINS)
const allowDangerFullAccess = process.env.CODEX_ALLOW_DANGER_FULL_ACCESS === "1"
const allowNeverApproval = process.env.CODEX_ALLOW_NEVER_APPROVAL === "1"
const maxConcurrentRuns = Math.max(1, Number(process.env.CODEX_MAX_CONCURRENT_RUNS ?? 2))
const uploadRoot = path.join(rootDir, ".codex-chat-ui", "uploads")
const codexVersion = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, "node_modules", "@openai", "codex", "package.json"), "utf8")).version
  } catch {
    return "unknown"
  }
})()
const activeLogins = new Map()
let activeRuns = 0
const approvalPolicies = new Set(["never", "on-request", "on-failure", "untrusted"])
const sandboxModes = new Set(["read-only", "workspace-write", "danger-full-access"])
const reasoningEfforts = new Set(["minimal", "low", "medium", "high", "xhigh"])
const fileActions = new Set(["open", "reveal", "open-with"])
const supportedImageMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])
const maxInlineTextAttachmentBytes = 256 * 1024
const codexClient = new Codex()

function codexBin() {
  return process.platform === "win32"
    ? path.join(rootDir, "node_modules", ".bin", "codex.cmd")
    : path.join(rootDir, "node_modules", ".bin", "codex")
}

function securityHeaders(req) {
  const origin = req.headers.origin
  return {
    ...(origin && allowedOrigins.has(origin) ? {
      "access-control-allow-origin": origin,
      vary: "Origin",
    } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-codex-session",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  }
}

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...securityHeaders(req),
  })
  res.end(body)
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

function startDeviceLogin(req, res) {
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
    sendJson(req, res, 200, {
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
      sendJson(req, res, 500, { ok: false, error: error.message })
    }
    scheduleCleanup()
  })
  child.on("close", (code) => {
    login.done = true
    login.code = code ?? 1
    scheduleCleanup()
    if (!responded) {
      responded = true
      sendJson(req, res, code === 0 ? 200 : 500, {
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
    spawn("explorer.exe", [target], { detached: true, stdio: "ignore", windowsHide: true }).unref()
    return
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open"
  const targetForReveal = mode === "reveal" ? path.dirname(target) : target
  spawn(opener, [targetForReveal], { detached: true, stdio: "ignore" }).unref()
}

function isTextAttachment(mimeType, name) {
  return mimeType.startsWith("text/")
    || /\b(json|xml|yaml|javascript|typescript|markdown)\b/i.test(mimeType)
    || /\.(txt|md|json|ya?ml|csv|tsv|tsx?|jsx?|css|html?|xml|py|java|go|rs|cs|cpp|c|h)$/i.test(name)
}

function prepareTurnInput(prompt, rawAttachments, runId) {
  const attachments = decodeAttachments(rawAttachments)
  if (attachments.length === 0) return { input: prompt, runUploadDir: null }

  const runUploadDir = path.join(uploadRoot, runId)
  fs.mkdirSync(runUploadDir, { recursive: true })
  const input = [{ type: "text", text: prompt || "Inspect the attached files and help with them." }]

  attachments.forEach((attachment, index) => {
    const storedName = `${String(index + 1).padStart(2, "0")}-${attachment.name}`
    const absolutePath = path.join(runUploadDir, storedName)
    fs.writeFileSync(absolutePath, attachment.buffer)
    if (attachment.kind === "image" && supportedImageMimeTypes.has(attachment.mimeType)) {
      input.push({ type: "local_image", path: absolutePath })
      return
    }
    if (isTextAttachment(attachment.mimeType, attachment.name) && attachment.buffer.length <= maxInlineTextAttachmentBytes) {
      input.push({
        type: "text",
        text: `\n\n--- Attached file: ${attachment.name} ---\n${attachment.buffer.toString("utf8")}\n--- End attached file ---`,
      })
      return
    }
    input.push({
      type: "text",
      text: `\n\nAn attachment named ${attachment.name} is available at ${absolutePath}. Inspect it only if needed.`,
    })
  })

  return { input, runUploadDir }
}

async function handleRun(req, res) {
  if (activeRuns >= maxConcurrentRuns) {
    sendJson(req, res, 429, { ok: false, error: "The local agent is busy. Try again when an active run finishes." })
    return
  }
  const body = await readJsonBody(req)
  const prompt = String(body.prompt ?? "").trim()
  if (!prompt && (!Array.isArray(body.attachments) || body.attachments.length === 0)) {
    sendJson(req, res, 400, { ok: false, error: "Missing prompt or attachment" })
    return
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    sendJson(req, res, 413, { ok: false, error: "Prompt exceeds the 100,000 character limit" })
    return
  }

  activeRuns += 1
  const runId = randomUUID()
  let runUploadDir = null

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    ...securityHeaders(req),
  })

  const abortController = new AbortController()
  req.on("aborted", () => abortController.abort())
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort()
  })

  try {
    const requestedSandboxMode = sandboxModes.has(body.sandboxMode) ? body.sandboxMode : "workspace-write"
    if (requestedSandboxMode === "danger-full-access" && !allowDangerFullAccess) {
      writeSse(res, "error", { message: "danger-full-access is disabled by the local bridge administrator." })
      return
    }
    const sandboxMode = requestedSandboxMode
    const requestedApprovalPolicy = approvalPolicies.has(body.approvalPolicy) ? body.approvalPolicy : "on-request"
    if (requestedApprovalPolicy === "never" && !allowNeverApproval) {
      writeSse(res, "error", { message: "The 'never ask' approval policy is disabled by the local bridge administrator." })
      return
    }
    const approvalPolicy = requestedApprovalPolicy
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

    const prepared = prepareTurnInput(prompt, body.attachments, runId)
    runUploadDir = prepared.runUploadDir
    const { events } = await thread.runStreamed(prepared.input, { signal: abortController.signal })
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
    activeRuns = Math.max(0, activeRuns - 1)
    if (runUploadDir) {
      fs.rmSync(runUploadDir, { recursive: true, force: true })
    }
    res.end()
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      if (!isAllowedOrigin(req.headers.origin, allowedOrigins)) {
        sendJson(req, res, 403, { ok: false, error: "Origin is not allowed" })
        return
      }
      res.writeHead(204, securityHeaders(req))
      res.end()
      return
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

    if (!isAllowedOrigin(req.headers.origin, allowedOrigins)) {
      sendJson(req, res, 403, { ok: false, error: "Origin is not allowed" })
      return
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      sendJson(req, res, 200, {
        token: sessionToken,
        capabilities: {
          dangerFullAccess: allowDangerFullAccess,
          neverApproval: allowNeverApproval,
          attachments: true,
          maxConcurrentRuns,
          codexVersion,
        },
      })
      return
    }

    if (!hasValidSessionToken(req.headers["x-codex-session"], sessionToken)) {
      sendJson(req, res, 401, { ok: false, error: "A valid local bridge session is required" })
      return
    }

    if (req.method === "GET" && url.pathname === "/api/codex/auth/status") {
      sendJson(req, res, 200, await authStatus())
      return
    }

    if (req.method === "POST" && url.pathname === "/api/codex/auth/device/start") {
      startDeviceLogin(req, res)
      return
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/codex/auth/device/")) {
      const loginId = url.pathname.split("/").at(-2) === "device"
        ? url.pathname.split("/").at(-1)
        : url.pathname.split("/").at(-2)
      const login = loginId ? activeLogins.get(loginId) : null
      if (!login) {
        sendJson(req, res, 404, { ok: false, error: "Unknown login session" })
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
      sendJson(req, res, 200, {
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
      sendJson(req, res, result.code === 0 ? 200 : 500, {
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
      const body = await readJsonBody(req)
      const target = resolveWorkspacePath(rootDir, body.path)
      if (!fileActions.has(body.action)) {
        sendJson(req, res, 400, { ok: false, error: "Unsupported file action" })
        return
      }
      openPath(target, body.action)
      sendJson(req, res, 200, { ok: true, path: target })
      return
    }

    sendJson(req, res, 404, { ok: false, error: "Not found" })
  } catch (error) {
    const status = Number(error?.statusCode) || 500
    if (!res.headersSent) {
      sendJson(req, res, status, { ok: false, error: error instanceof Error ? error.message : String(error) })
    } else {
      res.end()
    }
  }
})

server.listen(port, host, () => {
  console.log(`[codex-bridge] listening on http://${host}:${port}`)
})
