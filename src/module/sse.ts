export interface ParsedSseFrame {
  eventName: string
  data: unknown
}

export function parseSseFrame(frame: string): ParsedSseFrame | null {
  let eventName = "message"
  const dataLines: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return null
  try {
    return {
      eventName,
      data: JSON.parse(dataLines.join("\n")),
    }
  } catch {
    return {
      eventName: "error",
      data: { message: dataLines.join("\n") },
    }
  }
}
