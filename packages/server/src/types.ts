import { WsMessageType } from '@remote-pilot/shared';

export type ClientRole = 'extension' | 'web';

export type ClientInfo = {
  role: ClientRole;
  token?: string;
  paired: boolean;
};

export type AnyWsMessage = {
  [K in WsMessageType]: import('@remote-pilot/shared').WsMessage<K>;
}[WsMessageType];

export const extensionToWebTypes: WsMessageType[] = [
  'chat_sessions_list',
  'chat_session_update',
  'chat_editing_state',
  'extension_status',
  'command_ack',
];

export const webToExtensionTypes: WsMessageType[] = [
  'send_message',
  'accept_all_edits',
  'reject_all_edits',
  'accept_file_edit',
  'reject_file_edit',
  'continue_iteration',
  'cancel_request',
  'new_chat_session',
  'request_session',
];

export const allTypes = new Set<WsMessageType>([
  'pair_request',
  'pair_response',
  'chat_sessions_list',
  'chat_session_update',
  'chat_editing_state',
  'send_message',
  'accept_all_edits',
  'reject_all_edits',
  'accept_file_edit',
  'reject_file_edit',
  'continue_iteration',
  'cancel_request',
  'new_chat_session',
  'request_session',
  'command_ack',
  'ping',
  'pong',
  'extension_status',
]);
