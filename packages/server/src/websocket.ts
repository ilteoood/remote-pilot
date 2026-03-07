import fastifyWebSocket from '@fastify/websocket';
import { createMessage } from '@remote-pilot/shared';
import type { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
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

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(fastifyWebSocket);

  app.get('/ws', { websocket: true }, (socket, request) => {
    if (!isAllowedOrigin(request.headers.origin)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const role = url.searchParams.get('role') as ClientRole | null;
    const token = url.searchParams.get('token') ?? undefined;

    if (role === 'extension') {
      if (!token || token !== SERVER_TOKEN) {
        socket.close(1008, 'Invalid token');
        return;
      }
      const extensionSocket = getExtensionSocket();
      if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
        socket.close(1008, 'Extension already connected');
        return;
      }
      setExtensionSocket(socket);
      setClientInfo(socket, createClientInfo('extension', true, token));
      broadcastToWeb(createMessage('extension_status', { connected: true }) as never);
    } else if (role === 'web') {
      if (token) {
        if (!hasAuthToken(token)) {
          socket.close(1008, 'Invalid token');
          return;
        }
        setClientInfo(socket, createClientInfo('web', true, token));
        const statusMsg = createMessage('extension_status', { connected: isExtensionConnected() });
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(statusMsg));
        }
      } else {
        setClientInfo(socket, createClientInfo('web', false));
      }
    } else {
      socket.close(1008, 'Invalid role');
      return;
    }

    addSocket(socket);

    socket.on('message', (data) => {
      const message = parseMessage(data);
      if (!message) return;

      handleMessage(socket, message);
    });

    socket.on('close', () => {
      const info = getClientInfo(socket);
      removeSocket(socket);
      if (info?.role === 'extension') {
        broadcastToWeb(createMessage('extension_status', { connected: false }) as never);
      }
    });

    socket.on('error', (error) => {
      console.warn('WebSocket error:', error);
    });
  });
}

export function closeAllSockets(): void {
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1001, 'Server shutting down');
    }
  }
}
