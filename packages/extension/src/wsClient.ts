import WebSocket from "ws";
import {
  ChatEditingState,
  ChatSessionUpdate,
  ChatSessionsList,
  CommandAck,
  ExtensionStatus,
  SendMessageCommand,
  FileEditCommand,
  WsMessage,
  createMessage,
} from "@remote-pilot/shared";
import {
  acceptAllEdits,
  acceptFileEdit,
  cancelRequest,
  continueIteration,
  newChatSession,
  rejectAllEdits,
  rejectFileEdit,
  sendMessage,
} from "./copilotCommands";

type MessageHandler = (message: WsMessage) => void;

export class WsClient {
  private socket: WebSocket | null = null;
  private readonly serverPort: number;
  private readonly serverToken: string;
  private readonly role: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private onMessageHandler?: MessageHandler;

  constructor(serverPort: number, serverToken: string, role = "extension") {
    this.serverPort = serverPort;
    this.serverToken = serverToken;
    this.role = role;
  }

  connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    this.clearReconnect();

    const url = `ws://localhost:${this.serverPort}?role=${encodeURIComponent(this.role)}&token=${encodeURIComponent(this.serverToken)}`;
    this.socket = new WebSocket(url);

    this.socket.on("open", () => {
      this.reconnectDelay = 1000;
      this.startPing();
    });

    this.socket.on("message", (data: WebSocket.RawData) => {
      const raw = data.toString();
      try {
        const message = JSON.parse(raw) as WsMessage;
        if (message.type === "ping") {
          this.send(createMessage("pong", {}));
          return;
        }
        this.handleIncoming(message).catch(() => {
          return;
        });
        if (this.onMessageHandler) {
          this.onMessageHandler(message);
        }
      } catch {
        return;
      }
    });

    const onClose = () => {
      this.stopPing();
      this.scheduleReconnect();
    };

    this.socket.on("close", onClose);
    this.socket.on("error", onClose);
  }

  disconnect(): void {
    this.clearReconnect();
    this.stopPing();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  onMessage(handler: MessageHandler): void {
    this.onMessageHandler = handler;
  }

  send(message: WsMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  sendChatSessionsList(list: ChatSessionsList): void {
    this.send(createMessage("chat_sessions_list", list));
  }

  sendChatSessionUpdate(update: ChatSessionUpdate): void {
    this.send(createMessage("chat_session_update", update));
  }

  sendChatEditingState(state: ChatEditingState): void {
    this.send(createMessage("chat_editing_state", state));
  }

  sendExtensionStatus(status: ExtensionStatus): void {
    this.send(createMessage("extension_status", status));
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send(createMessage("ping", {}));
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const delay = this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async handleIncoming(message: WsMessage): Promise<void> {
    let ack: CommandAck | null = null;
    switch (message.type) {
      case "send_message": {
        const data = message.data as SendMessageCommand;
        const result = await sendMessage(data.prompt);
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      case "accept_all_edits": {
        const result = await acceptAllEdits();
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      case "reject_all_edits": {
        const result = await rejectAllEdits();
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      case "accept_file_edit": {
        const data = message.data as FileEditCommand;
        const result = await acceptFileEdit(data.filePath);
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      case "reject_file_edit": {
        const data = message.data as FileEditCommand;
        const result = await rejectFileEdit(data.filePath);
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      case "continue_iteration": {
        const result = await continueIteration();
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      case "cancel_request": {
        const result = await cancelRequest();
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      case "new_chat_session": {
        const result = await newChatSession();
        ack = { requestId: message.id, success: result.success, error: result.error };
        break;
      }
      default:
        return;
    }

    if (ack) {
      this.send(createMessage("command_ack", ack));
    }
  }
}
