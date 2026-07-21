import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import path from "node:path"
import {
  decodeAttachments,
  getAllowedOrigins,
  hasValidSessionToken,
  isAllowedOrigin,
  readJsonBody,
  resolveWorkspacePath,
  safeAttachmentName,
} from "../scripts/bridge-security.mjs"

test("bridge accepts only configured browser origins", () => {
  const origins = getAllowedOrigins("https://trusted.example")
  assert.equal(isAllowedOrigin("http://localhost:5173", origins), true)
  assert.equal(isAllowedOrigin("https://trusted.example", origins), true)
  assert.equal(isAllowedOrigin("https://malicious.example", origins), false)
  assert.equal(isAllowedOrigin(undefined, origins), true)
})

test("bridge session tokens use exact timing-safe matches", () => {
  assert.equal(hasValidSessionToken("secret-token", "secret-token"), true)
  assert.equal(hasValidSessionToken("secret", "secret-token"), false)
  assert.equal(hasValidSessionToken(undefined, "secret-token"), false)
})

test("workspace paths cannot escape the project", () => {
  const root = path.resolve("workspace")
  assert.equal(resolveWorkspacePath(root, "src/index.ts"), path.join(root, "src", "index.ts"))
  assert.throws(() => resolveWorkspacePath(root, "../secret.txt"), /outside the workspace/)
})

test("attachment names are normalized and base64 is validated", () => {
  assert.equal(safeAttachmentName("../../bad:name?.txt"), "bad-name-.txt")
  assert.throws(() => decodeAttachments([{ name: "bad.txt", dataBase64: "not@@base64" }]), /valid base64/)
  const [attachment] = decodeAttachments([{
    name: "note.txt",
    mimeType: "text/plain",
    kind: "file",
    dataBase64: Buffer.from("hello").toString("base64"),
  }])
  assert.equal(attachment.name, "note.txt")
  assert.equal(attachment.buffer.toString("utf8"), "hello")
})

test("JSON body parsing enforces a byte limit", async () => {
  const request = new EventEmitter()
  const pending = readJsonBody(request, 8)
  request.emit("data", Buffer.from('{"large":'))
  request.emit("data", Buffer.from('"value"}'))
  request.emit("end")
  await assert.rejects(pending, /too large/)
})

