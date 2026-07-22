import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowUp,
  ArrowDown,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  GitCompare,
  ImageIcon,
  Loader2,
  Paperclip,
  RotateCcw,
  SearchCode,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react"
import type {
  CodexChatAttachment,
  CodexAssistantMessage,
  CodexFileChangeMessage,
  CodexFileLinkMessage,
  CodexChatProps,
  CodexChatSubmitPayload,
  CodexLinkTarget,
  CodexReasoningMessage,
  CodexRunStatus,
  CodexToolMessage,
  CodexTranscriptItem,
} from "./types"
import { formatBytes, formatDuration, makeAttachment, releaseAttachmentPreviews } from "./format"
import { buildTranscriptRows, getCurrentTurnMessages } from "./transcriptRows"
import { ActivityPanel } from "./components/ActivityPanel"
import { AuthControl } from "./components/AuthControl"
import { PromptDialog } from "./components/PromptDialog"

const ACCEPTED_PASTE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

type MenuAction = {
  id: string
  label: string
  icon: ReactNode
  onSelect: () => void | Promise<void>
}

type ContextMenuState = {
  x: number
  y: number
  actions: MenuAction[]
} | null

type LinkHandlers = Pick<
  CodexChatProps,
  | "onOpenFile"
  | "onRevealFile"
  | "onOpenFileWith"
  | "onOpenExternalLink"
  | "onCopyText"
  | "onUndoChanges"
  | "onReviewChanges"
>

function getStatusTone(status?: CodexRunStatus) {
  if (status === "error") return "danger"
  if (status === "waiting") return "warning"
  if (status === "running" || status === "starting") return "active"
  return "idle"
}

function getToolIcon(tool: CodexToolMessage) {
  if (tool.status === "complete") return <CheckCircle2 aria-hidden="true" />
  if (tool.status === "error") return <X aria-hidden="true" />
  if (tool.status === "running") return <Loader2 aria-hidden="true" className="codex-spin" />
  return <Clock3 aria-hidden="true" />
}

