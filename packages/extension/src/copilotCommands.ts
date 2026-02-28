import * as vscode from "vscode";
import * as path from "path";

export interface CommandResult {
  success: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendMessage(prompt: string): Promise<CommandResult> {
  try {
    await vscode.commands.executeCommand("workbench.panel.chat.view.copilot.focus");
    await vscode.commands.executeCommand("workbench.action.chat.focusInput");
    await sleep(200);
    await vscode.commands.executeCommand("type", { text: prompt });
    await vscode.commands.executeCommand("workbench.action.chat.submit");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function acceptAllEdits(): Promise<CommandResult> {
  try {
    await vscode.commands.executeCommand("chatEditing.acceptAllFiles");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function rejectAllEdits(): Promise<CommandResult> {
  try {
    await vscode.commands.executeCommand("chatEditing.discardAllFiles");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
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

export async function acceptFileEdit(filePath: string): Promise<CommandResult> {
  try {
    const uri = await resolveFileUri(filePath);
    if (!uri) {
      return { success: false, error: "No workspace available to resolve file path" };
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand("chatEditing.acceptFile");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function rejectFileEdit(filePath: string): Promise<CommandResult> {
  try {
    const uri = await resolveFileUri(filePath);
    if (!uri) {
      return { success: false, error: "No workspace available to resolve file path" };
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand("chatEditing.discardFile");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function continueIteration(): Promise<CommandResult> {
  try {
    try {
      await vscode.commands.executeCommand("workbench.action.chat.retry");
      return { success: true };
    } catch (primaryError) {
      await vscode.commands.executeCommand("github.copilot.chat.review.continueInChat");
      return { success: true };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function cancelRequest(): Promise<CommandResult> {
  try {
    await vscode.commands.executeCommand("workbench.action.chat.cancel");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function newChatSession(): Promise<CommandResult> {
  try {
    await vscode.commands.executeCommand("workbench.action.chat.newChat");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
