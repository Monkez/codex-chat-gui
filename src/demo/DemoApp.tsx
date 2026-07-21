import { useEffect, useRef, useState } from "react"
import { MessageSquare, SlidersHorizontal } from "lucide-react"
import {
  CodexChat,
  type CodexAuthState,
  type CodexChatSubmitPayload,
  type CodexFileChangeMessage,
  type CodexPromptChoice,
  type CodexPromptRequest,
  type CodexChatDensity,
  type CodexChatTheme,
  type CodexTranscriptItem,
  parseSseFrame,
  isCodexTranscriptItem,
} from "../module"
import { createUserMessage } from "./mockAgent"
import {
  bridgeFetch,
  getBridgeSession,
  serializeAttachments,
  type BridgeCapabilities,
} from "./bridgeClient"

type CodexApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted"
type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access"
type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh"

interface RunSettings {
  model: string
  reasoningEffort: CodexReasoningEffort
  sandboxMode: CodexSandboxMode
  approvalPolicy: CodexApprovalPolicy
  networkAccessEnabled: boolean
  theme: CodexChatTheme
  density: CodexChatDensity
}

const defaultRunSettings: RunSettings = {
  model: "",
  reasoningEffort: "low",
  sandboxMode: "workspace-write",
  approvalPolicy: "on-request",
  networkAccessEnabled: false,
  theme: "system",
  density: "comfortable",
}

const initialMessages: CodexTranscriptItem[] = [
  {
    id: "welcome",
    type: "assistant",
    content: [
      "Welcome to **Codex Chat UI** — a focused workspace for collaborating with a coding agent.",
      "",
      "Follow the live process from planning to tools and changed files. Expand any step when you need detail, or keep the timeline compact while you work.",
      "",
      "Attach screenshots or project files, then ask Codex to explain, review or implement a change.",
    ].join("\n"),
    status: "complete",
    createdAt: 0,
  },
]

const QUICK_PROMPTS = [
  "Explain the architecture and important flows",
  "Review this project for reliability issues",
  "Implement a small improvement and verify it",
]

