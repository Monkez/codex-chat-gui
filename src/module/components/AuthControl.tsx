import { useState } from "react"
import { ShieldCheck, ShieldOff } from "lucide-react"
import type { CodexAuthState, CodexChatProps } from "../types"

export function AuthControl({
  authState,
  onAuthenticate,
  onStartAccountLogin,
  onSignOut,
  onOpenExternalLink,
}: {
  authState?: CodexAuthState
  onAuthenticate?: (apiKey: string) => void | Promise<void>
  onStartAccountLogin?: () => void | Promise<void>
  onSignOut?: () => void | Promise<void>
  onOpenExternalLink?: CodexChatProps["onOpenExternalLink"]
}) {
  const [apiKey, setApiKey] = useState("")
  const [open, setOpen] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const status = authState?.status ?? "unknown"
  const isAuthenticated = status === "authenticated"
  const isChecking = status === "checking"

  async function submitAuth() {
    const value = apiKey.trim()
    if (!value) return
    await onAuthenticate?.(value)
    setApiKey("")
    setOpen(false)
  }

  function openVerificationPage() {
    const url = authState?.verificationUrl
    if (!url) return
    if (onOpenExternalLink) void onOpenExternalLink(url)
    else window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="codex-auth">
      <button
        type="button"
        className={`codex-auth-button is-${status}`}
        onClick={() => setOpen((current) => !current)}
        title={isAuthenticated ? "Codex account connected" : "Connect Codex account"}
        aria-expanded={open}
      >
        {isAuthenticated ? <ShieldCheck aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
        <span>{isAuthenticated ? authState?.accountLabel ?? "Connected" : "Connect Codex"}</span>
      </button>
      {open ? (
        <div className="codex-auth-popover" role="dialog" aria-label="Codex authentication">
          <strong>{isAuthenticated ? "Codex authenticated" : "Authenticate Codex"}</strong>
          <p>
            {authState?.detail
              ?? "Connect with your ChatGPT/Codex account using the local Codex CLI device-login flow."}
          </p>
          {authState?.verificationUrl || authState?.userCode ? (
            <div className="codex-device-login">
              {authState.verificationUrl ? (
                <button type="button" className="codex-device-link" onClick={openVerificationPage}>
                  Open verification page
                </button>
              ) : null}
              {authState.userCode ? <code>{authState.userCode}</code> : null}
            </div>
          ) : null}
          {isAuthenticated ? (
            <button type="button" onClick={() => void onSignOut?.()}>
              Sign out
            </button>
          ) : (
            <>
              {onStartAccountLogin ? (
                <button type="button" onClick={() => void onStartAccountLogin()} disabled={isChecking}>
                  {isChecking ? "Waiting..." : "Connect Codex account"}
                </button>
              ) : null}
              {onAuthenticate ? (
                <button type="button" className="codex-auth-secondary" onClick={() => setShowApiKey((current) => !current)}>
                  Use API key
                </button>
              ) : null}
              {showApiKey && onAuthenticate ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitAuth()
                  }}
                >
                  <input
                    type="password"
                    value={apiKey}
                    placeholder="sk-..."
                    autoComplete="off"
                    onChange={(event) => setApiKey(event.target.value)}
                    disabled={isChecking}
                  />
                  <button type="submit" disabled={isChecking || !apiKey.trim()}>
                    {isChecking ? "Checking..." : "Connect"}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

