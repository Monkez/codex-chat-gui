import test from "node:test"
import assert from "node:assert/strict"
import { cleanCodexErrorMessage, sdkItemToUiMessage, stripAnsi } from "../scripts/codex-ui-adapter.mjs"

test("sdkItemToUiMessage scopes ids per run", () => {
  const message = sdkItemToUiMessage({
    id: "item-1",
    type: "agent_message",
    text: "hello",
  }, "item.completed", "run-1", 123)

  assert.equal(message.id, "run-1:item-1")
  assert.equal(message.status, "complete")
  assert.equal(message.createdAt, 123)
})

test("file changes without exact diff stats are marked unavailable", () => {
  const message = sdkItemToUiMessage({
    id: "change-1",
    type: "file_change",
    changes: [
      { path: "README.md", kind: "update" },
    ],
  }, "item.completed", "run-1", 123)

  assert.equal(message.type, "file_changes")
  assert.equal(message.files[0].statsKind, "unavailable")
  assert.equal(message.files[0].additions, 0)
  assert.equal(message.files[0].deletions, 0)
  assert.equal(message.canUndo, false)
  assert.equal(message.status, "complete")
})

test("failed file changes surface an error without fake actions", () => {
  const message = sdkItemToUiMessage({
    id: "change-failed",
    type: "file_change",
    status: "failed",
    changes: [{ path: "README.md", kind: "update" }],
  }, "item.completed", "run-1", 123)

  assert.equal(message.status, "error")
  assert.equal(message.canUndo, false)
  assert.equal(message.canReview, false)
})

test("todo lists render as an expandable plan", () => {
  const message = sdkItemToUiMessage({
    id: "todo-1",
    type: "todo_list",
    items: [
      { text: "Inspect", completed: true },
      { text: "Fix", completed: false },
    ],
  }, "item.updated", "run-1", 123)

  assert.equal(message.type, "reasoning")
  assert.equal(message.status, "thinking")
  assert.equal(message.defaultExpanded, true)
  assert.deepEqual(message.steps, ["[x] Inspect", "[ ] Fix"])
})

test("cleanCodexErrorMessage removes warning noise", () => {
  const message = cleanCodexErrorMessage("WARN noisy\nCodex Exec exited with code 1: useful")

  assert.equal(message, "Codex Exec exited with code 1: useful")
})

test("cleanCodexErrorMessage explains outdated model cache once", () => {
  const message = cleanCodexErrorMessage("failed to load models cache: unknown variant `max`, expected one of `none`, `minimal`, `low`, `medium`, `high`, `xhigh`")
  assert.equal(message, "This model requires a newer local Codex runtime. Close the app and run run.bat again (or npm install), then retry.")
})

test("cleanCodexErrorMessage explains a model version requirement", () => {
  const message = cleanCodexErrorMessage("The 'gpt-5.6-sol' model requires a newer version of Codex.")
  assert.equal(message, "This model requires a newer local Codex runtime. Close the app and run run.bat again (or npm install), then retry.")
})

test("stripAnsi removes terminal color sequences from Codex CLI output", () => {
  const message = stripAnsi("Welcome \u001b[90m0.13.0\u001b[0m [94mhttps://auth.openai.com/codex/device[0m")

  assert.equal(message, "Welcome 0.13.0 https://auth.openai.com/codex/device")
})

test("sdkItemToUiMessage safely ignores malformed SDK items", () => {
  assert.equal(sdkItemToUiMessage(null, "item.completed", "run-1", 123), null)
  const command = sdkItemToUiMessage({ id: "command-1", type: "command_execution", status: "failed" }, "item.completed", "run-1", 123)
  assert.equal(command.title, "Command")
  assert.equal(command.status, "error")
})
