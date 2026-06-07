import type { Dispatch, SetStateAction } from "react"
import type {
  CodexAssistantMessage,
  CodexChatAttachment,
  CodexFileChangeMessage,
  CodexFileLinkMessage,
  CodexReasoningMessage,
  CodexStatusMessage,
  CodexToolMessage,
  CodexTranscriptItem,
  CodexUserMessage,
} from "../module"

type SetMessages = Dispatch<SetStateAction<CodexTranscriptItem[]>>
type SetRunning = Dispatch<SetStateAction<boolean>>
type SetRunLabel = Dispatch<SetStateAction<string>>

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function now() {
  return Date.now()
}

export function createUserMessage(content: string, attachments: CodexChatAttachment[]): CodexUserMessage {
  return {
    id: createId("user"),
    type: "user",
    content,
    attachments,
    createdAt: now(),
  }
}

function pushStatus(setMessages: SetMessages, label: string, detail?: string): CodexStatusMessage {
  const message: CodexStatusMessage = {
    id: createId("status"),
    type: "status",
    status: "running",
    label,
    detail,
    createdAt: now(),
  }
  setMessages((current) => [...current, message])
  return message
}

function pushReasoning(setMessages: SetMessages, message: Omit<CodexReasoningMessage, "id" | "type" | "createdAt">) {
  const item: CodexReasoningMessage = {
    id: createId("reasoning"),
    type: "reasoning",
    createdAt: now(),
    ...message,
  }
  setMessages((current) => [...current, item])
  return item.id
}

function updateReasoning(setMessages: SetMessages, id: string, patch: Partial<CodexReasoningMessage>) {
  setMessages((current) => current.map((item) => (
    item.id === id && item.type === "reasoning" ? { ...item, ...patch } : item
  )))
}

function pushTool(setMessages: SetMessages, tool: Omit<CodexToolMessage, "id" | "type" | "createdAt">) {
  const message: CodexToolMessage = {
    id: createId("tool"),
    type: "tool",
    createdAt: now(),
    ...tool,
  }
  setMessages((current) => [...current, message])
  return message.id
}

function updateTool(setMessages: SetMessages, id: string, patch: Partial<CodexToolMessage>) {
  setMessages((current) => current.map((item) => (
    item.id === id && item.type === "tool" ? { ...item, ...patch } : item
  )))
}

function pushFileChanges(setMessages: SetMessages, message: Omit<CodexFileChangeMessage, "id" | "type" | "createdAt">) {
  const item: CodexFileChangeMessage = {
    id: createId("changes"),
    type: "file_changes",
    createdAt: now(),
    ...message,
  }
  setMessages((current) => [...current, item])
}

function pushFileLink(setMessages: SetMessages, message: Omit<CodexFileLinkMessage, "id" | "type" | "createdAt">) {
  const item: CodexFileLinkMessage = {
    id: createId("file-link"),
    type: "file_link",
    createdAt: now(),
    ...message,
  }
  setMessages((current) => [...current, item])
}

function pushAssistantNote(setMessages: SetMessages, content: string) {
  const item: CodexAssistantMessage = {
    id: createId("assistant-note"),
    type: "assistant",
    content,
    status: "complete",
    createdAt: now(),
  }
  setMessages((current) => [...current, item])
}

async function streamAssistant(setMessages: SetMessages, text: string) {
  const id = createId("assistant")
  const message: CodexAssistantMessage = {
    id,
    type: "assistant",
    content: "",
    status: "streaming",
    createdAt: now(),
  }
  setMessages((current) => [...current, message])

  const chunks = text.match(/[\s\S]{1,8}/g) ?? [text]
  for (const chunk of chunks) {
    await sleep(35)
    setMessages((current) => current.map((item) => (
      item.id === id && item.type === "assistant"
        ? { ...item, content: item.content + chunk }
        : item
    )))
  }

  setMessages((current) => current.map((item) => (
    item.id === id && item.type === "assistant"
      ? { ...item, status: "complete" }
      : item
  )))
}

