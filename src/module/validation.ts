import type { CodexTranscriptItem } from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const transcriptTypes = new Set([
  "user",
  "assistant",
  "tool",
  "reasoning",
  "file_changes",
  "file_link",
  "status",
])

export function isCodexTranscriptItem(value: unknown): value is CodexTranscriptItem {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.type !== "string"
    || !transcriptTypes.has(value.type)
    || typeof value.createdAt !== "number") return false

  switch (value.type) {
    case "user":
    case "assistant":
      return typeof value.content === "string"
    case "tool":
      return typeof value.title === "string" && typeof value.status === "string"
    case "reasoning":
      return typeof value.title === "string" && Array.isArray(value.steps)
    case "file_changes":
      return Array.isArray(value.files)
    case "file_link":
      return typeof value.path === "string"
    case "status":
      return typeof value.status === "string" && typeof value.label === "string"
    default:
      return false
  }
}

