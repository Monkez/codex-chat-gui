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

const runStatuses = new Set(["idle", "starting", "running", "waiting", "error"])
const assistantStatuses = new Set(["streaming", "complete", "error"])
const toolStatuses = new Set(["queued", "running", "complete", "error"])
const reasoningStatuses = new Set(["thinking", "complete"])
const fileChangeStatuses = new Set(["complete", "error"])
const fileChangeTypes = new Set(["added", "modified", "deleted", "renamed"])
const fileStatsKinds = new Set(["exact", "unavailable"])
const attachmentKinds = new Set(["image", "file"])

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string"
}

function isOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean"
}

function isOptionalFiniteNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value))
}

function hasOptionalEnum(value: unknown, allowed: Set<string>) {
  return value === undefined || (typeof value === "string" && allowed.has(value))
}

function isAttachment(value: unknown) {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.mimeType === "string"
    && typeof value.size === "number"
    && Number.isFinite(value.size)
    && value.size >= 0
    && typeof value.kind === "string"
    && attachmentKinds.has(value.kind)
    && isOptionalString(value.url)
}

function isFileChange(value: unknown) {
  return isRecord(value)
    && typeof value.path === "string"
    && typeof value.additions === "number"
    && Number.isFinite(value.additions)
    && value.additions >= 0
    && typeof value.deletions === "number"
    && Number.isFinite(value.deletions)
    && value.deletions >= 0
    && hasOptionalEnum(value.changeType, fileChangeTypes)
    && hasOptionalEnum(value.statsKind, fileStatsKinds)
}

export function isCodexTranscriptItem(value: unknown): value is CodexTranscriptItem {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.type !== "string"
    || !transcriptTypes.has(value.type)
    || typeof value.createdAt !== "number"
    || !Number.isFinite(value.createdAt)) return false

  switch (value.type) {
    case "user":
      return typeof value.content === "string"
        && (value.attachments === undefined
          || (Array.isArray(value.attachments) && value.attachments.every(isAttachment)))
    case "assistant":
      return typeof value.content === "string"
        && hasOptionalEnum(value.status, assistantStatuses)
    case "tool":
      return typeof value.title === "string"
        && typeof value.status === "string"
        && toolStatuses.has(value.status)
        && isOptionalString(value.command)
        && isOptionalString(value.input)
        && isOptionalString(value.output)
        && isOptionalFiniteNumber(value.durationMs)
    case "reasoning":
      return typeof value.title === "string"
        && typeof value.status === "string"
        && reasoningStatuses.has(value.status)
        && Array.isArray(value.steps)
        && value.steps.every((step) => typeof step === "string")
        && isOptionalBoolean(value.defaultExpanded)
    case "file_changes":
      return Array.isArray(value.files)
        && value.files.every(isFileChange)
        && isOptionalString(value.title)
        && hasOptionalEnum(value.status, fileChangeStatuses)
        && isOptionalBoolean(value.canUndo)
        && isOptionalBoolean(value.canReview)
    case "file_link":
      return typeof value.path === "string"
        && isOptionalString(value.label)
        && isOptionalString(value.description)
        && isOptionalFiniteNumber(value.line)
    case "status":
      return typeof value.status === "string"
        && runStatuses.has(value.status)
        && typeof value.label === "string"
        && isOptionalString(value.detail)
    default:
      return false
  }
}

