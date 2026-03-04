import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Returns the path to the global VS Code workspace storage directory for the
 * current platform.  This mirrors the logic used by the VS Code team in
 * `vscode/src/vs/platform/workspace/common/workspace.ts` (as of 2024).  The
 * path is based on the user's home directory and the standard application
 * data locations for each OS.
 */
export function getWorkspaceStorageRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  switch (process.platform) {
    case 'win32':
      return path.join(
        process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
        'Code',
        'User',
        'workspaceStorage',
      );
    case 'linux':
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(home, '.config'),
        'Code',
        'User',
        'workspaceStorage',
      );
    default:
      return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
  }
}

/**
 * Scan the provided storage root for sub‑directories whose `workspace.json`
 * file matches the supplied workspace URI.  When more than one directory
 * matches, they are sorted by the number of chat session files they contain so
 * that the "active" workspace (with the most data) is listed first.
 */
export async function findWorkspaceHashes(
  storageRoot: string,
  workspaceUri: string,
): Promise<string[]> {
  const hashes: string[] = [];
  try {
    const entries = await fs.promises.readdir(storageRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const workspaceJson = path.join(storageRoot, entry.name, 'workspace.json');
      try {
        const raw = await fs.promises.readFile(workspaceJson, 'utf-8');
        const parsed = JSON.parse(raw) as { folder?: string };
        if (parsed.folder === workspaceUri) {
          hashes.push(entry.name);
        }
      } catch {}
    }
  } catch {
    // ignore
  }

  return hashes;
}

/**
 * Convert a URI string (as stored in VS Code session data) into a path
 * relative to the workspace root if possible.  Falls back to the absolute
 * filesystem path if the workspace cannot be determined.
 */
export function toWorkspaceRelativePath(resource: string): string {
  try {
    const uri = vscode.Uri.parse(resource);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      return uri.fsPath;
    }
    const relative = path.relative(workspaceRoot.fsPath, uri.fsPath);
    return relative || uri.fsPath;
  } catch {
    return resource;
  }
}
