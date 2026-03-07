import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { isExtensionConnected } from './client.js';

function resolveWebDistPath(): string {
  const monorepoPath = path.resolve(__dirname, '../../web/dist');

  const bundledPath = path.join(__dirname, '..', 'web');
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  return monorepoPath;
}

export async function registerHttpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    extensionConnected: isExtensionConnected(),
  }));

  await app.register(fastifyStatic, {
    root: resolveWebDistPath(),
    prefix: '/',
  });
}
