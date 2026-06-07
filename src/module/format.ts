export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatDuration(ms?: number) {
  if (!ms) return ""
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function makeAttachment(file: File): import("./types").CodexChatAttachment {
  const isImage = file.type.startsWith("image/")
  return {
    id: crypto.randomUUID(),
    name: file.name || "attachment",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind: isImage ? "image" : "file",
    url: isImage ? URL.createObjectURL(file) : undefined,
    file,
  }
}
