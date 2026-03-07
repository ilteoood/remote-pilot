import Fastify from 'fastify';

import { getPort, HOST, pairingCode, SERVER_TOKEN } from './config.js';
import { registerHttpRoutes } from './http.js';
import { closeAllSockets, registerWebSocket } from './websocket.js';

const startServer = async () => {
  const app = Fastify();

  await registerWebSocket(app);
  await registerHttpRoutes(app);

  const PORT = await getPort();

  await app.listen({ port: PORT, host: HOST });

  // Machine-readable lines for programmatic consumers (e.g. the extension)
  console.log(`REMOTE_PILOT_TOKEN=${SERVER_TOKEN}`);
  console.log(`REMOTE_PILOT_PORT=${PORT}`);
  console.log(`REMOTE_PILOT_PAIRING=${pairingCode}`);
  console.log(`REMOTE_PILOT_READY=true`);
  console.log(`Server listening on ${HOST}:${PORT}`);

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Shutting down (${signal})...`);

    closeAllSockets();

    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startServer();
