import * as vscode from 'vscode';
import { ChatSessions, ChatWatcher } from './chat';
import { disposeOutputChannel, getConfig } from './config';
import { getPairingCode, isServerRunning, killServer, spawnServer } from './server';
import { WsClient } from './wsClient';

let statusBar: vscode.StatusBarItem | null = null;
let wsClient: WsClient | null = null;
let chatSessions: ChatSessions | null = null;
let chatWatcher: ChatWatcher | null = null;

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

async function startRemotePilot(): Promise<void> {
  if (isServerRunning()) {
    vscode.window.showInformationMessage('Remote Pilot is already running.');
    return;
  }

  try {
    updateStatus(false);
    const bar = ensureStatusBar();
    bar.text = '$(loading~spin) Remote Pilot';

    const serverInfo = await spawnServer();
    wsClient = new WsClient(serverInfo.port, serverInfo.token);
    wsClient.connect();
    chatSessions = new ChatSessions((list) => wsClient?.sendChatSessionsList(list));
    chatWatcher = new ChatWatcher(
      {
        onSessionUpdate: (update) => wsClient?.sendChatSessionUpdate(update),
        onEditingState: (state) => wsClient?.sendChatEditingState(state),
      },
      chatSessions,
    );

    // Wire up request_session: when web client requests a session, chatWatcher reads it from disk
    wsClient.onRequestSession((sessionId) => {
      if (!chatWatcher) {
        return Promise.resolve(false);
      }
      return chatWatcher.emitSessionById(sessionId);
    });

    // Wire up request_sessions_list: when web client requests the sessions list
    wsClient.onRequestSessionsList(() => {
      if (!chatSessions) {
        return Promise.resolve();
      }
      return chatSessions.emitSessionsList();
    });
    await chatSessions.start();
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
  chatSessions?.stop();
  chatWatcher?.stop();
  chatSessions = null;
  chatWatcher = null;
  wsClient?.disconnect();
  wsClient = null;
  killServer();
  updateStatus(false);
  vscode.window.showInformationMessage('Remote Pilot stopped.');
}

export function activate(context: vscode.ExtensionContext): void {
  ensureStatusBar();
  updateStatus(false);

  const startCommand = vscode.commands.registerCommand('remote-pilot.start', startRemotePilot);

  const stopCommand = vscode.commands.registerCommand('remote-pilot.stop', stopRemotePilot);

  const showPairingCodeCommand = vscode.commands.registerCommand(
    'remote-pilot.showPairingCode',
    async () => {
      const pairintCode = getPairingCode();
      if (pairintCode) {
        await vscode.env.clipboard.writeText(pairintCode);
        vscode.window.showInformationMessage(
          `Remote Pilot pairing code: ${pairintCode} (copied to clipboard)`,
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
    startRemotePilot().catch(() => {});
  }
}

export function deactivate(): void {
  stopRemotePilot();
  disposeOutputChannel();
  statusBar?.dispose();
  statusBar = null;
}
