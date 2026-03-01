import crypto from 'node:crypto';

export const PORT = Number(process.env.REMOTE_PILOT_PORT ?? '3847');
export const HOST = process.env.REMOTE_PILOT_HOST ?? '127.0.0.1';
export const SERVER_TOKEN = process.env.REMOTE_PILOT_TOKEN ?? crypto.randomUUID();

export const pairingCode = String(Math.floor(100_000 + Math.random() * 900_000));
