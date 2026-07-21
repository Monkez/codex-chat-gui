import test from "node:test"
import assert from "node:assert/strict"
import { isVersionAtLeast, parseVersion } from "../scripts/runtime-compat.mjs"

test("runtime compatibility parses semver ranges", () => {
  assert.deepEqual(parseVersion("^0.144.6"), [0, 144, 6])
  assert.deepEqual(parseVersion("codex-cli 1.2.3"), [1, 2, 3])
  assert.equal(parseVersion("unknown"), null)
})

test("runtime compatibility rejects stale Codex installations", () => {
  assert.equal(isVersionAtLeast("0.144.6", "0.144.6"), true)
  assert.equal(isVersionAtLeast("0.145.0", "0.144.6"), true)
  assert.equal(isVersionAtLeast("0.137.0", "0.144.6"), false)
})
