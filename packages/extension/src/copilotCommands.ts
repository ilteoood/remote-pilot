import * as path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as vscode from 'vscode';

export interface CommandResult {
  success: boolean;
  error?: string;
}

const commandExecutor = async (executor: () => Promise<void>) => {
  try {
    await executor();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function sendMessage(prompt: string): Promise<CommandResult> {
  return commandExecutor(async () => {
    await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
    await vscode.commands.executeCommand('workbench.action.chat.focusInput');
    await setTimeout(200);
    await vscode.commands.executeCommand('type', { text: prompt });
    await vscode.commands.executeCommand('workbench.action.chat.submit');
  })
}

export function acceptAllEdits(): Promise<CommandResult> {
  return commandExecutor(async () => {
    await vscode.commands.executeCommand('chatEditing.acceptAllFiles');
  });
}

export function rejectAllEdits(): Promise<CommandResult> {
  return commandExecutor(async () => {
    await vscode.commands.executeCommand('chatEditing.discardAllFiles');
  });
}

async function resolveFileUri(filePath: string): Promise<vscode.Uri | null> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot && !path.isAbsolute(filePath)) {
    return null;
  }
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }
  return vscode.Uri.joinPath(workspaceRoot!, filePath);
}

export function acceptFileEdit(filePath: string): Promise<CommandResult> {
  return commandExecutor(async () => {
    const uri = await resolveFileUri(filePath);
    if (!uri) {
      throw new Error('No workspace available to resolve file path');
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand('chatEditing.acceptFile');
  });
}

export function rejectFileEdit(filePath: string): Promise<CommandResult> {
  return commandExecutor(async () => {
    const uri = await resolveFileUri(filePath);
    if (!uri) {
      throw new Error('No workspace available to resolve file path');
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand('chatEditing.discardFile');
  });
}

export function continueIteration(): Promise<CommandResult> {
  return commandExecutor(async () => {
    try {
      await vscode.commands.executeCommand('github.copilot.chat.review.continueInChat');
    } catch {
      await vscode.commands.executeCommand('workbench.action.chat.retry');
    }
  });
}

export function cancelRequest(): Promise<CommandResult> {
  return commandExecutor(async () => {
    await vscode.commands.executeCommand('workbench.action.chat.cancel');
  });
}

export function newChatSession(): Promise<CommandResult> {
  return commandExecutor(async () => {
    await vscode.commands.executeCommand('workbench.action.chat.newChat');
  });
}
