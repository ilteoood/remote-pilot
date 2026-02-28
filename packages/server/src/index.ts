import express from "express";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";

import { WebSocket, WebSocketServer } from "ws";
import {
  PROTOCOL_VERSION,
  WsMessage,
  WsMessageDataMap,
  WsMessageType,
  createMessage,
} from "@remote-pilot/shared";

type AnyWsMessage = { [K in WsMessageType]: WsMessage<K> }[WsMessageType];

type ClientInfo = {
  role: "extension" | "web";
  token?: string;
  paired: boolean;
};

const PORT = Number(process.env.REMOTE_PILOT_PORT ?? "3847");
const HOST = process.env.REMOTE_PILOT_HOST ?? "127.0.0.1";
const SERVER_TOKEN = process.env.REMOTE_PILOT_TOKEN ?? crypto.randomUUID();

const pairingCode = String(Math.floor(100000 + Math.random() * 900000));

const extensionToWebTypes: WsMessageType[] = [
  "chat_sessions_list",
  "chat_session_update",
  "chat_editing_state",
  "extension_status",
  "command_ack",
];

const webToExtensionTypes: WsMessageType[] = [
  "send_message",
  "accept_all_edits",
  "reject_all_edits",
  "accept_file_edit",
  "reject_file_edit",
  "continue_iteration",
  "cancel_request",
  "new_chat_session",
  "request_session",
];

const allTypes = new Set<WsMessageType>([
  "pair_request",
  "pair_response",
  "chat_sessions_list",
  "chat_session_update",
  "chat_editing_state",
  "send_message",
  "accept_all_edits",
  "reject_all_edits",
  "accept_file_edit",
  "reject_file_edit",
  "continue_iteration",
  "cancel_request",
  "new_chat_session",
  "request_session",
  "command_ack",
  "ping",
  "pong",
  "extension_status",
]);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const webDistPath = path.resolve(__dirname, "../../web/dist");

const clientInfo = new WeakMap<WebSocket, ClientInfo>();
const sockets = new Set<WebSocket>();
const authTokens = new Set<string>();

let extensionSocket: WebSocket | null = null;

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    extensionConnected:
      extensionSocket !== null &&
      extensionSocket.readyState === WebSocket.OPEN,
  });
});

app.use("/", express.static(webDistPath));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLanIp(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }
  if (numbers[0] === 10) return true;
  if (numbers[0] === 192 && numbers[1] === 168) return true;
  if (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) return true;
  return false;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const hostname = url.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    isLanIp(hostname)
  );
}

function parseMessage(data: WebSocket.RawData): AnyWsMessage | null {
  const raw = typeof data === "string" ? data : data.toString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("Malformed JSON message received.");
    return null;
  }

  if (!isRecord(parsed)) {
    console.warn("Invalid message format.");
    return null;
  }

  const { version, id, type, data: payload, timestamp } = parsed;
  if (version !== PROTOCOL_VERSION) {
    console.warn("Unsupported protocol version.");
    return null;
  }
  if (typeof id !== "string" || typeof type !== "string") {
    console.warn("Invalid message header.");
    return null;
  }
  if (!allTypes.has(type as WsMessageType)) {
    console.warn("Unknown message type.");
    return null;
  }
  if (typeof timestamp !== "string") {
    console.warn("Invalid message timestamp.");
    return null;
  }
  if (!isRecord(payload)) {
    console.warn("Invalid message payload.");
    return null;
  }

  return parsed as unknown as AnyWsMessage;
}

function sendMessage(ws: WebSocket, message: AnyWsMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function cloneMessage(message: AnyWsMessage): AnyWsMessage {
  return {
    version: message.version,
    id: message.id,
    type: message.type,
    data: message.data,
    timestamp: message.timestamp,
  } as AnyWsMessage;
}

function broadcastToWeb(message: AnyWsMessage): void {
  const outbound = cloneMessage(message);
  for (const socket of sockets) {
    const info = clientInfo.get(socket);
    if (!info || info.role !== "web" || !info.paired || !info.token) continue;
    if (!authTokens.has(info.token)) continue;
    sendMessage(socket, outbound);
  }
}

function forwardToExtension(message: AnyWsMessage): void {
  if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
    console.warn("Extension not connected; dropping message.");
    return;
  }
  const outbound = cloneMessage(message);
  sendMessage(extensionSocket, outbound);
}

