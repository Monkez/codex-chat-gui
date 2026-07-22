import { useCallback, useEffect, useRef, useState } from "react"
import type { CodexPromptChoice, CodexPromptRequest } from "../types"

interface PromptDialogProps {
  request: CodexPromptRequest
  onResolve?: (request: CodexPromptRequest, choice: CodexPromptChoice) => void | Promise<void>
}

export function PromptDialog({ request, onResolve }: PromptDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const resolvingRef = useRef(false)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [isResolving, setResolving] = useState(false)
  const resolveChoice = useCallback(async (choice: CodexPromptChoice | undefined) => {
    if (!choice || resolvingRef.current) return
    resolvingRef.current = true
    setResolving(true)
    try {
      await onResolve?.(request, choice)
    } catch {
      resolvingRef.current = false
      setResolving(false)
    }
  }, [onResolve, request])
  const cancelChoice = request.choices.find((choice) => choice.id === request.cancelChoiceId)
  const defaultChoice = request.choices.find((choice) => choice.id === request.defaultChoiceId)
    ?? request.choices.find((choice) => choice.tone === "primary")
    ?? request.choices[0]
  const describedBy = request.message || request.detail ? `codex-dialog-desc-${request.id}` : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.hasAttribute("disabled"))
    const initial = defaultChoice
      ? focusable.find((element) => element.dataset.choiceId === defaultChoice.id)
      : focusable[0]
    initial?.focus()

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        resolveChoice(cancelChoice)
        return
      }
      if (event.key !== "Tab" || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [cancelChoice, defaultChoice, resolveChoice])

  return (
    <div
      className="codex-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) void resolveChoice(cancelChoice)
      }}
    >
      <section
        ref={dialogRef}
        className={`codex-dialog codex-dialog-${request.variant ?? "default"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`codex-dialog-title-${request.id}`}
        aria-describedby={describedBy}
      >
        <header>
          <strong id={`codex-dialog-title-${request.id}`}>{request.title}</strong>
          {request.message ? <p id={`codex-dialog-desc-${request.id}`}>{request.message}</p> : null}
        </header>
        {request.detail ? <pre id={request.message ? undefined : `codex-dialog-desc-${request.id}`}>{request.detail}</pre> : null}
        <div className="codex-dialog-actions">
          {request.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              data-choice-id={choice.id}
              className={`tone-${choice.tone ?? "secondary"}`}
              disabled={isResolving}
              onClick={() => void resolveChoice(choice)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

