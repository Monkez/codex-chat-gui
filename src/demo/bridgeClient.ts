import type { CodexChatAttachment } from "../module"

export interface BridgeCapabilities {
  dangerFullAccess: boolean
  neverApproval: boolean
  attachments: boolean
  maxConcurrentRuns: number
}

interface BridgeSession {
  token: string
  capabilities: BridgeCapabilities
}

export interface BridgeAttachment {
  name: string
  mimeType: string
  kind: CodexChatAttachment["kind"]
  dataBase64: string
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024
let sessionPromise: Promise<BridgeSession> | null = null

async function loadSession() {
  const response = await fetch("/api/session", { cache: "no-store" })
  if (!response.ok) throw new Error("Local Codex bridge is unavailable")
  const session = await response.json() as BridgeSession
  if (!session.token) throw new Error("Local Codex bridge did not create a secure session")
  return session
}

export async function getBridgeSession(forceRefresh = false) {
  if (forceRefresh) sessionPromise = null
  sessionPromise ??= loadSession()
  return sessionPromise
}

export async function bridgeFetch(input: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const session = await getBridgeSession()
  const headers = new Headers(init.headers)
  headers.set("x-codex-session", session.token)
  const response = await fetch(input, { ...init, headers })
  if (response.status === 401 && retry) {
    await getBridgeSession(true)
    return bridgeFetch(input, init, false)
  }
  return response
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 32_768
  let binary = ""
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export async function serializeAttachments(attachments: CodexChatAttachment[]): Promise<BridgeAttachment[]> {
  const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0)
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error("Attachments exceed the 20 MB total limit")
  }

  return Promise.all(attachments.map(async (attachment) => {
    if (!attachment.file) throw new Error(`${attachment.name} is missing its browser File data`)
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${attachment.name} exceeds the 5 MB attachment limit`)
    }
    return {
      name: attachment.name,
      mimeType: attachment.mimeType,
      kind: attachment.kind,
      dataBase64: arrayBufferToBase64(await attachment.file.arrayBuffer()),
    }
  }))
}
