import type { ReactNode } from "react"

export type CodexAttachmentKind = "image" | "file"

export interface CodexChatAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  kind: CodexAttachmentKind
  url?: string
  file?: File
}

export interface CodexChatSubmitPayload {
  content: string
  attachments: CodexChatAttachment[]
}

export type CodexRunStatus = "idle" | "starting" | "running" | "waiting" | "error"
export type CodexToolStatus = "queued" | "running" | "complete" | "error"
export type CodexReasoningStatus = "thinking" | "complete"
export type CodexAuthStatus = "unknown" | "signed_out" | "checking" | "authenticated" | "error"

export interface CodexAuthState {
  status: CodexAuthStatus
  accountLabel?: string
  detail?: string
  verificationUrl?: string
  userCode?: string
}

export interface CodexFileChange {
  path: string
  additions: number
  deletions: number
  changeType?: "added" | "modified" | "deleted" | "renamed"
}

export interface CodexLinkTarget {
  href: string
  label?: string
}

interface CodexTranscriptBase {
  id: string
  createdAt: number
}

export interface CodexUserMessage extends CodexTranscriptBase {
  type: "user"
  content: string
  attachments?: CodexChatAttachment[]
}

export interface CodexAssistantMessage extends CodexTranscriptBase {
  type: "assistant"
  content: string
  status?: "streaming" | "complete" | "error"
}

export interface CodexToolMessage extends CodexTranscriptBase {
  type: "tool"
  title: string
  status: CodexToolStatus
  command?: string
  input?: string
  output?: string
  durationMs?: number
}

export interface CodexReasoningMessage extends CodexTranscriptBase {
  type: "reasoning"
  title: string
  status: CodexReasoningStatus
  steps: string[]
  defaultExpanded?: boolean
}

export interface CodexFileChangeMessage extends CodexTranscriptBase {
  type: "file_changes"
  title?: string
  files: CodexFileChange[]
  canUndo?: boolean
  canReview?: boolean
}

export interface CodexFileLinkMessage extends CodexTranscriptBase {
  type: "file_link"
  path: string
  label?: string
  line?: number
  description?: string
}

export interface CodexStatusMessage extends CodexTranscriptBase {
  type: "status"
  status: CodexRunStatus
  label: string
  detail?: string
}

export type CodexPromptVariant = "default" | "approval" | "danger"

export interface CodexPromptChoice {
  id: string
  label: string
  tone?: "primary" | "secondary" | "danger"
}

export interface CodexPromptRequest {
  id: string
  title: string
  message?: string
  detail?: string
  variant?: CodexPromptVariant
  choices: CodexPromptChoice[]
}

export type CodexTranscriptItem =
  | CodexUserMessage
  | CodexAssistantMessage
  | CodexToolMessage
  | CodexReasoningMessage
  | CodexFileChangeMessage
  | CodexFileLinkMessage
  | CodexStatusMessage

export interface CodexChatProps {
  title?: string
  subtitle?: string
  projectLabel?: string
  placeholder?: string
  messages: CodexTranscriptItem[]
  isRunning?: boolean
  runStatus?: CodexRunStatus
  runLabel?: string
  authState?: CodexAuthState
  headerControls?: ReactNode
  promptRequest?: CodexPromptRequest | null
  onSubmit: (payload: CodexChatSubmitPayload) => void | Promise<void>
  onCancel?: () => void
  onAuthenticate?: (apiKey: string) => void | Promise<void>
  onStartAccountLogin?: () => void | Promise<void>
  onSignOut?: () => void | Promise<void>
  onUndoChanges?: (message: CodexFileChangeMessage) => void | Promise<void>
  onReviewChanges?: (message: CodexFileChangeMessage) => void | Promise<void>
  onOpenFile?: (path: string, line?: number) => void | Promise<void>
  onRevealFile?: (path: string) => void | Promise<void>
  onOpenFileWith?: (path: string) => void | Promise<void>
  onOpenExternalLink?: (href: string) => void | Promise<void>
  onCopyText?: (text: string) => void | Promise<void>
  onPromptResolve?: (request: CodexPromptRequest, choice: CodexPromptChoice) => void | Promise<void>
  quickPrompts?: string[]
  className?: string
  maxAttachments?: number
  compactTools?: boolean
  showActivityPanel?: boolean
}
