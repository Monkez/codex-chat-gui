export function stripAnsi(value) {
  return String(value ?? "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\[[0-9;]*m/g, "")
}

export function cleanCodexErrorMessage(value) {
  const rawValue = typeof value === "string"
    ? value
    : value?.message
      ? String(value.message)
      : JSON.stringify(value)
  const raw = stripAnsi(rawValue)

  if (raw.includes("requires a newer version of Codex")
    || (raw.includes("failed to load models cache") && raw.includes("unknown variant `max`"))) {
    return "This model requires a newer local Codex runtime. Close the app and run run.bat again (or npm install), then retry."
  }

  if (raw.includes("reasoning.effort 'minimal'")) {
    return "Thinking 'minimal' is not compatible with the active Codex tools in this session. The demo now uses Thinking 'low' as the fastest compatible mode."
  }

  const apiMessage = raw.match(/"message"\s*:\s*"([^"]+)"/)?.[1]
  if (apiMessage) return apiMessage

  const withoutWarnings = raw
    .split(/\r?\n/)
    .filter((line) => !line.includes(" WARN ") && !line.trimStart().startsWith("WARN "))
    .join("\n")
    .trim()

  const message = withoutWarnings || raw.trim()
  return message.length > 700 ? `${message.slice(0, 700)}...` : message
}

export function sdkItemToUiMessage(item, eventType, runId, now = Date.now()) {
  if (!item || typeof item !== "object" || typeof item.type !== "string") return null
  const id = `${runId}:${typeof item.id === "string" ? item.id : "event"}`
  switch (item.type) {
    case "agent_message":
      if (!item.text) return null
      return {
        id,
        type: "assistant",
        content: item.text,
        status: eventType === "item.completed" ? "complete" : "streaming",
        createdAt: now,
      }
    case "reasoning":
      if (!item.text) return null
      return {
        id,
        type: "reasoning",
        title: "Thinking",
        status: "complete",
        steps: item.text ? [item.text] : [],
        defaultExpanded: false,
        createdAt: now,
      }
    case "command_execution":
      {
      const command = typeof item.command === "string" ? item.command : ""
      return {
        id,
        type: "tool",
        title: command.split(/\s+/).slice(0, 4).join(" ") || "Command",
        status: item.status === "in_progress" ? "running" : item.status === "failed" ? "error" : "complete",
        command,
        output: item.aggregated_output,
        createdAt: now,
      }
      }
    case "file_change":
      {
      const changes = Array.isArray(item.changes) ? item.changes : []
      return {
        id,
        type: "file_changes",
        title: `Changed ${changes.length} files`,
        canUndo: true,
        canReview: true,
        files: changes.filter((change) => change && typeof change.path === "string").map((change) => ({
          path: change.path,
          additions: 0,
          deletions: 0,
          statsKind: "unavailable",
          changeType: change.kind === "add" ? "added" : change.kind === "delete" ? "deleted" : "modified",
        })),
        createdAt: now,
      }
      }
    case "web_search":
      return {
        id,
        type: "tool",
        title: "Web search",
        status: "complete",
        input: item.query,
        createdAt: now,
      }
    case "mcp_tool_call":
      return {
        id,
        type: "tool",
        title: `${item.tool} from ${item.server}`,
        status: item.status === "in_progress" ? "running" : item.status === "failed" ? "error" : "complete",
        input: JSON.stringify(item.arguments, null, 2),
        output: item.error?.message ?? JSON.stringify(item.result ?? "", null, 2),
        createdAt: now,
      }
    case "error":
      return {
        id,
        type: "status",
        status: "error",
        label: "Codex error",
        detail: cleanCodexErrorMessage(item.message),
        createdAt: now,
      }
    default:
      return null
  }
}
