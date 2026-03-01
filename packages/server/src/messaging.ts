import crypto from "node:crypto";
import { WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  WsMessageDataMap,
  createMessage,
} from "@remote-pilot/shared";
import { AnyWsMessage, allTypes, extensionToWebTypes, webToExtensionTypes } from "./types.js";
import {
  addAuthToken,
  getClientInfo,
  getExtensionSocket,
  hasAuthToken,
  setClientInfo,
  sockets,
} from "./client.js";
import { pairingCode, SERVER_TOKEN } from "./config.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseMessage(data: WebSocket.RawData): AnyWsMessage | null {
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
  if (!allTypes.has(type as typeof allTypes extends Set<infer T> ? T : never)) {
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

export function broadcastToWeb(message: AnyWsMessage): void {
  const outbound = structuredClone(message);
  for (const socket of sockets) {
    const info = getClientInfo(socket);
    if (!info || info.role !== "web" || !info.paired || !info.token) continue;
    if (!hasAuthToken(info.token)) continue;
    sendMessage(socket, outbound);
  }
}

export function forwardToExtension(message: AnyWsMessage): void {
  const extensionSocket = getExtensionSocket();
  if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
    console.warn("Extension not connected; dropping message.");
    return;
  }
  const outbound = structuredClone(message);
  sendMessage(extensionSocket, outbound);
}

function handleWebMessage(ws: WebSocket, message: AnyWsMessage): void {
  const info = getClientInfo(ws);
  if (!info) return;

  if (info.paired) {
    if (!info.token || !hasAuthToken(info.token)) {
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
      addAuthToken(token);
      const newInfo = { ...info, paired: true, token };
      setClientInfo(ws, newInfo);
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

function handleExtensionMessage(ws: WebSocket, message: AnyWsMessage): void {
  const info = getClientInfo(ws);
  if (!info || info.token !== SERVER_TOKEN) {
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

export function handleMessage(ws: WebSocket, message: AnyWsMessage): void {
  const info = getClientInfo(ws);
  if (!info) return;

  if (info.role === "web") {
    handleWebMessage(ws, message);
  } else {
    handleExtensionMessage(ws, message);
  }
}
