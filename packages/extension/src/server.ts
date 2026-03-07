import { ChildProcess, fork } from 'node:child_process';
import * as path from 'node:path';
import { getConfig, getOutputChannel } from './config';

interface ServerInfo {
  token: string;
  port: number;
  pairingCode: string;
}

let serverProcess: ChildProcess | null = null;
let serverInfo: ServerInfo | null = null;

function resolveServerEntry(): string {
  const monorepoPath = path.resolve(__dirname, '../../server/dist/index.cjs');

  const bundledPath = path.resolve(__dirname, 'server/index.cjs');

  try {
    require.resolve(bundledPath);
    return bundledPath;
  } catch {
    return monorepoPath;
  }
}

export function spawnServer(): Promise<ServerInfo> {
  return new Promise((resolve, reject) => {
    const { serverPort, allowLan } = getConfig();
    const serverEntry = resolveServerEntry();
    const channel = getOutputChannel();

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      REMOTE_PILOT_PORT: String(serverPort),
    };
    if (allowLan) {
      env.REMOTE_PILOT_HOST = '0.0.0.0';
    }

    channel.appendLine(`Starting server: ${serverEntry}`);
    channel.appendLine(`Port: ${serverPort}, LAN: ${allowLan}`);

    const serverDir = path.dirname(path.dirname(serverEntry));
    const child = fork(serverEntry, [], {
      env,
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      silent: true,
    });

    serverProcess = child;

    const info: Partial<ServerInfo> = {};
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Server did not become ready within 10 seconds'));
      }
    }, 10_000);

    const handleStdout = (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        channel.appendLine(trimmed);

        const tokenMatch = trimmed.match(/^REMOTE_PILOT_TOKEN=(.+)$/);
        if (tokenMatch) {
          info.token = tokenMatch[1];
        }
        const portMatch = trimmed.match(/^REMOTE_PILOT_PORT=(\d+)$/);
        if (portMatch) {
          info.port = Number(portMatch[1]);
        }
        const pairingMatch = trimmed.match(/^REMOTE_PILOT_PAIRING=(\d+)$/);
        if (pairingMatch) {
          info.pairingCode = pairingMatch[1];
        }
        if (trimmed === 'REMOTE_PILOT_READY=true' && info.token && info.port && info.pairingCode) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            serverInfo = info as ServerInfo;
            resolve(serverInfo);
          }
        }
      }
    };

    child.stdout?.on('data', handleStdout);
    child.stderr?.on('data', (data: Buffer) => {
      channel.appendLine(`[stderr] ${data.toString().trim()}`);
    });

    child.on('error', (err) => {
      channel.appendLine(`Server process error: ${err.message}`);
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      channel.appendLine(`Server process exited with code ${code}`);
      serverProcess = null;
      serverInfo = null;
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
}

export function getPairingCode(): string | undefined {
  return serverInfo?.pairingCode;
}

export function killServer(): void {
  serverProcess?.kill('SIGTERM');
  serverProcess = null;
  serverInfo = null;
}

export function isServerRunning(): boolean {
  return Boolean(serverProcess && serverInfo);
}
