import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { isExtensionConnected } from './client.js';

function resolveWebDistPath(): string {
  const monorepoPath = path.resolve(__dirname, '../../web/dist');

  const bundledPath = path.join(__dirname, '..', 'web');
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  return monorepoPath;
}

export function createHttpApp(): express.Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      extensionConnected: isExtensionConnected(),
    });
  });

  app.use('/', express.static(resolveWebDistPath()));

  return app;
}