function RunSettingsControl({
  settings,
  disabled,
  capabilities,
  onChange,
}: {
  settings: RunSettings
  disabled: boolean
  capabilities: BridgeCapabilities | null
  onChange: (settings: RunSettings) => void
}) {
  const [open, setOpen] = useState(false)

  function update<K extends keyof RunSettings>(key: K, value: RunSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="codex-run-settings">
      <button
        type="button"
        className="codex-run-settings-button"
        onClick={() => setOpen((current) => !current)}
        title="Agent run settings"
      >
        <SlidersHorizontal aria-hidden="true" />
        <span>{settings.reasoningEffort}</span>
      </button>
      {open ? (
        <div className="codex-run-settings-popover" role="dialog" aria-label="Agent run settings">
          <div className="codex-settings-intro">
            <strong>Run controls</strong>
            <small>Choose how much the agent can inspect and change.</small>
          </div>
          <label>
            <span>Model</span>
            <input
              value={settings.model}
              disabled={disabled}
              placeholder="Codex default"
              onChange={(event) => update("model", event.target.value)}
            />
          </label>
          <label>
            <span>Thinking</span>
            <select
              value={settings.reasoningEffort}
              disabled={disabled}
              onChange={(event) => update("reasoningEffort", event.target.value as CodexReasoningEffort)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">Extra high</option>
            </select>
          </label>
          <label>
            <span>Files</span>
            <select
              value={settings.sandboxMode}
              disabled={disabled}
              onChange={(event) => update("sandboxMode", event.target.value as CodexSandboxMode)}
            >
              <option value="read-only">Read only</option>
              <option value="workspace-write">Workspace write</option>
              <option value="danger-full-access" disabled={!capabilities?.dangerFullAccess}>Full access (admin enabled)</option>
            </select>
          </label>
          <label>
            <span>Approval</span>
            <select
              value={settings.approvalPolicy}
              disabled={disabled}
              onChange={(event) => update("approvalPolicy", event.target.value as CodexApprovalPolicy)}
            >
              <option value="never" disabled={!capabilities?.neverApproval}>Never ask (admin enabled)</option>
              <option value="on-failure">Ask on failure</option>
              <option value="on-request">Ask on request</option>
              <option value="untrusted">Untrusted</option>
            </select>
          </label>
          <label className="codex-run-settings-toggle">
            <input
              type="checkbox"
              checked={settings.networkAccessEnabled}
              disabled={disabled}
              onChange={(event) => update("networkAccessEnabled", event.target.checked)}
            />
            <span>Network access</span>
          </label>
          <label>
            <span>Theme</span>
            <select
              value={settings.theme}
              disabled={disabled}
              onChange={(event) => update("theme", event.target.value as CodexChatTheme)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <label>
            <span>Density</span>
            <select
              value={settings.density}
              disabled={disabled}
              onChange={(event) => update("density", event.target.value as CodexChatDensity)}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <div className="codex-runtime-version">
            <span>Local runtime</span>
            <strong>Codex {capabilities?.codexVersion ?? "checking…"}</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DemoPromptButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="codex-demo-prompt-button"
      onClick={onClick}
      title="Show user prompt"
    >
      <MessageSquare aria-hidden="true" />
      <span>Prompt</span>
    </button>
  )
}

function createStatus(label: string, detail?: string): CodexTranscriptItem {
  return {
    id: `demo-status-${crypto.randomUUID()}`,
    type: "status",
    status: "running",
    label,
    detail,
    createdAt: Date.now(),
  }
}

function readPayloadField(data: unknown, field: string) {
  return typeof data === "object" && data !== null && field in data
    ? (data as Record<string, unknown>)[field]
    : undefined
}

export function DemoApp() {
  const [messages, setMessages] = useState<CodexTranscriptItem[]>(initialMessages)
  const [isRunning, setRunning] = useState(false)
  const [runLabel, setRunLabel] = useState("Ready")
  const [threadId, setThreadId] = useState<string | null>(null)
  const [runSettings, setRunSettings] = useState<RunSettings>(defaultRunSettings)
  const [promptRequest, setPromptRequest] = useState<CodexPromptRequest | null>(null)
  const [capabilities, setCapabilities] = useState<BridgeCapabilities | null>(null)
  const [authState, setAuthState] = useState<CodexAuthState>({
    status: "signed_out",
    detail: "Connect your Codex account with the local Codex CLI device-login flow.",
  })
  const abortRef = useRef<AbortController | null>(null)
  const loginPollRef = useRef<number | null>(null)
  const lastCodexErrorRef = useRef<string | null>(null)

  function appendStatus(label: string, detail?: string) {
    setMessages((current) => [...current, createStatus(label, detail)])
  }

  function appendCodexError(detail: string) {
    if (lastCodexErrorRef.current === detail) return
    lastCodexErrorRef.current = detail
    appendStatus("Codex error", detail)
  }

  function upsertMessage(message: CodexTranscriptItem) {
    if (message.type === "status" && message.status === "error" && message.detail) {
      lastCodexErrorRef.current = message.detail
    }
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === message.id)
      if (index === -1) return [...current, message]
      const next = [...current]
      next[index] = message
      return next
    })
  }

  async function refreshAuthStatus() {
    try {
      const session = await getBridgeSession()
      setCapabilities(session.capabilities)
      const response = await bridgeFetch("/api/codex/auth/status")
      const payload = await response.json() as { authenticated: boolean; status: CodexAuthState["status"]; detail?: string }
      setAuthState({
        status: payload.authenticated ? "authenticated" : "signed_out",
        accountLabel: payload.authenticated ? "Codex account" : undefined,
        detail: payload.detail,
      })
    } catch (error) {
      setAuthState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  useEffect(() => {
    void refreshAuthStatus()
    return () => {
      if (loginPollRef.current !== null) window.clearInterval(loginPollRef.current)
    }
  }, [])

  async function handleStartAccountLogin() {
    if (loginPollRef.current !== null) {
      window.clearInterval(loginPollRef.current)
      loginPollRef.current = null
    }
    setAuthState({
      status: "checking",
      detail: "Starting Codex device login...",
    })
    try {
      const response = await bridgeFetch("/api/codex/auth/device/start", { method: "POST" })
      const payload = await response.json() as {
        ok: boolean
        loginId?: string
        verificationUrl?: string
        userCode?: string
        detail?: string
        error?: string
      }
      if (!payload.ok || !payload.loginId) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to start Codex login")
      }
      setAuthState({
        status: "checking",
        verificationUrl: payload.verificationUrl,
        userCode: payload.userCode,
        detail: payload.detail || "Open the verification page and approve Codex access.",
      })

      loginPollRef.current = window.setInterval(async () => {
        try {
          const statusResponse = await bridgeFetch(`/api/codex/auth/device/${payload.loginId}/status`)
          const statusPayload = await statusResponse.json() as {
            done: boolean
            detail?: string
            auth?: { authenticated: boolean; detail?: string }
          }
          if (statusPayload.auth?.authenticated) {
            if (loginPollRef.current !== null) window.clearInterval(loginPollRef.current)
            loginPollRef.current = null
            setAuthState({
              status: "authenticated",
              accountLabel: "Codex account",
              detail: statusPayload.auth.detail,
            })
            appendStatus("Codex account connected", "Real SDK streaming is now enabled.")
            return
          }
          if (statusPayload.done) {
            if (loginPollRef.current !== null) window.clearInterval(loginPollRef.current)
            loginPollRef.current = null
            setAuthState({
              status: "error",
              detail: statusPayload.detail || "Codex login did not complete.",
            })
          }
        } catch (error) {
          if (loginPollRef.current !== null) window.clearInterval(loginPollRef.current)
          loginPollRef.current = null
          setAuthState({
            status: "error",
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      }, 2000)
    } catch (error) {
      setAuthState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function handleSignOut() {
    if (loginPollRef.current !== null) {
      window.clearInterval(loginPollRef.current)
      loginPollRef.current = null
    }
    await bridgeFetch("/api/codex/auth/logout", { method: "POST" }).catch(() => undefined)
    setAuthState({
      status: "signed_out",
      detail: "Disconnected. Connect your Codex account again before running a real SDK session.",
    })
    appendStatus("Signed out", "Demo credential state cleared.")
  }

  async function runRealCodex(prompt: string, attachments: CodexChatSubmitPayload["attachments"]) {
    const controller = new AbortController()
    abortRef.current = controller
    lastCodexErrorRef.current = null
    setRunning(true)
    setRunLabel("Starting Codex")
    try {
      const serializedAttachments = await serializeAttachments(attachments)
      const response = await bridgeFetch("/api/codex/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          attachments: serializedAttachments,
          threadId,
          model: runSettings.model.trim() || undefined,
          modelReasoningEffort: runSettings.reasoningEffort,
          sandboxMode: runSettings.sandboxMode,
          approvalPolicy: runSettings.approvalPolicy,
          networkAccessEnabled: runSettings.networkAccessEnabled,
        }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(await response.text())
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      setRunLabel(`Streaming Codex - ${runSettings.reasoningEffort}`)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split(/\r?\n\r?\n/)
        buffer = parts.pop() ?? ""
        for (const part of parts) {
          const event = parseSseFrame(part)
          if (!event) continue
          if (event.eventName === "ui-message") {
            if (isCodexTranscriptItem(event.data)) upsertMessage(event.data)
            else appendCodexError("The local bridge returned an invalid transcript item.")
          } else if (event.eventName === "thread") {
            const nextThreadId = readPayloadField(event.data, "threadId")
            if (typeof nextThreadId === "string") setThreadId(nextThreadId)
          } else if (event.eventName === "error") {
            const message = readPayloadField(event.data, "message")
            appendCodexError(typeof message === "string" ? message : String(event.data))
          } else if (event.eventName === "done") {
            setRunLabel("Ready")
          }
        }
      }
      if (buffer.trim()) {
        const event = parseSseFrame(buffer)
        if (event?.eventName === "ui-message") {
          if (isCodexTranscriptItem(event.data)) upsertMessage(event.data)
          else appendCodexError("The local bridge returned an invalid transcript item.")
        } else if (event?.eventName === "thread") {
          const nextThreadId = readPayloadField(event.data, "threadId")
          if (typeof nextThreadId === "string") setThreadId(nextThreadId)
        } else if (event?.eventName === "error") {
          const message = readPayloadField(event.data, "message")
          appendCodexError(typeof message === "string" ? message : String(event.data))
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        appendStatus("Run stopped", "User cancelled the active Codex stream.")
      } else {
        appendCodexError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setRunning(false)
      setRunLabel("Ready")
    }
  }

  async function handleSubmit(payload: CodexChatSubmitPayload) {
    setMessages((current) => [...current, createUserMessage(payload.content, payload.attachments)])
    if (authState.status !== "authenticated") {
      appendStatus("Connect Codex first", "Use Connect Codex in the header to authenticate with your real Codex account.")
      return
    }
    await runRealCodex(payload.content, payload.attachments)
  }

  function handleCancel() {
    abortRef.current?.abort()
  }

  function handleUndoChanges(message: CodexFileChangeMessage) {
    appendStatus("Undo requested", `Host should revert patch group ${message.id}.`)
  }

  function handleReviewChanges(message: CodexFileChangeMessage) {
    appendStatus("Review requested", `${message.files.length} changed files would open in the app review panel.`)
  }

  async function requestFileAction(action: "open" | "reveal" | "open-with", path: string) {
    const response = await bridgeFetch("/api/host/file-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, path }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(payload.error ?? `File action failed with status ${response.status}`)
    }
  }

  async function handleOpenFile(path: string, line?: number) {
    try {
      await requestFileAction("open", path)
      appendStatus("Opened file", line ? `${path}:${line}` : path)
    } catch (error) {
      appendStatus("Open file failed", error instanceof Error ? error.message : String(error))
    }
  }

  async function handleRevealFile(path: string) {
    try {
      await requestFileAction("reveal", path)
      appendStatus("Revealed in Explorer", path)
    } catch (error) {
      appendStatus("Reveal failed", error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenFileWith(path: string) {
    try {
      await requestFileAction("open-with", path)
      appendStatus("Opened app picker", path)
    } catch (error) {
      appendStatus("Open with failed", error instanceof Error ? error.message : String(error))
    }
  }

  function handleOpenExternalLink(href: string) {
    appendStatus("Open link", href)
    window.open(href, "_blank", "noopener,noreferrer")
  }

  async function handleCopyText(text: string) {
    await navigator.clipboard?.writeText(text)
    appendStatus("Copied", text)
  }

  function showDemoPrompt() {
    setPromptRequest({
      id: `prompt-${crypto.randomUUID()}`,
      title: "Allow command execution?",
      message: "The agent wants to inspect the workspace before answering.",
      detail: "Command: Get-ChildItem -Force\nScope: current project only",
      variant: "approval",
      defaultChoiceId: "allow",
      cancelChoiceId: "deny",
      choices: [
        { id: "allow", label: "Allow once", tone: "primary" },
        { id: "deny", label: "Deny", tone: "secondary" },
        { id: "always", label: "Always allow", tone: "danger" },
      ],
    })
  }

  function handlePromptResolve(request: CodexPromptRequest, choice: CodexPromptChoice) {
    setPromptRequest(null)
    appendStatus("User prompt answered", `${request.title}: ${choice.label}`)
  }

  const errorState = authState.status === "error"
    ? {
      title: "Codex connection needs attention",
      message: authState.detail,
      actionLabel: "Retry",
    }
    : null

  return (
    <CodexChat
      title="Codex Chat UI"
      subtitle="Reusable React module for Codex SDK web apps"
      projectLabel="Demo workspace"
      messages={messages}
      isRunning={isRunning}
      runStatus={isRunning ? "running" : "idle"}
      runLabel={runLabel}
      authState={authState}
      theme={runSettings.theme}
      density={runSettings.density}
      errorState={errorState}
      headerControls={(
        <>
          <RunSettingsControl
            settings={runSettings}
            disabled={isRunning}
            capabilities={capabilities}
            onChange={setRunSettings}
          />
          <DemoPromptButton onClick={showDemoPrompt} />
        </>
      )}
      promptRequest={promptRequest}
      onStartAccountLogin={handleStartAccountLogin}
      onSignOut={handleSignOut}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onUndoChanges={handleUndoChanges}
      onReviewChanges={handleReviewChanges}
      onOpenFile={handleOpenFile}
      onRevealFile={handleRevealFile}
      onOpenFileWith={handleOpenFileWith}
      onOpenExternalLink={handleOpenExternalLink}
      onCopyText={handleCopyText}
      onPromptResolve={handlePromptResolve}
      onErrorAction={refreshAuthStatus}
      showActivityPanel
      quickPrompts={QUICK_PROMPTS}
    />
  )
}
