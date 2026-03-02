import { ChildProcess, fork } from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChatWatcher } from './chatWatcher';
import { WsClient } from './wsClient';

interface ServerInfo {
  token: string;
  port: number;
  pairingCode: string;
}

let statusBar: vscode.StatusBarItem | null = null;
let wsClient: WsClient | null = null;
let chatWatcher: ChatWatcher | null = null;
let serverProcess: ChildProcess | null = null;
let serverInfo: ServerInfo | null = null;
let outputChannel: vscode.OutputChannel | null = null;

function getConfig() {
  const config = vscode.workspace.getConfiguration('remotePilot');
  return {
    serverPort: config.get<number>('serverPort', 3847),
    autoStart: config.get<boolean>('autoStart', false),
    allowLan: config.get<boolean>('allowLan', false),
  };
}

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Remote Pilot');
  }
  return outputChannel;
}

function ensureStatusBar(): vscode.StatusBarItem {
  if (!statusBar) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = 'remote-pilot.showPairingCode';
    statusBar.tooltip = 'Remote Pilot connection status';
    statusBar.show();
  }
  return statusBar;
}

function updateStatus(connected: boolean): void {
  const bar = ensureStatusBar();
  bar.text = connected ? '$(plug) Remote Pilot' : '$(circle-slash) Remote Pilot';
}

function resolveServerEntry(): string {
  // In dev (monorepo): extension is at packages/extension/dist/extension.js
  // Server entry is at packages/server/dist/index.js
  // __dirname = packages/extension/dist → ../../server/dist/index.js
  const monorepoPath = path.resolve(__dirname, '../../server/dist/index.js');

  // In packaged VSIX: server is copied into dist/server/index.js
  const bundledPath = path.resolve(__dirname, 'server/index.js');

  try {
    require.resolve(bundledPath);
    return bundledPath;
  } catch {
    return monorepoPath;
  }
}

function spawnServer(): Promise<ServerInfo> {
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
    }, 10000);

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
            resolve(info as ServerInfo);
          }
        }
      }
    };

    if (child.stdout) {
      child.stdout.on('data', handleStdout);
    }
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        channel.appendLine(`[stderr] ${data.toString().trim()}`);
      });
    }

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

function killServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  serverInfo = null;
}

async function startRemotePilot(): Promise<void> {
  if (serverProcess && serverInfo) {
    vscode.window.showInformationMessage('Remote Pilot is already running.');
    return;
  }

  try {
    updateStatus(false);
    const bar = ensureStatusBar();
    bar.text = '$(loading~spin) Remote Pilot';

    serverInfo = await spawnServer();
    wsClient = new WsClient(serverInfo.port, serverInfo.token);
    wsClient.connect();
    chatWatcher = new ChatWatcher({
      onSessionsList: (list) => wsClient?.sendChatSessionsList(list),
      onSessionUpdate: (update) => wsClient?.sendChatSessionUpdate(update),
      onEditingState: (state) => wsClient?.sendChatEditingState(state),
    });

    // Wire up request_session: when web client requests a session, chatWatcher reads it from disk
    wsClient.onRequestSession((sessionId) => {
      if (!chatWatcher) {
        return Promise.resolve(false);
      }
      return chatWatcher.emitSessionById(sessionId);
    });

    // Wire up request_sessions_list: when web client requests the sessions list
    wsClient.onRequestSessionsList(() => {
      if (!chatWatcher) {
        return Promise.resolve();
      }
      return chatWatcher.emitSessionsList();
    });

    await chatWatcher.start();

    updateStatus(true);

    // Copy pairing code to clipboard
    await vscode.env.clipboard.writeText(serverInfo.pairingCode);

    // Auto-open web page in browser
    const webUrl = `http://localhost:${serverInfo.port}`;
    await vscode.env.openExternal(vscode.Uri.parse(webUrl));
    vscode.window.showInformationMessage(
      `Remote Pilot started. Pairing code: ${serverInfo.pairingCode} (copied to clipboard)`,
    );
  } catch (err) {
    killServer();
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to start Remote Pilot: ${message}`);
    updateStatus(false);
  }
}

function stopRemotePilot(): void {
  if (chatWatcher) {
    chatWatcher.stop();
    chatWatcher = null;
  }
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  killServer();
  updateStatus(false);
  vscode.window.showInformationMessage('Remote Pilot stopped.');
}

export function activate(context: vscode.ExtensionContext): void {
  ensureStatusBar();
  updateStatus(false);

  const startCommand = vscode.commands.registerCommand('remote-pilot.start', async () => {
    await startRemotePilot();
  });

  const stopCommand = vscode.commands.registerCommand('remote-pilot.stop', () => {
    stopRemotePilot();
  });

  const showPairingCodeCommand = vscode.commands.registerCommand(
    'remote-pilot.showPairingCode',
    async () => {
      if (serverInfo) {
        await vscode.env.clipboard.writeText(serverInfo.pairingCode);
        vscode.window.showInformationMessage(
          `Remote Pilot pairing code: ${serverInfo.pairingCode} (copied to clipboard)`,
        );
      } else {
        vscode.window.showWarningMessage('Remote Pilot is not running. Start it first.');
      }
    },
  );

  context.subscriptions.push(startCommand, stopCommand, showPairingCodeCommand);
  if (statusBar) {
    context.subscriptions.push(statusBar);
  }

  const { autoStart } = getConfig();
  if (autoStart) {
    startRemotePilot().catch(() => {
      return;
    });
  }
}

export function deactivate(): void {
  stopRemotePilot();
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = null;
  }
  if (statusBar) {
    statusBar.dispose();
    statusBar = null;
  }
}
