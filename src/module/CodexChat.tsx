import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowUp,
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
  ShieldCheck,
  ShieldOff,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react"
import type {
  CodexChatAttachment,
  CodexAssistantMessage,
  CodexAuthState,
  CodexFileChangeMessage,
  CodexFileLinkMessage,
  CodexChatProps,
  CodexChatSubmitPayload,
  CodexLinkTarget,
  CodexPromptChoice,
  CodexPromptRequest,
  CodexReasoningMessage,
  CodexRunStatus,
  CodexToolMessage,
  CodexTranscriptItem,
} from "./types"
import { formatBytes, formatDuration, makeAttachment } from "./format"

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

type TranscriptRenderRow =
  | { kind: "item"; item: CodexTranscriptItem }
  | { kind: "tool_group"; id: string; tools: CodexToolMessage[] }

function AuthControl({
  authState,
  onAuthenticate,
  onStartAccountLogin,
  onSignOut,
}: {
  authState?: CodexAuthState
  onAuthenticate?: (apiKey: string) => void | Promise<void>
  onStartAccountLogin?: () => void | Promise<void>
  onSignOut?: () => void | Promise<void>
}) {
  const [apiKey, setApiKey] = useState("")
  const [open, setOpen] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const status = authState?.status ?? "unknown"
  const isAuthenticated = status === "authenticated"
  const isChecking = status === "checking"

  async function submitAuth() {
    const value = apiKey.trim()
    if (!value) return
    await onAuthenticate?.(value)
    setApiKey("")
    setOpen(false)
  }

  return (
    <div className="codex-auth">
      <button
        type="button"
        className={`codex-auth-button is-${status}`}
        onClick={() => setOpen((current) => !current)}
        title={isAuthenticated ? "Codex account connected" : "Connect Codex account"}
      >
        {isAuthenticated ? <ShieldCheck aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
        <span>{isAuthenticated ? authState?.accountLabel ?? "Connected" : "Connect Codex"}</span>
      </button>
      {open ? (
        <div className="codex-auth-popover">
          <strong>{isAuthenticated ? "Codex authenticated" : "Authenticate Codex"}</strong>
          <p>
            {authState?.detail
              ?? "Connect with your ChatGPT/Codex account using the local Codex CLI device-login flow."}
          </p>
          {authState?.verificationUrl || authState?.userCode ? (
            <div className="codex-device-login">
              {authState.verificationUrl ? (
                <button
                  type="button"
                  className="codex-device-link"
                  onClick={() => window.open(authState.verificationUrl, "_blank", "noopener,noreferrer")}
                >
                  Open verification page
                </button>
              ) : null}
              {authState.userCode ? <code>{authState.userCode}</code> : null}
            </div>
          ) : null}
          {isAuthenticated ? (
            <button type="button" onClick={() => void onSignOut?.()}>
              Sign out
            </button>
          ) : (
            <>
              {onStartAccountLogin ? (
                <button type="button" onClick={() => void onStartAccountLogin()} disabled={isChecking}>
                  {isChecking ? "Waiting..." : "Connect Codex account"}
                </button>
              ) : null}
              {onAuthenticate ? (
                <button type="button" className="codex-auth-secondary" onClick={() => setShowApiKey((current) => !current)}>
                  Use API key
                </button>
              ) : null}
              {showApiKey && onAuthenticate ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitAuth()
                  }}
                >
                  <input
                    type="password"
                    value={apiKey}
                    placeholder="sk-..."
                    autoComplete="off"
                    onChange={(event) => setApiKey(event.target.value)}
                    disabled={isChecking}
                  />
                  <button type="submit" disabled={isChecking || !apiKey.trim()}>
                    {isChecking ? "Checking..." : "Connect"}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function PromptDialog({
  request,
  onResolve,
}: {
  request: CodexPromptRequest
  onResolve?: (request: CodexPromptRequest, choice: CodexPromptChoice) => void | Promise<void>
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const resolveChoice = useCallback((choice: CodexPromptChoice | undefined) => {
    if (!choice) return
    void onResolve?.(request, choice)
  }, [onResolve, request])
  const cancelChoice = request.choices.find((choice) => choice.id === request.cancelChoiceId)
  const defaultChoice = request.choices.find((choice) => choice.id === request.defaultChoiceId)
    ?? request.choices.find((choice) => choice.tone === "primary")
    ?? request.choices[0]
  const describedBy = request.message || request.detail ? `codex-dialog-desc-${request.id}` : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.hasAttribute("disabled"))
    const initial = defaultChoice
      ? focusable.find((element) => element.dataset.choiceId === defaultChoice.id)
      : focusable[0]
    initial?.focus()

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        resolveChoice(cancelChoice ?? defaultChoice)
        return
      }
      if (event.key !== "Tab" || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [cancelChoice, defaultChoice, resolveChoice])

  return (
    <div
      className="codex-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolveChoice(cancelChoice)
      }}
    >
      <section
        ref={dialogRef}
        className={`codex-dialog codex-dialog-${request.variant ?? "default"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`codex-dialog-title-${request.id}`}
        aria-describedby={describedBy}
      >
        <header>
          <strong id={`codex-dialog-title-${request.id}`}>{request.title}</strong>
          {request.message ? <p id={`codex-dialog-desc-${request.id}`}>{request.message}</p> : null}
        </header>
        {request.detail ? <pre id={request.message ? undefined : `codex-dialog-desc-${request.id}`}>{request.detail}</pre> : null}
        <div className="codex-dialog-actions">
          {request.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              data-choice-id={choice.id}
              className={`tone-${choice.tone ?? "secondary"}`}
              onClick={() => resolveChoice(choice)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

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

function buildTranscriptRows(messages: CodexTranscriptItem[], compactTools: boolean): TranscriptRenderRow[] {
  if (!compactTools) {
    return messages.map((item) => ({ kind: "item", item }))
  }

  const rows: TranscriptRenderRow[] = []
  let index = 0
  while (index < messages.length) {
    const item = messages[index]
    if (item?.type !== "tool") {
      rows.push({ kind: "item", item })
      index += 1
      continue
    }

    const tools: CodexToolMessage[] = []
    while (index < messages.length && messages[index]?.type === "tool") {
      tools.push(messages[index] as CodexToolMessage)
      index += 1
    }

    if (tools.length === 1) {
      rows.push({ kind: "item", item: tools[0]! })
    } else {
      rows.push({ kind: "tool_group", id: `tool-group:${tools[0]?.id}`, tools })
    }
  }
  return rows
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

  return (
    <section className="codex-file-changes">
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
          {item.canUndo ? (
            <button type="button" onClick={() => handlers.onUndoChanges?.(item)}>
              Undo <RotateCcw aria-hidden="true" />
            </button>
          ) : null}
          {item.canReview ? (
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
    && (item.status === "streaming" || Date.now() - item.createdAt < 2500)
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

function ActivityPanel({ messages, isRunning, runLabel }: {
  messages: CodexTranscriptItem[]
  isRunning: boolean
  runLabel?: string
}) {
  const events = messages.filter((item) => (
    item.type === "tool"
    || item.type === "status"
    || item.type === "reasoning"
    || item.type === "file_changes"
  )).slice(-8)
  const runningTool = [...messages].reverse().find((item): item is CodexToolMessage => item.type === "tool" && item.status === "running")

  return (
    <aside className="codex-activity">
      <div className="codex-activity-header">
        <span className="codex-activity-icon">
          <TerminalSquare aria-hidden="true" />
        </span>
        <div>
          <strong>Agent activity</strong>
          <small>{runningTool?.command ?? runLabel ?? (isRunning ? "Running" : "Idle")}</small>
        </div>
      </div>
      <div className="codex-activity-list">
        {events.length === 0 ? (
          <p className="codex-muted">No commands yet.</p>
        ) : events.map((item) => (
          <div key={item.id} className="codex-activity-row">
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
  const tools = messages.filter((item): item is CodexToolMessage => item.type === "tool")
  const runningTools = tools.filter((item) => item.status === "running")
  const commandCount = tools.filter((item) => item.command).length
  const latestReasoning = [...messages].reverse().find((item) => item.type === "reasoning")
  const latestFileChanges = [...messages].reverse().find((item) => item.type === "file_changes")

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
  quickPrompts = [],
  className,
  maxAttachments = 12,
  compactTools = true,
  showActivityPanel = false,
}: CodexChatProps) {
  const [value, setValue] = useState("")
  const [attachments, setAttachments] = useState<CodexChatAttachment[]>([])
  const [isDragActive, setDragActive] = useState(false)
  const [preview, setPreview] = useState<CodexChatAttachment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const draftAttachmentsRef = useRef<CodexChatAttachment[]>([])
  const canSubmit = value.trim().length > 0 || attachments.length > 0
  const statusTone = getStatusTone(runStatus)

  const imageCount = useMemo(() => attachments.filter((attachment) => attachment.kind === "image").length, [attachments])
  const transcriptRows = useMemo(() => buildTranscriptRows(messages, compactTools), [compactTools, messages])
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
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages])

  useEffect(() => {
    draftAttachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => () => {
    draftAttachmentsRef.current.forEach((attachment) => {
      if (attachment.url) URL.revokeObjectURL(attachment.url)
    })
  }, [])

  function appendFiles(files: File[]) {
    if (files.length === 0) return
    setAttachments((current) => {
      const slots = maxAttachments - current.length
      if (slots <= 0) {
        setError(`Maximum ${maxAttachments} attachments per message.`)
        return current
      }
      const nextFiles = files.slice(0, slots)
      if (nextFiles.length < files.length) {
        setError(`Only ${slots} more attachment${slots === 1 ? "" : "s"} can be added.`)
      } else {
        setError(null)
      }
      return [...current, ...nextFiles.map(makeAttachment)]
    })
  }

  function removeAttachment(target: CodexChatAttachment) {
    if (target.url) URL.revokeObjectURL(target.url)
    setAttachments((current) => current.filter((attachment) => attachment.id !== target.id))
    if (preview?.id === target.id) setPreview(null)
  }

  async function submit(payload?: Partial<CodexChatSubmitPayload>) {
    const content = payload?.content ?? value.trim()
    const submitAttachments = payload?.attachments ?? attachments
    if (!content && submitAttachments.length === 0) return
    const nextPayload = { content, attachments: submitAttachments }
    setValue("")
    setAttachments([])
    setError(null)
    textareaRef.current?.focus()
    await onSubmit(nextPayload)
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
      className={`codex-chat ${showActivityPanel ? "has-activity" : ""} ${className ?? ""}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragActive(true)
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
            />
          ) : null}
        </div>
      </header>

      <div className="codex-chat-shell">
        <main className="codex-chat-main">
          <div ref={transcriptRef} className="codex-transcript" aria-live="polite">
            {transcriptRows.map((row) => (
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

          <div className="codex-composer-wrap">
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
                disabled={isRunning}
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
                disabled={isRunning}
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
            {error ? <p className="codex-composer-error">{error}</p> : null}
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
          <button type="button" className="codex-preview-close" onClick={() => setPreview(null)} aria-label="Close preview">
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