export async function runMockCodexAgent(args: {
  prompt: string
  attachments: CodexChatAttachment[]
  setMessages: SetMessages
  setRunning: SetRunning
  setRunLabel: SetRunLabel
  signal: AbortSignal
}) {
  const { prompt, attachments, setMessages, setRunning, setRunLabel, signal } = args
  const throwIfAborted = () => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
  }

  setRunning(true)
  setRunLabel("Starting agent")

  try {
    pushStatus(setMessages, "Receiving request", attachments.length > 0 ? `Loaded ${attachments.length} attachment(s)` : "No attachments")
    await sleep(400)
    throwIfAborted()

    const reasoningId = pushReasoning(setMessages, {
      title: "Thinking through implementation",
      status: "thinking",
      steps: [
        "Read the requirement for compact reasoning, action history, changed files and link context menus.",
        "Map Codex SDK streamed items into UI transcript rows.",
        "Keep OS-specific actions behind host callbacks.",
      ],
      defaultExpanded: false,
    })
    await sleep(450)
    throwIfAborted()

    pushAssistantNote(
      setMessages,
      "I will first inspect the project structure and the existing chat UI code, then I will adjust the transcript renderer only where needed."
    )

    setRunLabel("Running 3 tools in parallel")
    const inspectId = pushTool(setMessages, {
      title: "Inspect workspace",
      status: "running",
      command: "pwd && rg --files src | head -20",
      input: prompt,
    })
    const grepId = pushTool(setMessages, {
      title: "Search existing chat components",
      status: "running",
      command: "rg \"CodexChat|ToolCard|ActivityPanel\" src",
    })
    const readConfigId = pushTool(setMessages, {
      title: "Read package metadata",
      status: "running",
      command: "Get-Content package.json",
    })
    await sleep(520)
    throwIfAborted()
    updateTool(setMessages, readConfigId, {
      status: "complete",
      durationMs: 520,
      output: "react 19, vite, lucide-react, react-markdown",
    })
    await sleep(330)
    throwIfAborted()
    updateTool(setMessages, inspectId, {
      status: "complete",
      durationMs: 842,
      output: [
        "E:/SideProjects/Codex-chat-ui",
        "src/module/CodexChat.tsx",
        "src/module/types.ts",
        "src/demo/mockAgent.ts",
        "src/demo/DemoApp.tsx",
      ].join("\n"),
    })
    await sleep(260)
    throwIfAborted()
    updateTool(setMessages, grepId, {
      status: "complete",
      durationMs: 1110,
      output: [
        "src/module/CodexChat.tsx:function ToolCard",
        "src/module/CodexChat.tsx:function ActivityPanel",
        "src/module/CodexChat.tsx:function LiveWorkStrip",
      ].join("\n"),
    })

    pushAssistantNote(
      setMessages,
      "I found the right surface: the UI can keep every stream item in order, while consecutive tool items are compacted only when no text appears between them."
    )

    setRunLabel("Planning response")
    updateReasoning(setMessages, reasoningId, {
      status: "complete",
      steps: [
        "Use `reasoning` items for compact thinking summaries.",
        "Use `command_execution` items for running commands.",
        "Use `file_change` items for edited-file summary cards with Undo and Review.",
        "Use host callbacks for opening files, revealing paths and opening external links.",
      ],
    })
    pushStatus(setMessages, "Planning response", "Normalize SDK stream events into transcript items")
    await sleep(450)
    throwIfAborted()

    pushAssistantNote(
      setMessages,
      "Next I will update the UI and styles. The user-facing explanation can appear here before the edit tools start, just like Codex does when it needs to orient the user."
    )

    setRunLabel("Editing UI and verifying in parallel")
    const editUiId = pushTool(setMessages, {
      title: "Edit chat UI module",
      status: "running",
      command: "apply_patch src/module/CodexChat.tsx",
    })
    const editStyleId = pushTool(setMessages, {
      title: "Edit styling",
      status: "running",
      command: "apply_patch src/styles.css",
    })
    await sleep(420)
    throwIfAborted()
    updateTool(setMessages, editUiId, {
      status: "complete",
      durationMs: 420,
      output: "Added live working timer, parallel tool strip, auth control and context menu callbacks.",
    })
    await sleep(360)
    throwIfAborted()
    updateTool(setMessages, editStyleId, {
      status: "complete",
      durationMs: 780,
      output: "Added running shimmer, live work rows, edited files card, auth popover and context menu styles.",
    })

    const commandId = pushTool(setMessages, {
      title: "Run verification command",
      status: "running",
      command: "npm run build",
    })
    await sleep(900)
    throwIfAborted()
    updateTool(setMessages, commandId, {
      status: "complete",
      durationMs: 1280,
      output: "TypeScript check passed\nVite bundle generated\nNo attachment rendering errors",
    })

    pushAssistantNote(
      setMessages,
      "The verification passed. I am adding the changed-files summary and a clickable file reference so the host callbacks can be tested."
    )

    pushFileChanges(setMessages, {
      title: "Edited 15 files",
      canUndo: true,
      canReview: true,
      files: [
        { path: ".gitignore", additions: 6, deletions: 0, changeType: "modified" },
        { path: "README.md", additions: 47, deletions: 0, changeType: "modified" },
        { path: "index.html", additions: 12, deletions: 0, changeType: "modified" },
        { path: "src/module/types.ts", additions: 48, deletions: 0, changeType: "modified" },
        { path: "src/module/CodexChat.tsx", additions: 302, deletions: 18, changeType: "modified" },
        { path: "src/module/codexSdkAdapter.ts", additions: 142, deletions: 0, changeType: "added" },
        { path: "src/demo/DemoApp.tsx", additions: 33, deletions: 3, changeType: "modified" },
        { path: "src/demo/mockAgent.ts", additions: 95, deletions: 8, changeType: "modified" },
        { path: "src/styles.css", additions: 410, deletions: 0, changeType: "modified" },
        { path: "src/module/index.ts", additions: 9, deletions: 0, changeType: "modified" },
        { path: "vite.config.ts", additions: 2, deletions: 0, changeType: "modified" },
        { path: "package.json", additions: 20, deletions: 0, changeType: "modified" },
        { path: "tsconfig.json", additions: 7, deletions: 0, changeType: "modified" },
        { path: "tsconfig.app.json", additions: 23, deletions: 0, changeType: "modified" },
        { path: "src/main.tsx", additions: 9, deletions: 0, changeType: "modified" },
      ],
    })

    pushFileLink(setMessages, {
      path: "src/module/CodexChat.tsx",
      line: 1,
      label: "CodexChat.tsx",
      description: "Right-click for Open file, Reveal in Explorer, Open with, or Copy path",
    })

    setRunLabel("Streaming answer")
    await streamAssistant(
      setMessages,
      [
        "Demo now shows the Codex-style compact flow: reasoning summary, command history, edited files, file links and web links.",
        "",
        "Try right-clicking `CodexChat.tsx` above, or this SDK link: [Codex TypeScript SDK](https://github.com/openai/codex/tree/main/sdk/typescript).",
        "",
        "Important integration point: the UI does not call Windows Explorer directly. It emits callbacks such as `onRevealFile`, `onOpenFileWith`, `onOpenExternalLink`, and the host app decides whether that is handled by a backend endpoint, Electron, Tauri, or another bridge.",
      ].join("\n")
    )

    setRunLabel("Ready")
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      setMessages((current) => [...current, {
        id: createId("status"),
        type: "status",
        status: "waiting",
        label: "Run stopped",
        detail: "User cancelled the active stream",
        createdAt: now(),
      }])
      setRunLabel("Stopped")
      return
    }

    setMessages((current) => [...current, {
      id: createId("status"),
      type: "status",
      status: "error",
      label: "Agent error",
      detail: error instanceof Error ? error.message : String(error),
      createdAt: now(),
    }])
    setRunLabel("Error")
  } finally {
    setRunning(false)
  }
}
