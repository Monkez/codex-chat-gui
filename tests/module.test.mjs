import test from "node:test"
import assert from "node:assert/strict"

const now = 1
let moduleApi

async function loadModuleApi() {
  globalThis.document ??= {
    createElement: () => ({}),
  }
  moduleApi ??= await import("../dist/lib/codex-chat-gui.js")
  return moduleApi
}

test("buildTranscriptRows only groups adjacent tools", async () => {
  const { buildTranscriptRows } = await loadModuleApi()
  const rows = buildTranscriptRows([
    { id: "a1", type: "assistant", content: "intro", status: "complete", createdAt: now },
    { id: "t1", type: "tool", title: "one", status: "complete", createdAt: now },
    { id: "t2", type: "tool", title: "two", status: "complete", createdAt: now },
    { id: "a2", type: "assistant", content: "middle", status: "complete", createdAt: now },
    { id: "t3", type: "tool", title: "three", status: "complete", createdAt: now },
  ], true)

  assert.equal(rows.length, 4)
  assert.equal(rows[0].kind, "item")
  assert.equal(rows[1].kind, "tool_group")
  assert.equal(rows[1].tools.length, 2)
  assert.equal(rows[2].kind, "item")
  assert.equal(rows[2].item.id, "a2")
  assert.equal(rows[3].kind, "item")
  assert.equal(rows[3].item.id, "t3")
})

test("getCurrentTurnMessages scopes activity to the latest user turn", async () => {
  const { getCurrentTurnMessages } = await loadModuleApi()
  const messages = [
    { id: "old", type: "tool", title: "old", status: "complete", createdAt: now },
    { id: "user", type: "user", content: "next", createdAt: now },
    { id: "new", type: "tool", title: "new", status: "running", createdAt: now },
  ]
  assert.deepEqual(getCurrentTurnMessages(messages).map((item) => item.id), ["new"])
})

test("parseSseFrame supports multiline data payloads", async () => {
  const { parseSseFrame } = await loadModuleApi()
  const parsed = parseSseFrame([
    "event: ui-message",
    "data: {",
    "data: \"id\":\"m1\",",
    "data: \"type\":\"assistant\"",
    "data: }",
  ].join("\n"))

  assert.equal(parsed.eventName, "ui-message")
  assert.deepEqual(parsed.data, { id: "m1", type: "assistant" })
})

test("parseSseFrame converts malformed payloads into error frames", async () => {
  const { parseSseFrame } = await loadModuleApi()
  const parsed = parseSseFrame("event: ui-message\ndata: not json")

  assert.equal(parsed.eventName, "error")
  assert.deepEqual(parsed.data, { message: "not json" })
})

test("isCodexTranscriptItem rejects malformed bridge payloads", async () => {
  const { isCodexTranscriptItem } = await loadModuleApi()

  assert.equal(isCodexTranscriptItem({
    id: "message-1",
    type: "assistant",
    content: "hello",
    createdAt: 123,
  }), true)
  assert.equal(isCodexTranscriptItem({
    id: "message-2",
    type: "assistant",
    createdAt: 123,
  }), false)
  assert.equal(isCodexTranscriptItem({
    id: "message-3",
    type: "unknown",
    createdAt: 123,
  }), false)
})
