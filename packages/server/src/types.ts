import type { WsMessage, WsMessageType } from '@remote-pilot/shared';

export type ClientRole = 'extension' | 'web';

export type ClientInfo = {
  role: ClientRole;
  token?: string;
  paired: boolean;
};

export type AnyWsMessage = {
  [K in WsMessageType]: WsMessage<K>;
}[WsMessageType];

export const extensionToWebTypes: readonly WsMessageType[] = [
  'chat_sessions_list',
  'chat_session_update',
  'chat_editing_state',
  'extension_status',
  'command_ack',
  'available_models',
];

export const webToExtensionTypes: readonly WsMessageType[] = [
  'send_message',
  'accept_all_edits',
  'reject_all_edits',
  'accept_file_edit',
  'reject_file_edit',
  'continue_iteration',
  'cancel_request',
  'new_chat_session',
  'request_session',
  'request_sessions_list',
  'set_model',
];

export const allTypes = new Set<WsMessageType>([
  'pair_request',
  'pair_response',
  ...extensionToWebTypes,
  ...webToExtensionTypes,
  'ping',
  'pong',
]);
