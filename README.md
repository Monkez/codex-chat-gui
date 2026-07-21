# Codex Chat UI

Reusable React chat UI module for web apps that need an agent transcript, file attachments, image previews, and streaming tool/activity states.

## Demo

On Windows, the shortest path is:

```text
setup.bat
run.bat
```

`run.bat` keeps the Vite UI and local Codex bridge in one terminal. The app is available only on the local machine at `http://127.0.0.1:5173`. It also checks the bundled Codex runtime before startup and updates project dependencies when the installed version is too old.

The cross-platform commands are:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The dev command starts both services:

- Vite UI on `http://127.0.0.1:5173`
- Local Codex bridge on `http://127.0.0.1:8787`

Use **Connect Codex** in the header to sign in with your real Codex/ChatGPT account through `codex login --device-auth`. After login, prompts are sent to `@openai/codex-sdk` and streamed back into the chat UI.

## Package Build

```bash
npm run build:lib
npm test
```

The package entry points are:

- `@monkez/codex-chat-gui` for React components, types, transcript utilities, and SSE parsing.
- `@monkez/codex-chat-gui/styles.css` for the bundled UI stylesheet.

The demo app builds to `dist/app`; the reusable package builds to `dist/lib` and `dist/types`.

## Module API

```tsx
import {
  CodexChat,
  type CodexPromptRequest,
  type CodexTranscriptItem,
} from "@monkez/codex-chat-gui"
import "@monkez/codex-chat-gui/styles.css"

function App() {
  const [messages, setMessages] = useState<CodexTranscriptItem[]>([])
  const [promptRequest, setPromptRequest] = useState<CodexPromptRequest | null>(null)

  return (
    <CodexChat
      messages={messages}
      isRunning={isRunning}
      runStatus={isRunning ? "running" : "idle"}
      promptRequest={promptRequest}
      theme="system"
      density="comfortable"
      transcriptWindowSize={300}
      maxAttachmentSizeBytes={5 * 1024 * 1024}
      maxTotalAttachmentBytes={20 * 1024 * 1024}
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
- `theme`, `density`, and CSS variables support light/dark/system rendering and compact dashboards.
- `errorState` + `onErrorAction` provide a reusable bridge/auth/usage-limit error banner.
- `transcriptWindowSize` limits rendered transcript rows for long sessions. Pass `null` to render all rows.
- Attachment count, per-file bytes, and total bytes are independently configurable. Failed submissions restore the draft instead of discarding it.
- Auto-scroll follows live output only while the reader is near the bottom. A **Latest activity** control appears after they scroll up.
- File and link callbacks are host-owned. The web UI never opens Windows Explorer directly; Electron, Tauri, or a local bridge should implement those actions.
- Transcript item ids should be scoped per agent turn/run so later SDK events do not overwrite messages from earlier user prompts.
- File-change line counts should be marked with `statsKind: "exact"` only when the host has real diff stats. Use `statsKind: "unavailable"` to render changed files without misleading `+/-` counts.

## Performance Notes

- The UI groups only adjacent tool events, so text guidance can still appear between tool batches.
- Assistant text uses a lightweight typewriter effect for short/medium responses and skips animation for long markdown or `prefers-reduced-motion`.
- The demo bridge reuses one Codex SDK client and does not send raw SDK events to the browser unless `includeRawEvents` is explicitly set.
- The demo SSE parser supports multi-line `data:` frames and processes a final frame even if the stream closes without a trailing delimiter.
- `buildTranscriptRows` and `parseSseFrame` are exported as pure utilities and covered by Node tests.

## Auth

The module exposes `authState`, `onStartAccountLogin`, `onAuthenticate`, and `onSignOut` UI hooks. The demo uses account login, not a browser-stored API key:

- `POST /api/codex/auth/device/start` starts `codex login --device-auth`.
- `GET /api/codex/auth/status` checks real Codex CLI auth.
- `POST /api/codex/run` starts a real SDK stream.

The browser never stores Codex credentials. The local bridge owns Codex auth/runtime state and creates the SDK client.

## Codex Adapter

The demo bridge uses `scripts/codex-ui-adapter.mjs` to map Codex SDK items into `CodexTranscriptItem` records. Keeping this mapping separate from HTTP/SSE code makes it easier to reuse the adapter in Electron, Tauri, Next.js route handlers, or a local desktop bridge.

## Attachments

The demo sends browser attachments to the local bridge instead of displaying them only in the transcript:

- Images are written to an isolated per-run directory and passed to the Codex SDK as `local_image` inputs.
- Text and source files are decoded into labeled text context.
- Other files are exposed to the run as temporary workspace files.
- Temporary files are removed after the turn finishes or is cancelled.

The default limits are 12 files, 5 MB per file, and 20 MB total.

## Local Bridge Security

The bridge is a privileged local service. It therefore:

- Binds to loopback rather than the LAN.
- Creates an ephemeral session token required by every operational API route.
- Rejects browser origins outside the configured allowlist.
- Caps request, prompt, attachment, and concurrent-run sizes.
- Keeps file actions inside the project workspace.
- Disables `danger-full-access` and the `never` approval policy unless an administrator explicitly enables them.

For a controlled local environment, set `CODEX_ALLOW_DANGER_FULL_ACCESS=1` or `CODEX_ALLOW_NEVER_APPROVAL=1` before starting the bridge. Do not enable these flags for a shared machine.

Additional design and security notes live in `docs/PROJECT.md` and `docs/SECURITY.md`.

## Troubleshooting

If a model reports that it requires a newer Codex version, or the model cache cannot read the `max` reasoning variant, stop the running app and launch `run.bat` again. The launcher updates the local project runtime automatically. You can also run `setup.bat` explicitly.

See `docs/TROUBLESHOOTING.md` for diagnosis steps and recovery commands.

## Notes From Kanna

`jakemor/kanna` is a complete Claude Code web UI, not a drop-in chat component. The useful patterns reused here are the typed transcript model, attachment preview behavior, inline tool call rendering, and a separate live activity surface. This project keeps those ideas but exposes a smaller runtime-neutral React API so a Codex SDK adapter can be added later without coupling the UI to one backend.