function AttachmentThumb({
  attachment,
  onPreview,
  onRemove,
  compact = false,
}: {
  attachment: CodexChatAttachment
  onPreview?: (attachment: CodexChatAttachment) => void
  onRemove?: (attachment: CodexChatAttachment) => void
  compact?: boolean
}) {
  const canPreview = attachment.kind === "image" && attachment.url

  return (
    <div className={`codex-attachment ${compact ? "codex-attachment-compact" : ""}`}>
      <button
        type="button"
        className="codex-attachment-main"
        onClick={() => canPreview && onPreview?.(attachment)}
        disabled={!canPreview}
        aria-label={canPreview ? `Preview ${attachment.name}` : attachment.name}
      >
        {attachment.kind === "image" && attachment.url ? (
          <img src={attachment.url} alt={attachment.name} />
        ) : (
          <span className="codex-file-icon">
            <FileText aria-hidden="true" />
          </span>
        )}
        <span className="codex-attachment-meta">
          <span>{attachment.name}</span>
          <small>{formatBytes(attachment.size)}</small>
        </span>
      </button>
      {onRemove ? (
        <button
          type="button"
          className="codex-icon-button codex-remove-button"
          onClick={() => onRemove(attachment)}
          aria-label={`Remove ${attachment.name}`}
          title="Remove attachment"
        >
          <Trash2 aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function ToolCard({ item }: { item: CodexToolMessage }) {
  const meta = [item.command ? "command" : null, formatDuration(item.durationMs)].filter(Boolean).join(" · ")

  return (
    <details className={`codex-tool-card is-${item.status}`} open={item.status === "running"}>
      <summary>
        <span className="codex-tool-icon">{getToolIcon(item)}</span>
        <span className="codex-tool-title">
          <strong>{item.title}</strong>
          {meta ? <small>{meta}</small> : null}
        </span>
        <ChevronDown aria-hidden="true" className="codex-summary-chevron" />
      </summary>
      <div className="codex-tool-body">
        {item.command ? (
          <div>
            <label>Command</label>
            <pre><code>{item.command}</code></pre>
          </div>
        ) : null}
        {item.input ? (
          <div>
            <label>Input</label>
            <pre><code>{item.input}</code></pre>
          </div>
        ) : null}
        {item.output ? (
          <div>
            <label>{item.status === "error" ? "Error" : "Output"}</label>
            <pre><code>{item.output}</code></pre>
          </div>
        ) : null}
      </div>
    </details>
  )
}

function ToolGroupCard({ tools }: { tools: CodexToolMessage[] }) {
  const commandCount = tools.filter((tool) => tool.command).length
  const runningCount = tools.filter((tool) => tool.status === "running").length
  const errorCount = tools.filter((tool) => tool.status === "error").length
  const completeCount = tools.filter((tool) => tool.status === "complete").length
  const title = runningCount > 0
    ? `Running ${runningCount} tool${runningCount === 1 ? "" : "s"}`
    : `Ran ${commandCount || tools.length} command${(commandCount || tools.length) === 1 ? "" : "s"}`
  const detail = [
    completeCount > 0 ? `${completeCount} done` : null,
    errorCount > 0 ? `${errorCount} failed` : null,
    runningCount > 0 ? `${runningCount} running` : null,
  ].filter(Boolean).join(" · ")

  return (
    <details className={`codex-tool-group ${runningCount > 0 ? "is-running" : ""}`}>
      <summary>
        <span className="codex-tool-icon">
          {runningCount > 0 ? <Loader2 aria-hidden="true" className="codex-spin" /> : <TerminalSquare aria-hidden="true" />}
        </span>
        <span className="codex-tool-title">
          <strong>{title}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
        <ChevronDown aria-hidden="true" className="codex-summary-chevron" />
      </summary>
      <div className="codex-tool-group-list">
        {tools.map((tool) => (
          <ToolCard key={tool.id} item={tool} />
        ))}
      </div>
    </details>
  )
}

function defaultCopy(text: string) {
  return navigator.clipboard?.writeText(text)
}

function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState
  onClose: () => void
}) {
  useEffect(() => {
    if (!menu) return undefined
    const close = () => onClose()
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [menu, onClose])

  if (!menu) return null

  return (
    <div
      className="codex-context-menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
    >
      {menu.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          onClick={() => {
            void action.onSelect()
            onClose()
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  )
}

function useContextActions(handlers: LinkHandlers, openMenu: (event: MouseEvent, actions: MenuAction[]) => void) {
  function copyText(text: string) {
    if (handlers.onCopyText) {
      return handlers.onCopyText(text)
    }
    return defaultCopy(text)
  }

  function fileActions(path: string, line?: number): MenuAction[] {
    return [
      {
        id: "open-file",
        label: "Open file",
        icon: <FileText aria-hidden="true" />,
        onSelect: () => handlers.onOpenFile?.(path, line),
      },
      {
        id: "reveal-file",
        label: "Reveal in Explorer",
        icon: <FolderOpen aria-hidden="true" />,
        onSelect: () => handlers.onRevealFile?.(path),
      },
      {
        id: "open-with",
        label: "Open with...",
        icon: <SearchCode aria-hidden="true" />,
        onSelect: () => handlers.onOpenFileWith?.(path),
      },
      {
        id: "copy-path",
        label: "Copy path",
        icon: <Copy aria-hidden="true" />,
        onSelect: () => copyText(line ? `${path}:${line}` : path),
      },
    ]
  }

  function linkActions(target: CodexLinkTarget): MenuAction[] {
    return [
      {
        id: "open-link",
        label: "Open in browser",
        icon: <ExternalLink aria-hidden="true" />,
        onSelect: () => {
          if (handlers.onOpenExternalLink) {
            return handlers.onOpenExternalLink(target.href)
          }
          window.open(target.href, "_blank", "noopener,noreferrer")
        },
      },
      {
        id: "copy-link",
        label: "Copy link",
        icon: <Copy aria-hidden="true" />,
        onSelect: () => copyText(target.href),
      },
    ]
  }

  return {
    copyText,
    onFileContextMenu(event: MouseEvent, path: string, line?: number) {
      openMenu(event, fileActions(path, line))
    },
    onLinkContextMenu(event: MouseEvent, target: CodexLinkTarget) {
      openMenu(event, linkActions(target))
    },
  }
}

function ReasoningCard({ item }: { item: CodexReasoningMessage }) {
  return (
    <details className={`codex-reasoning-card is-${item.status}`} open={item.defaultExpanded ?? item.status === "thinking"}>
      <summary>
        <span className="codex-reasoning-icon">
          {item.status === "thinking" ? <Loader2 aria-hidden="true" className="codex-spin" /> : <BrainCircuit aria-hidden="true" />}
        </span>
        <span>
          <strong>{item.title}</strong>
          <small>{item.steps.length} compacted action{item.steps.length === 1 ? "" : "s"}</small>
        </span>
        <ChevronDown aria-hidden="true" className="codex-summary-chevron" />
      </summary>
      <ol>
        {item.steps.map((step, index) => (
          <li key={`${step}:${index}`}>{step}</li>
        ))}
      </ol>
    </details>
  )
}

function FileChangesCard({
  item,
  handlers,
  onFileContextMenu,
}: {
  item: CodexFileChangeMessage
  handlers: LinkHandlers
  onFileContextMenu: (event: MouseEvent, path: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const totalAdditions = item.files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = item.files.reduce((sum, file) => sum + file.deletions, 0)
  const hasExactStats = item.files.some((file) => file.statsKind !== "unavailable")
  const visibleFiles = expanded ? item.files : item.files.slice(0, 3)
  const hiddenCount = Math.max(0, item.files.length - visibleFiles.length)

  const isError = item.status === "error"

  return (
    <section className={`codex-file-changes${isError ? " is-error" : ""}`}>
      <header>
        <span className="codex-file-changes-icon">
          <GitCompare aria-hidden="true" />
        </span>
        <div>
          <strong>{item.title ?? `Edited ${item.files.length} files`}</strong>
          {hasExactStats ? (
            <p>
              <span className="codex-addition">+{totalAdditions.toLocaleString()}</span>
              <span className="codex-deletion"> -{totalDeletions.toLocaleString()}</span>
            </p>
          ) : (
            <p>{item.files.length} changed file{item.files.length === 1 ? "" : "s"}</p>
          )}
        </div>
        <div className="codex-file-change-actions">
          {item.canUndo && handlers.onUndoChanges ? (
            <button type="button" onClick={() => handlers.onUndoChanges?.(item)}>
              Undo <RotateCcw aria-hidden="true" />
            </button>
          ) : null}
          {item.canReview && handlers.onReviewChanges ? (
            <button type="button" onClick={() => handlers.onReviewChanges?.(item)}>
              Review
            </button>
          ) : null}
        </div>
      </header>
      <div className="codex-file-change-list">
        {visibleFiles.map((file) => (
          <button
            key={file.path}
            type="button"
            className="codex-file-change-row"
            onClick={() => handlers.onOpenFile?.(file.path)}
            onContextMenu={(event) => onFileContextMenu(event, file.path)}
          >
            <span>{file.path}</span>
            {file.statsKind === "unavailable" ? (
              <small>{file.changeType ?? "changed"}</small>
            ) : (
              <small>
                <span className="codex-addition">+{file.additions}</span>
                <span className="codex-deletion"> -{file.deletions}</span>
              </small>
            )}
          </button>
        ))}
        {hiddenCount > 0 ? (
          <button type="button" className="codex-show-more-files" onClick={() => setExpanded(true)}>
            Show {hiddenCount} more file{hiddenCount === 1 ? "" : "s"}
            <ChevronDown aria-hidden="true" />
          </button>
        ) : expanded && item.files.length > 3 ? (
          <button type="button" className="codex-show-more-files is-expanded" onClick={() => setExpanded(false)}>
            Show fewer files
            <ChevronDown aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  )
}

function FileLinkCard({
  item,
  handlers,
  onFileContextMenu,
}: {
  item: CodexFileLinkMessage
  handlers: LinkHandlers
  onFileContextMenu: (event: MouseEvent, path: string, line?: number) => void
}) {
  return (
    <article className="codex-message codex-message-assistant codex-file-link-message">
      <div className="codex-avatar">
        <FileText aria-hidden="true" />
      </div>
      <button
        type="button"
        className="codex-file-link-card"
        onClick={() => handlers.onOpenFile?.(item.path, item.line)}
        onContextMenu={(event) => onFileContextMenu(event, item.path, item.line)}
      >
        <span>
          <strong>{item.label ?? item.path}</strong>
          <small>{item.description ?? (item.line ? `${item.path}:${item.line}` : item.path)}</small>
        </span>
      </button>
    </article>
  )
}

function useTypewriterText(content: string, enabled: boolean) {
  const shouldAnimate = enabled
    && content.length <= 2400
    && !(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  const [visibleContent, setVisibleContent] = useState(() => (shouldAnimate ? "" : content))
  const targetRef = useRef(content)

  useEffect(() => {
    targetRef.current = content
    if (!shouldAnimate) {
      setVisibleContent(content)
      return undefined
    }

    let cancelled = false
    setVisibleContent((current) => (content.startsWith(current) ? current : ""))

    const timer = window.setInterval(() => {
      if (cancelled) return
      setVisibleContent((current) => {
        const target = targetRef.current
        if (current.length >= target.length) {
          window.clearInterval(timer)
          return current
        }
        const step = target.length > 1200 ? 18 : target.length > 500 ? 10 : 6
        const nextLength = Math.min(target.length, current.length + step)
        return target.slice(0, nextLength)
      })
    }, 32)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [content, shouldAnimate])

  return visibleContent
}

function AssistantMessageItem({
  item,
  handlers,
  contextActions,
}: {
  item: CodexAssistantMessage
  handlers: LinkHandlers
  contextActions: ReturnType<typeof useContextActions>
}) {
  const markdownComponents: Components = {
    a({ href, children }) {
      const target = href ?? ""
      return (
        <a
          href={target}
          onClick={(event) => {
            event.preventDefault()
            if (handlers.onOpenExternalLink) {
              void handlers.onOpenExternalLink(target)
            } else {
              window.open(target, "_blank", "noopener,noreferrer")
            }
          }}
          onContextMenu={(event) => contextActions.onLinkContextMenu(event, { href: target })}
        >
          {children}
        </a>
      )
    },
  }
  const content = item.content || " "
  const shouldAnimateText = item.id !== "welcome"
    && item.status === "complete"
    && Date.now() - item.createdAt < 2500
  const visibleContent = useTypewriterText(content, shouldAnimateText)
  const isTyping = visibleContent.length < content.length

  return (
    <article className={`codex-message codex-message-assistant ${item.status === "streaming" || isTyping ? "is-streaming" : ""}`}>
      <div className="codex-avatar">
        <Bot aria-hidden="true" />
      </div>
      <div className="codex-message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{visibleContent}</ReactMarkdown>
        {item.status === "streaming" || isTyping ? <span className="codex-caret" /> : null}
      </div>
    </article>
  )
}

function TranscriptItem({
  item,
  onPreview,
  handlers,
  contextActions,
}: {
  item: CodexTranscriptItem
  onPreview: (attachment: CodexChatAttachment) => void
  handlers: LinkHandlers
  contextActions: ReturnType<typeof useContextActions>
}) {
  if (item.type === "status") {
    return (
      <div className={`codex-status-line tone-${getStatusTone(item.status)}`}>
        <span />
        <p>{item.label}</p>
        {item.detail ? <small>{item.detail}</small> : null}
      </div>
    )
  }

  if (item.type === "tool") {
    return <ToolCard item={item} />
  }

  if (item.type === "reasoning") {
    return <ReasoningCard item={item} />
  }

  if (item.type === "file_changes") {
    return (
      <FileChangesCard
        item={item}
        handlers={handlers}
        onFileContextMenu={contextActions.onFileContextMenu}
      />
    )
  }

  if (item.type === "file_link") {
    return (
      <FileLinkCard
        item={item}
        handlers={handlers}
        onFileContextMenu={contextActions.onFileContextMenu}
      />
    )
  }

  if (item.type === "user") {
    return (
      <article className="codex-message codex-message-user">
        <div className="codex-message-bubble">
          {item.content ? <p>{item.content}</p> : null}
          {item.attachments?.length ? (
            <div className="codex-message-attachments">
              {item.attachments.map((attachment) => (
                <AttachmentThumb
                  key={attachment.id}
                  attachment={attachment}
                  onPreview={onPreview}
                  compact
                />
              ))}
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  return <AssistantMessageItem item={item} handlers={handlers} contextActions={contextActions} />
}

function formatElapsedSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`
}

function LiveWorkStrip({
  messages,
  isRunning,
  runLabel,
}: {
  messages: CodexTranscriptItem[]
  isRunning: boolean
  runLabel?: string
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const turnMessages = getCurrentTurnMessages(messages)
  const tools = turnMessages.filter((item): item is CodexToolMessage => item.type === "tool")
  const runningTools = tools.filter((item) => item.status === "running")
  const commandCount = tools.filter((item) => item.command).length
  const latestReasoning = [...turnMessages].reverse().find((item) => item.type === "reasoning")
  const latestFileChanges = [...turnMessages].reverse().find((item) => item.type === "file_changes")

  useEffect(() => {
    if (isRunning) {
      setStartedAt((current) => current ?? Date.now())
      return
    }
    setStartedAt(null)
  }, [isRunning])

  useEffect(() => {
    if (!isRunning) return undefined
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [isRunning])

  if (!isRunning) return null

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : 0

  return (
    <section className="codex-live-work">
      <div className="codex-live-heading">
        <strong>Working for {formatElapsedSeconds(elapsedSeconds)}</strong>
        <span />
      </div>
      <div className="codex-live-events">
        {commandCount > 0 ? (
          <div className="codex-live-event">
            <TerminalSquare aria-hidden="true" />
            <span>Ran {commandCount} command{commandCount === 1 ? "" : "s"}</span>
          </div>
        ) : null}
        {runningTools.length > 0 ? (
          <div className="codex-live-event is-running">
            <Loader2 aria-hidden="true" className="codex-spin" />
            <span>Running {runningTools.length} tool{runningTools.length === 1 ? "" : "s"} in parallel</span>
          </div>
        ) : null}
        {latestFileChanges?.type === "file_changes" ? (
          <div className="codex-live-event">
            <GitCompare aria-hidden="true" />
            <span>Editing {latestFileChanges.files.length} files</span>
          </div>
        ) : null}
        {latestReasoning?.type === "reasoning" ? (
          <div className={`codex-live-event ${latestReasoning.status === "thinking" ? "is-running" : ""}`}>
            {latestReasoning.status === "thinking" ? <Loader2 aria-hidden="true" className="codex-spin" /> : <BrainCircuit aria-hidden="true" />}
            <span>{latestReasoning.status === "thinking" ? "Thinking" : "Reasoning compacted"}</span>
          </div>
        ) : null}
      </div>
      {runningTools.length > 0 ? (
        <div className="codex-live-tool-grid">
          {runningTools.map((tool) => (
            <div key={tool.id} className="codex-live-tool">
              <span className="codex-live-pulse" />
              <div>
                <strong>{tool.title}</strong>
                <small>{tool.command ?? tool.input ?? runLabel ?? "Running"}</small>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function CodexChat({
  title = "Codex Chat",
  subtitle = "Embeddable agent UI",
  projectLabel,
  placeholder = "Ask Codex to inspect, edit, or explain your project...",
  messages,
  isRunning = false,
  runStatus = "idle",
  runLabel,
  authState,
  headerControls,
  promptRequest,
  errorState,
  theme = "light",
  density = "comfortable",
  transcriptWindowSize = 300,
  onSubmit,
  onCancel,
  onAuthenticate,
  onStartAccountLogin,
  onSignOut,
  onUndoChanges,
  onReviewChanges,
  onOpenFile,
  onRevealFile,
  onOpenFileWith,
  onOpenExternalLink,
  onCopyText,
  onPromptResolve,
  onErrorAction,
  quickPrompts = [],
  className,
  maxAttachments = 12,
  maxAttachmentSizeBytes = 5 * 1024 * 1024,
  maxTotalAttachmentBytes = 20 * 1024 * 1024,
  compactTools = true,
  showActivityPanel = false,
}: CodexChatProps) {
  const [value, setValue] = useState("")
  const [attachments, setAttachments] = useState<CodexChatAttachment[]>([])
  const [isDragActive, setDragActive] = useState(false)
  const [preview, setPreview] = useState<CodexChatAttachment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const previewCloseRef = useRef<HTMLButtonElement>(null)
  const draftAttachmentsRef = useRef<CodexChatAttachment[]>([])
  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !isSubmitting
  const statusTone = getStatusTone(runStatus)

  const imageCount = useMemo(() => attachments.filter((attachment) => attachment.kind === "image").length, [attachments])
  const transcriptRows = useMemo(() => buildTranscriptRows(messages, compactTools), [compactTools, messages])
  const windowedTranscriptRows = useMemo(() => {
    if (!transcriptWindowSize || transcriptRows.length <= transcriptWindowSize) return transcriptRows
    return transcriptRows.slice(-transcriptWindowSize)
  }, [transcriptRows, transcriptWindowSize])
  const hiddenTranscriptRowCount = transcriptRows.length - windowedTranscriptRows.length
  const handlers: LinkHandlers = {
    onUndoChanges,
    onReviewChanges,
    onOpenFile,
    onRevealFile,
    onOpenFileWith,
    onOpenExternalLink,
    onCopyText,
  }
  const contextActions = useContextActions(handlers, (event, actions) => {
    event.preventDefault()
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 230),
      y: Math.min(event.clientY, window.innerHeight - 190),
      actions,
    })
  })

  useEffect(() => {
    if (!isNearBottom) return
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: isRunning ? "auto" : "smooth",
    })
  }, [isNearBottom, isRunning, messages])

  useEffect(() => () => {
    releaseAttachmentPreviews(draftAttachmentsRef.current)
  }, [])

  useEffect(() => {
    if (!preview) return undefined
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previewCloseRef.current?.focus()
    function closePreview(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      setPreview(null)
    }
    document.addEventListener("keydown", closePreview)
    return () => {
      document.removeEventListener("keydown", closePreview)
      previousFocus?.focus()
    }
  }, [preview])

  function replaceAttachments(next: CodexChatAttachment[]) {
    draftAttachmentsRef.current = next
    setAttachments(next)
  }

  function appendFiles(files: File[]) {
    if (files.length === 0) return
    const current = draftAttachmentsRef.current
    const slots = maxAttachments - current.length
    if (slots <= 0) {
      setError(`Maximum ${maxAttachments} attachments per message.`)
      return
    }
    const sizeEligible = files.filter((file) => file.size <= maxAttachmentSizeBytes)
    const currentBytes = current.reduce((sum, attachment) => sum + attachment.size, 0)
    let nextBytes = currentBytes
    const nextFiles = sizeEligible.slice(0, slots).filter((file) => {
      if (nextBytes + file.size > maxTotalAttachmentBytes) return false
      nextBytes += file.size
      return true
    })
    if (sizeEligible.length < files.length) {
      setError(`Each attachment must be ${formatBytes(maxAttachmentSizeBytes)} or smaller.`)
    } else if (nextFiles.length < sizeEligible.slice(0, slots).length) {
      setError(`Attachments may total up to ${formatBytes(maxTotalAttachmentBytes)} per message.`)
    } else if (sizeEligible.length > slots) {
      setError(`Only ${slots} more attachment${slots === 1 ? "" : "s"} can be added.`)
    } else {
      setError(null)
    }
    replaceAttachments([...current, ...nextFiles.map(makeAttachment)])
  }

  function removeAttachment(target: CodexChatAttachment) {
    if (target.url) URL.revokeObjectURL(target.url)
    replaceAttachments(draftAttachmentsRef.current.filter((attachment) => attachment.id !== target.id))
    if (preview?.id === target.id) setPreview(null)
  }

  async function submit(payload?: Partial<CodexChatSubmitPayload>) {
    const content = payload?.content ?? value.trim()
    const submitAttachments = payload?.attachments ?? draftAttachmentsRef.current
    if (!content && submitAttachments.length === 0) return
    const nextPayload = { content, attachments: submitAttachments }
    const previousValue = value
    const previousAttachments = draftAttachmentsRef.current
    setSubmitting(true)
    setValue("")
    replaceAttachments([])
    setError(null)
    textareaRef.current?.focus()
    try {
      await onSubmit(nextPayload)
    } catch (submitError) {
      setValue((current) => current || previousValue)
      const current = draftAttachmentsRef.current
      const currentIds = new Set(current.map((attachment) => attachment.id))
      replaceAttachments([...previousAttachments.filter((attachment) => !currentIds.has(attachment.id)), ...current])
      setError(submitError instanceof Error ? submitError.message : "Unable to send this message.")
    } finally {
      setSubmitting(false)
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && ACCEPTED_PASTE_IMAGE_TYPES.has(item.type))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    if (files.length > 0) appendFiles(files)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (isRunning || isSubmitting) return
    appendFiles(Array.from(event.dataTransfer.files))
  }

  function handleTextareaInput(event: ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value)
    event.target.style.height = "auto"
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !isRunning) {
      event.preventDefault()
      void submit()
    }
    if (event.key === "Escape" && isRunning) {
      event.preventDefault()
      onCancel?.()
    }
  }

  return (
    <section
      className={`codex-chat theme-${theme} density-${density} ${showActivityPanel ? "has-activity" : ""} ${className ?? ""}`}
      onDragOver={(event) => {
        event.preventDefault()
        if (!isRunning && !isSubmitting) setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <header className="codex-chat-header">
        <div>
          <span className={`codex-status-pill tone-${statusTone}`}>
            <span />
            {runLabel ?? (isRunning ? "Streaming" : "Ready")}
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="codex-header-actions">
          {headerControls}
          {projectLabel ? <strong className="codex-project-label">{projectLabel}</strong> : null}
          {authState || onAuthenticate ? (
            <AuthControl
              authState={authState}
              onAuthenticate={onAuthenticate}
              onStartAccountLogin={onStartAccountLogin}
              onSignOut={onSignOut}
              onOpenExternalLink={onOpenExternalLink}
            />
          ) : null}
        </div>
      </header>

      <div className="codex-chat-shell">
        <main className="codex-chat-main">
          <div
            ref={transcriptRef}
            className="codex-transcript"
            aria-live="polite"
            aria-busy={isRunning}
            onScroll={(event) => {
              const element = event.currentTarget
              setIsNearBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 96)
            }}
          >
            {hiddenTranscriptRowCount > 0 ? (
              <div className="codex-window-notice">
                Showing latest {windowedTranscriptRows.length} transcript row{windowedTranscriptRows.length === 1 ? "" : "s"}.
                {` ${hiddenTranscriptRowCount} older row${hiddenTranscriptRowCount === 1 ? "" : "s"} hidden for performance.`}
              </div>
            ) : null}
            {windowedTranscriptRows.map((row) => (
              row.kind === "tool_group" ? (
                <ToolGroupCard key={row.id} tools={row.tools} />
              ) : (
                <TranscriptItem
                  key={row.item.id}
                  item={row.item}
                  onPreview={setPreview}
                  handlers={handlers}
                  contextActions={contextActions}
                />
              )
            ))}
            <LiveWorkStrip messages={messages} isRunning={isRunning} runLabel={runLabel} />
          </div>

          {!isNearBottom ? (
            <button
              type="button"
              className="codex-jump-latest"
              onClick={() => {
                setIsNearBottom(true)
                transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" })
              }}
            >
              <ArrowDown aria-hidden="true" />
              Latest activity
            </button>
          ) : null}

          <div className="codex-composer-wrap">
            {errorState ? (
              <div className="codex-error-banner" role="status">
                <div>
                  <strong>{errorState.title}</strong>
                  {errorState.message ? <p>{errorState.message}</p> : null}
                </div>
                {errorState.actionLabel ? (
                  <button type="button" onClick={() => void onErrorAction?.()}>
                    {errorState.actionLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
            {quickPrompts.length > 0 && messages.length < 3 ? (
              <div className="codex-quick-prompts">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setValue(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}

            {attachments.length > 0 ? (
              <div className="codex-attachment-tray">
                <div className="codex-tray-summary">
                  <ImageIcon aria-hidden="true" />
                  <span>{attachments.length} attachment{attachments.length === 1 ? "" : "s"}</span>
                  {imageCount > 0 ? <small>{imageCount} image{imageCount === 1 ? "" : "s"}</small> : null}
                </div>
                <div className="codex-tray-list">
                  {attachments.map((attachment) => (
                    <AttachmentThumb
                      key={attachment.id}
                      attachment={attachment}
                      onPreview={setPreview}
                      onRemove={removeAttachment}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="codex-composer">
              <button
                type="button"
                className="codex-icon-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning || isSubmitting}
                aria-label="Attach files"
                title="Attach files"
              >
                <Paperclip aria-hidden="true" />
              </button>
              <textarea
                ref={textareaRef}
                value={value}
                rows={1}
                placeholder={placeholder}
                onChange={handleTextareaInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                disabled={isRunning || isSubmitting}
              />
              <button
                type="button"
                className="codex-send-button"
                onClick={() => isRunning ? onCancel?.() : void submit()}
                disabled={!isRunning && !canSubmit}
                aria-label={isRunning ? "Stop generation" : "Send message"}
                title={isRunning ? "Stop generation" : "Send message"}
              >
                {isRunning ? <CircleStop aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  appendFiles(Array.from(event.target.files ?? []))
                  event.target.value = ""
                }}
              />
            </div>
            {error ? <p className="codex-composer-error" role="alert">{error}</p> : null}
          </div>
        </main>

        {showActivityPanel ? <ActivityPanel messages={messages} isRunning={isRunning} runLabel={runLabel} /> : null}
      </div>

      {isDragActive ? (
        <div className="codex-drop-overlay">
          <Paperclip aria-hidden="true" />
          <strong>Drop files to attach</strong>
        </div>
      ) : null}

      {preview?.kind === "image" && preview.url ? (
        <div className="codex-preview" role="dialog" aria-modal="true" aria-label={preview.name}>
          <button ref={previewCloseRef} type="button" className="codex-preview-close" onClick={() => setPreview(null)} aria-label="Close preview">
            <X aria-hidden="true" />
          </button>
          <img src={preview.url} alt={preview.name} />
          <span>{preview.name}</span>
        </div>
      ) : null}

      {promptRequest ? (
        <PromptDialog request={promptRequest} onResolve={onPromptResolve} />
      ) : null}

      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  )
}
