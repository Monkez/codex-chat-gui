import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  decodeAttachments,
  getAllowedOrigins,
  hasValidSessionToken,
  isAllowedOrigin,
  parseBoundedInteger,
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

test("workspace paths cannot escape the project through traversal or links", (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ui-security-"))
  const workspace = path.join(tempRoot, "workspace")
  const outside = path.join(tempRoot, "outside")
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true })
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(workspace, "src", "index.ts"), "export {}")
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret")
  fs.symlinkSync(outside, path.join(workspace, "linked-outside"), process.platform === "win32" ? "junction" : "dir")
  context.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))

  assert.equal(resolveWorkspacePath(workspace, "src/index.ts"), fs.realpathSync.native(path.join(workspace, "src", "index.ts")))
  assert.throws(() => resolveWorkspacePath(workspace, "missing.ts"), /does not exist/)
  assert.throws(() => resolveWorkspacePath(workspace, "../outside/secret.txt"), /outside the workspace/)
  assert.throws(() => resolveWorkspacePath(workspace, "linked-outside/secret.txt"), /outside the workspace/)
})

test("bounded integer settings reject invalid and excessive values", () => {
  assert.equal(parseBoundedInteger("4", 2, 1, 8), 4)
  assert.equal(parseBoundedInteger("not-a-number", 2, 1, 8), 2)
  assert.equal(parseBoundedInteger("99", 2, 1, 8), 2)
  assert.equal(parseBoundedInteger("2.5", 2, 1, 8), 2)
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

