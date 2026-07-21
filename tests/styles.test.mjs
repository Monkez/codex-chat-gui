import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

function ruleBody(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `Missing CSS rule for ${selector}`)
  return match[1]
}

test("chat header creates a stacking layer above transcript content", () => {
  const header = ruleBody(".codex-chat-header")
  assert.match(header, /position:\s*relative/)
  assert.match(header, /z-index:\s*15/)
})

test("settings popover uses an opaque surface", () => {
  const popover = ruleBody(".codex-run-settings-popover")
  assert.match(popover, /background:\s*var\(--surface\)/)
})
