import type { CodexToolMessage, CodexTranscriptItem } from "./types"

export type TranscriptRenderRow =
  | { kind: "item"; item: CodexTranscriptItem }
  | { kind: "tool_group"; id: string; tools: CodexToolMessage[] }

export function buildTranscriptRows(messages: CodexTranscriptItem[], compactTools: boolean): TranscriptRenderRow[] {
  if (!compactTools) {
    return messages.map((item) => ({ kind: "item", item }))
  }

  const rows: TranscriptRenderRow[] = []
  let index = 0
  while (index < messages.length) {
    const item = messages[index]
    if (item?.type !== "tool") {
      rows.push({ kind: "item", item })
      index += 1
      continue
    }

    const tools: CodexToolMessage[] = []
    while (index < messages.length && messages[index]?.type === "tool") {
      tools.push(messages[index] as CodexToolMessage)
      index += 1
    }

    if (tools.length === 1) {
      rows.push({ kind: "item", item: tools[0]! })
    } else {
      rows.push({ kind: "tool_group", id: `tool-group:${tools[0]?.id}`, tools })
    }
  }
  return rows
}
