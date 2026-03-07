import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | null = null;

export function getConfig() {
  const config = vscode.workspace.getConfiguration('remotePilot');
  return {
    serverPort: config.get<number>('serverPort', 3847),
    autoStart: config.get<boolean>('autoStart', false),
    allowLan: config.get<boolean>('allowLan', false),
  };
}

export function getOutputChannel(): vscode.OutputChannel {
  outputChannel ??= vscode.window.createOutputChannel('Remote Pilot');
  return outputChannel;
}

export function disposeOutputChannel(): void {
  outputChannel?.dispose();
  outputChannel = null;
}