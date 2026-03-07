export const PROTOCOL_VERSION = 1;

// ----------------------------------------------------------
// Message envelope
// ----------------------------------------------------------

export interface WsMessage<T extends WsMessageType = WsMessageType> {
  /** Protocol version for forward-compat */
  version: typeof PROTOCOL_VERSION;
  /** Unique message id (UUID) */
  id: string;
  /** Message type discriminator */
  type: T;
  /** Payload (shape depends on `type`) */
  data: WsMessageDataMap[T];
  /** ISO-8601 timestamp */
  timestamp: string;
}

// ----------------------------------------------------------
// Message types
// ----------------------------------------------------------

export type WsMessageType =
  // Auth / pairing
  | 'pair_request'
  | 'pair_response'
  // Chat session data (extension → server → web)
  | 'chat_sessions_list'
  | 'chat_session_update'
  | 'chat_editing_state'
  // Commands (web → server → extension)
  | 'send_message'
  | 'accept_all_edits'
  | 'reject_all_edits'
  | 'accept_file_edit'
  | 'reject_file_edit'
  | 'continue_iteration'
  | 'cancel_request'
  | 'new_chat_session'
  | 'request_session'
  | 'request_sessions_list'
  | 'set_model'
  // Model data (extension → server → web)
  | 'available_models'
  // Command acknowledgement (extension → server → web)
  | 'command_ack'
  // Connection state
  | 'ping'
  | 'pong'
  | 'extension_status';

// ----------------------------------------------------------
// Payload map
// ----------------------------------------------------------

export interface WsMessageDataMap {
  // Auth
  pair_request: PairRequest;
  pair_response: PairResponse;

  // Chat data
  chat_sessions_list: ChatSessionsList;
  chat_session_update: ChatSessionUpdate;
  chat_editing_state: ChatEditingState;

  // Commands
  send_message: SendMessageCommand;
  accept_all_edits: EmptyPayload;
  reject_all_edits: EmptyPayload;
  accept_file_edit: FileEditCommand;
  reject_file_edit: FileEditCommand;
  continue_iteration: EmptyPayload;
  cancel_request: EmptyPayload;
  new_chat_session: EmptyPayload;
  request_session: RequestSessionCommand;
  request_sessions_list: EmptyPayload;
  set_model: SetModelCommand;

  // Model data
  available_models: AvailableModels;

  // Ack
  command_ack: CommandAck;

  // Connection
  ping: EmptyPayload;
  pong: EmptyPayload;
  extension_status: ExtensionStatus;
}

// ----------------------------------------------------------
// Payload definitions
// ----------------------------------------------------------

export type EmptyPayload = Record<string, never>;

export interface ModelInfo {
  identifier: string;
  id: string;
  vendor: string;
  name: string;
  family: string;
}

/** Web → Server: pair with a code */
export interface PairRequest {
  pairingCode: string;
}

/** Server → Web: pairing result */
export interface PairResponse {
  success: boolean;
  error?: string;
  /** Auth token for subsequent messages */
  token?: string;
}

/** Extension → Server → Web: list of available chat sessions */
export interface ChatSessionsList {
  workspaceName: string;
  workspacePath: string;
  sessions: ChatSessionSummary[];
}

export interface ChatSessionSummary {
  sessionId: string;
  /** First user message or empty */
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

/** Extension → Server → Web: updated chat session content */
export interface ChatSessionUpdate {
  sessionId: string;
  requests: ChatRequest[];
  hasPendingEdits: boolean;
  selectedModel?: ModelInfo;
}

export interface ChatRequest {
  requestId: string;
  /** User's message */
  message: string;
  /** Copilot's response parts */
  responseParts: ChatResponsePart[];
  /** Whether the response is still streaming */
  isStreaming: boolean;
  /** Whether the request was cancelled */
  isCanceled: boolean;
  /** ISO-8601 */
  timestamp: string;
}

export interface ChatResponsePart {
  kind: 'markdown' | 'tool_invocation' | 'code_citation' | 'text_edit' | 'unknown';
  /** Markdown text or tool description */
  content: string;
  /** For tool invocations */
  toolName?: string;
  toolStatus?: 'running' | 'completed' | 'failed';
  /** For text_edit: workspace-relative file path */
  filePath?: string;
}

/** Extension → Server → Web: editing session state */
export interface ChatEditingState {
  sessionId: string;
  entries: ChatEditingEntry[];
}

export interface ChatEditingEntry {
  /** File path relative to workspace root */
  filePath: string;
  /** 0 = undecided, 1 = accepted, 2 = rejected */
  state: 0 | 1 | 2;
  /** Short hash of the original file */
  originalHash: string;
  /** Short hash of the current (edited) file */
  currentHash: string;
}

/** Web → Extension: send a chat message */
export interface SendMessageCommand {
  /** Optional session ID to send to. If omitted, sends to the active session. */
  sessionId?: string;
  /** The prompt text to send */
  prompt: string;
}

/** Web → Extension: accept/reject a specific file edit */
export interface FileEditCommand {
  filePath: string;
}

/** Web → Extension: request a specific session's content */
export interface RequestSessionCommand {
  sessionId: string;
}

/** Web → Extension: set the chat model */
export interface SetModelCommand {
  model: ModelInfo;
}

/** Extension → Web: list of available language models */
export interface AvailableModels {
  models: ModelInfo[];
}

/** Extension → Web: acknowledge a command was received and processed */
export interface CommandAck {
  /** ID of the original message being acknowledged */
  requestId: string;
  success: boolean;
  error?: string;
}

/** Extension → Server → Web: extension connection/capability status */
export interface ExtensionStatus {
  connected: boolean;
}

// ----------------------------------------------------------
// Utility
// ----------------------------------------------------------

export function createMessage<T extends WsMessageType>(
  type: T,
  data: WsMessageDataMap[T],
): WsMessage<T> {
  return {
    version: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    type,
    data,
    timestamp: new Date().toISOString(),
  };
}
