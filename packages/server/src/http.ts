import path from 'node:path';
import express from 'express';
import { isExtensionConnected } from './client.js';

const webDistPath = path.resolve(__dirname, '../../web/dist');

export function createHttpApp(): express.Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      extensionConnected: isExtensionConnected(),
    });
  });

  app.use('/', express.static(webDistPath));

  return app;
}
