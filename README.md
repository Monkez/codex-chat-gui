# Codex Chat UI

Reusable React chat UI module for web apps that need an agent transcript, file attachments, image previews, and streaming tool/activity states.

## Demo

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

The dev command starts both services:

- Vite UI on `http://localhost:5173`
- Local Codex bridge on `http://localhost:8787`

Use **Connect Codex** in the header to sign in with your real Codex/ChatGPT account through `codex login --device-auth`. After login, prompts are sent to `@openai/codex-sdk` and streamed back into the chat UI.

## Module API

```tsx
import {
  CodexChat,
  type CodexPromptRequest,
  type CodexTranscriptItem,
} from "./src/module"

function App() {
  const [messages, setMessages] = useState<CodexTranscriptItem[]>([])
  const [promptRequest, setPromptRequest] = useState<CodexPromptRequest | null>(null)

  return (
    <CodexChat
      messages={messages}
      isRunning={isRunning}
      runStatus={isRunning ? "running" : "idle"}
      promptRequest={promptRequest}
      onSubmit={async ({ content, attachments }) => {
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), type: "user", content, attachments, createdAt: Date.now() },
        ])
      }}
      onPromptResolve={(request, choice) => {
        setPromptRequest(null)
        console.log(request.id, choice.id)
      }}
    />
  )
}
```

Map Codex SDK stream events into `CodexTranscriptItem` records:

- `assistant delta` -> update one `type: "assistant"` item with `status: "streaming"`.
- `tool started` -> append `type: "tool"` with `status: "running"` and `command/input`.
- `tool completed` -> update that tool item with `status: "complete"`, `output`, and `durationMs`.
- `run status` -> append `type: "status"` for visible agent progress.
- `reasoning` -> append `type: "reasoning"` to show compact thinking/action summaries.
- `file_change` -> append `type: "file_changes"` for edited-file cards with Undo and Review.

The demo also shows host callbacks for `onOpenFile`, `onRevealFile`, `onOpenFileWith`, `onOpenExternalLink`, `onCopyText`, `onUndoChanges`, and `onReviewChanges`.

### Host Integration Points

- `headerControls` lets a host app inject model, reasoning, permission, or project controls into the chat header.
- `promptRequest` + `onPromptResolve` render an accessible modal for approvals and user choices without coupling the UI to a backend. Use `defaultChoiceId` and `cancelChoiceId` to control keyboard defaults and Escape/backdrop behavior.
- File and link callbacks are host-owned. The web UI never opens Windows Explorer directly; Electron, Tauri, or a local bridge should implement those actions.
- Transcript item ids should be scoped per agent turn/run so later SDK events do not overwrite messages from earlier user prompts.
- File-change line counts should be marked with `statsKind: "exact"` only when the host has real diff stats. Use `statsKind: "unavailable"` to render changed files without misleading `+/-` counts.

## Performance Notes

- The UI groups only adjacent tool events, so text guidance can still appear between tool batches.
- Assistant text uses a lightweight typewriter effect for short/medium responses and skips animation for long markdown or `prefers-reduced-motion`.
- The demo bridge reuses one Codex SDK client and does not send raw SDK events to the browser unless `includeRawEvents` is explicitly set.
- The demo SSE parser supports multi-line `data:` frames and processes a final frame even if the stream closes without a trailing delimiter.

## Auth

The module exposes `authState`, `onStartAccountLogin`, `onAuthenticate`, and `onSignOut` UI hooks. The demo uses account login, not a browser-stored API key:

- `POST /api/codex/auth/device/start` starts `codex login --device-auth`.
- `GET /api/codex/auth/status` checks real Codex CLI auth.
- `POST /api/codex/run` starts a real SDK stream.

The browser never stores Codex credentials. The local bridge owns Codex auth/runtime state and creates the SDK client.

## Notes From Kanna

`jakemor/kanna` is a complete Claude Code web UI, not a drop-in chat component. The useful patterns reused here are the typed transcript model, attachment preview behavior, inline tool call rendering, and a separate live activity surface. This project keeps those ideas but exposes a smaller runtime-neutral React API so a Codex SDK adapter can be added later without coupling the UI to one backend.
