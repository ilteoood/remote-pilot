import http from 'node:http';
import { WebSocketServer } from 'ws';

import { getPort, HOST, pairingCode, SERVER_TOKEN } from './config.js';
import { createHttpApp } from './http.js';
import { closeAllSockets, createWebSocketServer } from './websocket.js';

const startServer = async () => {
  const app = createHttpApp();
  const server = http.createServer(app);
  const wss: WebSocketServer = createWebSocketServer(server);

  const PORT = await getPort();

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

    closeAllSockets();

    wss.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });

    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startServer();