function handleWebMessage(ws: WebSocket, info: ClientInfo, message: AnyWsMessage): void {
  if (info.paired) {
    if (!info.token || !authTokens.has(info.token)) {
      ws.close(1008, "Invalid token");
      return;
    }
  }

  if (message.type === "ping") {
    sendMessage(ws, createMessage("pong", {}));
    return;
  }
  if (message.type === "pong") {
    return;
  }

  if (!info.paired) {
    if (message.type !== "pair_request") {
      ws.close(1008, "Unauthorized");
      return;
    }

    const request = message.data as WsMessageDataMap["pair_request"];
    if (typeof request?.pairingCode !== "string") {
      sendMessage(
        ws,
        createMessage("pair_response", {
          success: false,
          error: "Invalid pairing request",
        }),
      );
      return;
    }
    if (request.pairingCode === pairingCode) {
      const token = crypto.randomUUID();
      authTokens.add(token);
      info.paired = true;
      info.token = token;
      clientInfo.set(ws, info);
      sendMessage(ws, createMessage("pair_response", { success: true, token }));
    } else {
      sendMessage(
        ws,
        createMessage("pair_response", {
          success: false,
          error: "Invalid pairing code",
        }),
      );
    }
    return;
  }

  if (webToExtensionTypes.includes(message.type)) {
    forwardToExtension(message);
    return;
  }

  console.warn("Unexpected web message type.");
}

function handleExtensionMessage(
  ws: WebSocket,
  info: ClientInfo,
  message: AnyWsMessage,
): void {
  if (info.token !== SERVER_TOKEN) {
    ws.close(1008, "Invalid token");
    return;
  }

  if (message.type === "ping") {
    sendMessage(ws, createMessage("pong", {}));
    return;
  }
  if (message.type === "pong") {
    return;
  }

  if (extensionToWebTypes.includes(message.type)) {
    broadcastToWeb(message);
    return;
  }

  console.warn("Unexpected extension message type.");
}

wss.on("connection", (ws, req) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    ws.close(1008, "Origin not allowed");
    return;
  }

  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token") ?? undefined;

  if (role === "extension") {
    if (!token || token !== SERVER_TOKEN) {
      ws.close(1008, "Invalid token");
      return;
    }
    if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
      ws.close(1008, "Extension already connected");
      return;
    }
    extensionSocket = ws;
    clientInfo.set(ws, { role: "extension", token, paired: true });
  } else if (role === "web") {
    if (token) {
      if (!authTokens.has(token)) {
        ws.close(1008, "Invalid token");
        return;
      }
      clientInfo.set(ws, { role: "web", token, paired: true });
    } else {
      clientInfo.set(ws, { role: "web", paired: false });
    }
  } else {
    ws.close(1008, "Invalid role");
    return;
  }

  sockets.add(ws);

  ws.on("message", (data) => {
    const info = clientInfo.get(ws);
    if (!info) return;
    const message = parseMessage(data);
    if (!message) return;

    if (info.role === "web") {
      handleWebMessage(ws, info, message);
    } else {
      handleExtensionMessage(ws, info, message);
    }
  });

  ws.on("close", () => {
    sockets.delete(ws);
    const info = clientInfo.get(ws);
    if (info?.role === "extension" && extensionSocket === ws) {
      extensionSocket = null;
    }
    clientInfo.delete(ws);
  });

  ws.on("error", (error) => {
    console.warn("WebSocket error:", error);
  });
});

server.listen(PORT, HOST, () => {
  // Machine-readable lines for programmatic consumers (e.g. the extension)
  console.log(`REMOTE_PILOT_TOKEN=${SERVER_TOKEN}`);
  console.log(`REMOTE_PILOT_PORT=${PORT}`);
  console.log(`REMOTE_PILOT_PAIRING=${pairingCode}`);
  console.log(`REMOTE_PILOT_READY=true`);
  console.log(`Server listening on ${HOST}:${PORT}`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down (${signal})...`);

  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1001, "Server shutting down");
    }
  }

  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });

  setTimeout(() => process.exit(0), 5000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
