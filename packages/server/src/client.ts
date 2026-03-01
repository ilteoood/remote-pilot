import { WebSocket } from "ws";
import { ClientInfo, ClientRole } from "./types.js";

export const clientInfo = new WeakMap<WebSocket, ClientInfo>();
export const sockets = new Set<WebSocket>();
export const authTokens = new Set<string>();

let extensionSocket: WebSocket | null = null;

export function getExtensionSocket(): WebSocket | null {
  return extensionSocket;
}

export function setExtensionSocket(ws: WebSocket | null): void {
  extensionSocket = ws;
}

export function addSocket(ws: WebSocket): void {
  sockets.add(ws);
}

export function removeSocket(ws: WebSocket): void {
  sockets.delete(ws);
  const info = clientInfo.get(ws);
  if (info?.role === "extension" && extensionSocket === ws) {
    extensionSocket = null;
  }
  clientInfo.delete(ws);
}

export function setClientInfo(ws: WebSocket, info: ClientInfo): void {
  clientInfo.set(ws, info);
}

export function getClientInfo(ws: WebSocket): ClientInfo | undefined {
  return clientInfo.get(ws);
}

export function addAuthToken(token: string): void {
  authTokens.add(token);
}

export function hasAuthToken(token: string): boolean {
  return authTokens.has(token);
}

export function removeAuthToken(token: string): void {
  authTokens.delete(token);
}

export function createClientInfo(role: ClientRole, paired: boolean, token?: string): ClientInfo {
  return { role, paired, token };
}

export function isExtensionConnected(): boolean {
  return extensionSocket?.readyState === WebSocket.OPEN;
}
