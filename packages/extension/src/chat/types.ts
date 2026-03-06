/**
 * VS Code internal types for chat session file formats.
 *
 * These represent the on-disk format used by VS Code to persist Copilot chat
 * sessions and editing state. They are NOT part of the remote-pilot protocol
 * and should only be used within the extension package for parsing purposes.
 */

/** Shape of the session data inside JSONL files in workspaceStorage/{hash}/chatSessions/{id}.jsonl */
export interface VscodeChatSessionFile {
  version: number;
  sessionId: string;
  requesterUsername?: string;
  responderUsername?: string;
  responderAvatarIconUri?: { id: string };
  initialLocation?: string;
  creationDate?: number;
  lastMessageDate?: number;
  isImported?: boolean;
  hasPendingEdits?: boolean;
  customTitle?: string;
  requests: VscodeChatRequestData[];
  inputState?: {
    mode?: { id: string; kind: string };
    selectedModel?: {
      identifier: string;
      metadata?: { name?: string; family?: string };
    };
    inputText?: string;
  };
}

export interface VscodeChatRequestData {
  requestId: string;
  message: string | { text: string; parts?: unknown[] };
  variableData?: unknown;
  response: VscodeChatResponseItem[];
  responseId?: string;
  result?: { metadata?: Record<string, unknown> };
  followups?: unknown[];
  isCanceled?: boolean;
  agent?: { id: string };
  contentReferences?: unknown[];
  codeCitations?: unknown[];
  timestamp?: number;
}

export interface VscodeChatResponseItem {
  kind?: string;
  /** Markdown content (plain items without kind) or thinking text */
  value?: string | { value: string; [key: string]: unknown };
  supportThemeIcons?: boolean;
  supportHtml?: boolean;
  supportAlertSyntax?: boolean;
  baseUri?: unknown;
  uris?: unknown;
  // Tool invocation fields
  invocationMessage?: string | { value: string; [key: string]: unknown };
  pastTenseMessage?: string | { value: string; [key: string]: unknown };
  isConfirmed?: boolean;
  isComplete?: boolean;
  toolCallId?: string;
  toolId?: string;
  resultDetails?: unknown;
  source?: unknown;
  generatedTitle?: unknown;
  // Inline reference fields
  inlineReference?: unknown;
  name?: string;
  resolveId?: string;
  // Text edit group fields
  uri?: string;
  edits?: unknown;
  done?: boolean;
  // Thinking fields
  id?: string;
  // Code block URI fields
  isEdit?: boolean;
  // Progress task fields
  content?: string | { value: string; [key: string]: unknown };
  progress?: unknown;
}

/** Shape of chatEditingSessions/{sessionId}/state.json */
export interface VscodeChatEditingSessionFile {
  version: number;
  sessionId?: string;
  linearHistory?: {
    requestId: string;
    stops: VscodeEditingStop[];
  }[];
  recentSnapshot?: {
    entries: VscodeEditingEntry[];
  };
  timeline?: {
    checkpoints: unknown[];
    currentEpoch: number;
    fileBaselines: unknown[];
    operations: unknown[];
  };
}

export interface VscodeEditingStop {
  stopId?: string;
  entries: VscodeEditingEntry[];
}

export interface VscodeEditingEntry {
  resource: string;
  languageId?: string;
  originalHash: string;
  currentHash: string;
  originalToCurrentEdit: unknown[];
  /** 0 = undecided, 1 = accepted, 2 = rejected */
  state: number;
}
