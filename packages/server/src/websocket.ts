import http, { IncomingMessage } from 'node:http';
import { createMessage } from '@remote-pilot/shared';
import { WebSocket, WebSocketServer } from 'ws';
import {
  addSocket,
  createClientInfo,
  getClientInfo,
  getExtensionSocket,
  hasAuthToken,
  isExtensionConnected,
  removeSocket,
  setClientInfo,
  setExtensionSocket,
  sockets,
} from './client.js';
import { SERVER_TOKEN } from './config.js';
import { broadcastToWeb, handleMessage, parseMessage } from './messaging.js';
import { ClientRole } from './types.js';

function isLanIp(hostname: string): boolean {
  const parts = hostname.split('.');
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
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || isLanIp(hostname)
  );
}

export function createWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      ws.close(1008, 'Origin not allowed');
      return;
    }

    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const role = url.searchParams.get('role') as ClientRole | null;
    const token = url.searchParams.get('token') ?? undefined;

    if (role === 'extension') {
      if (!token || token !== SERVER_TOKEN) {
        ws.close(1008, 'Invalid token');
        return;
      }
      const extensionSocket = getExtensionSocket();
      if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
        ws.close(1008, 'Extension already connected');
        return;
      }
      setExtensionSocket(ws);
      setClientInfo(ws, createClientInfo('extension', true, token));
      // Notify web clients that extension is now connected
      broadcastToWeb(createMessage('extension_status', { connected: true }) as never);
    } else if (role === 'web') {
      if (token) {
        if (!hasAuthToken(token)) {
          ws.close(1008, 'Invalid token');
          return;
        }
        setClientInfo(ws, createClientInfo('web', true, token));
        // Send current extension status on reconnect
        const statusMsg = createMessage('extension_status', { connected: isExtensionConnected() });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(statusMsg));
        }
      } else {
        setClientInfo(ws, createClientInfo('web', false));
      }
    } else {
      ws.close(1008, 'Invalid role');
      return;
    }

    addSocket(ws);

    ws.on('message', (data) => {
      const message = parseMessage(data);
      if (!message) return;

      handleMessage(ws, message);
    });

    ws.on('close', () => {
      const info = getClientInfo(ws);
      removeSocket(ws);
      // If the extension disconnected, notify web clients
      if (info?.role === 'extension') {
        broadcastToWeb(createMessage('extension_status', { connected: false }) as never);
      }
    });

    ws.on('error', (error) => {
      console.warn('WebSocket error:', error);
    });
  });

  return wss;
}

export function closeAllSockets(): void {
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1001, 'Server shutting down');
    }
  }
}
