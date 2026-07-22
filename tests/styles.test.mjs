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
  const zIndex = Number(header.match(/z-index:\s*(\d+)/)?.[1])
  assert.ok(zIndex >= 20, `Expected header z-index >= 20, received ${zIndex}`)
})

test("settings popover uses an opaque surface", () => {
  const popover = ruleBody(".codex-run-settings-popover")
  assert.match(popover, /background:\s*var\(--surface\)/)
})

test("library styles do not reset the host document", () => {
  assert.doesNotMatch(styles, /(?:^|\n):root\s*\{/)
  assert.doesNotMatch(styles, /(?:^|\n)body\s*\{/)
  assert.doesNotMatch(styles, /(?:^|\n)#root\s*\{/)
})
