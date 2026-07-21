import { TerminalSquare } from "lucide-react"
import type { CodexRunStatus, CodexToolMessage, CodexTranscriptItem } from "../types"
import { getCurrentTurnMessages } from "../transcriptRows"

function getStatusTone(status?: CodexRunStatus) {
  if (status === "running" || status === "starting") return "active"
  if (status === "waiting") return "warning"
  if (status === "error") return "danger"
  return "neutral"
}

export function ActivityPanel({ messages, isRunning, runLabel }: {
  messages: CodexTranscriptItem[]
  isRunning: boolean
  runLabel?: string
}) {
  const turnMessages = getCurrentTurnMessages(messages)
  const events = turnMessages.filter((item) => (
    item.type === "tool"
    || item.type === "status"
    || item.type === "reasoning"
    || item.type === "file_changes"
  )).slice(-8)
  const runningTool = [...turnMessages].reverse().find((item): item is CodexToolMessage => item.type === "tool" && item.status === "running")
  const toolCount = turnMessages.filter((item) => item.type === "tool").length
  const changedFileCount = turnMessages.reduce((count, item) => (
    item.type === "file_changes" ? count + item.files.length : count
  ), 0)
  const reasoningCount = turnMessages.filter((item) => item.type === "reasoning").length

  return (
    <aside className="codex-activity">
      <div className="codex-activity-header">
        <span className="codex-activity-icon">
          <TerminalSquare aria-hidden="true" />
        </span>
        <div>
          <strong>Run trace</strong>
          <small>{runningTool?.command ?? runLabel ?? (isRunning ? "Running" : "Idle")}</small>
        </div>
        <span className={`codex-trace-state ${isRunning ? "is-live" : ""}`}>{isRunning ? "Live" : "Ready"}</span>
      </div>
      <div className="codex-trace-metrics" aria-label="Run summary">
        <div><strong>{toolCount}</strong><span>Tools</span></div>
        <div><strong>{changedFileCount}</strong><span>Files</span></div>
        <div><strong>{reasoningCount}</strong><span>Plans</span></div>
      </div>
      <div className="codex-activity-section-title">
        <span>Recent activity</span>
        <small>{events.length} events</small>
      </div>
      <div className="codex-activity-list" role="list">
        {events.length === 0 ? (
          <p className="codex-muted">No commands yet.</p>
        ) : events.map((item) => (
          <div key={item.id} className="codex-activity-row" role="listitem">
            <span
              className={`codex-activity-dot ${
                item.type === "tool"
                  ? `is-${item.status}`
                  : item.type === "status"
                    ? `tone-${getStatusTone(item.status)}`
                    : item.type === "reasoning" && item.status === "thinking"
                      ? "is-running"
                      : "is-complete"
              }`}
            />
            <div>
              <strong>
                {item.type === "tool"
                  ? item.title
                  : item.type === "status"
                    ? item.label
                    : item.type === "reasoning"
                      ? item.title
                      : item.title ?? `Edited ${item.files.length} files`}
              </strong>
              <small>
                {item.type === "tool"
                  ? item.command
                  : item.type === "status"
                    ? item.detail
                    : item.type === "reasoning"
                      ? `${item.steps.length} compacted actions`
                      : `${item.files.length} files changed`}
              </small>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
