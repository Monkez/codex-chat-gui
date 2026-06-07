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
  const id = `${runId}:${item.id}`
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
      return {
        id,
        type: "tool",
        title: item.command.split(/\s+/).slice(0, 4).join(" ") || "Command",
        status: item.status === "in_progress" ? "running" : item.status === "failed" ? "error" : "complete",
        command: item.command,
        output: item.aggregated_output,
        createdAt: now,
      }
    case "file_change":
      return {
        id,
        type: "file_changes",
        title: `Changed ${item.changes.length} files`,
        canUndo: true,
        canReview: true,
        files: item.changes.map((change) => ({
          path: change.path,
          additions: 0,
          deletions: 0,
          statsKind: "unavailable",
          changeType: change.kind === "add" ? "added" : change.kind === "delete" ? "deleted" : "modified",
        })),
        createdAt: now,
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
