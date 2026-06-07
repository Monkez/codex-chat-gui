import test from "node:test"
import assert from "node:assert/strict"
import { cleanCodexErrorMessage, sdkItemToUiMessage } from "../scripts/codex-ui-adapter.mjs"

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
      { path: "README.md", kind: "modify" },
    ],
  }, "item.completed", "run-1", 123)

  assert.equal(message.type, "file_changes")
  assert.equal(message.files[0].statsKind, "unavailable")
  assert.equal(message.files[0].additions, 0)
  assert.equal(message.files[0].deletions, 0)
})

test("cleanCodexErrorMessage removes warning noise", () => {
  const message = cleanCodexErrorMessage("WARN noisy\nCodex Exec exited with code 1: useful")

  assert.equal(message, "Codex Exec exited with code 1: useful")
})
