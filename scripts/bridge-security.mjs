import { timingSafeEqual } from "node:crypto"
import path from "node:path"

export const MAX_BODY_BYTES = 32 * 1024 * 1024
export const MAX_PROMPT_CHARS = 100_000
export const MAX_ATTACHMENTS = 12
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024

export function getAllowedOrigins(value = "") {
  const configured = String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  return new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...configured,
  ])
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return !origin || allowedOrigins.has(origin)
}

export function hasValidSessionToken(provided, expected) {
  if (typeof provided !== "string" || !provided || !expected) return false
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
}

export function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false

    function fail(error) {
      if (settled) return
      settled = true
      reject(error)
    }

    req.on("data", (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        fail(Object.assign(new Error("Request body is too large"), { statusCode: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (settled) return
      try {
        const raw = Buffer.concat(chunks).toString("utf8")
        settled = true
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        fail(Object.assign(new Error("Request body must contain valid JSON"), { statusCode: 400 }))
      }
    })
    req.on("error", fail)
  })
}

export function resolveWorkspacePath(rootDir, inputPath) {
  const resolved = path.resolve(rootDir, String(inputPath ?? ""))
  const relative = path.relative(rootDir, resolved)
  if (!relative || relative === ".") return resolved
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw Object.assign(new Error("Path is outside the workspace"), { statusCode: 403 })
  }
  return resolved
}

export function safeAttachmentName(value, index = 0) {
  const basename = path.basename(String(value || `attachment-${index + 1}`))
  const normalized = basename
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120)
  return normalized || `attachment-${index + 1}`
}

export function decodeAttachments(input) {
  if (input === undefined) return []
  if (!Array.isArray(input)) {
    throw Object.assign(new Error("Attachments must be an array"), { statusCode: 400 })
  }
  if (input.length > MAX_ATTACHMENTS) {
    throw Object.assign(new Error(`A maximum of ${MAX_ATTACHMENTS} attachments is allowed`), { statusCode: 413 })
  }

  let totalBytes = 0
  return input.map((attachment, index) => {
    if (!attachment || typeof attachment !== "object" || typeof attachment.dataBase64 !== "string") {
      throw Object.assign(new Error(`Attachment ${index + 1} is invalid`), { statusCode: 400 })
    }
    const encoded = attachment.dataBase64.replace(/\s/g, "")
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw Object.assign(new Error(`Attachment ${index + 1} is not valid base64`), { statusCode: 400 })
    }
    const buffer = Buffer.from(encoded, "base64")
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw Object.assign(new Error(`Attachment ${index + 1} exceeds the 5 MB limit`), { statusCode: 413 })
    }
    totalBytes += buffer.length
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw Object.assign(new Error("Attachments exceed the 20 MB total limit"), { statusCode: 413 })
    }
    return {
      name: safeAttachmentName(attachment.name, index),
      mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType.slice(0, 120) : "application/octet-stream",
      kind: attachment.kind === "image" ? "image" : "file",
      buffer,
    }
  })
}
