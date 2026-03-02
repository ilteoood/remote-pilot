import crypto from 'node:crypto';
import portfinder from 'portfinder';

// Set base port to start searching from (default: 3847)
const basePort = Number(process.env.REMOTE_PILOT_PORT ?? '3847');
portfinder.setBasePort(basePort);

export const HOST = process.env.REMOTE_PILOT_HOST ?? '127.0.0.1';
export const SERVER_TOKEN = process.env.REMOTE_PILOT_TOKEN ?? crypto.randomUUID();

export const pairingCode = String(Math.floor(100_000 + Math.random() * 900_000));

// Get the first available port
export const getPort = (): Promise<number> => portfinder.getPortPromise();
