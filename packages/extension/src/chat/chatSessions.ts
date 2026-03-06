import * as fs from 'node:fs';
import * as path from 'node:path';
import { ChatSessionsList } from '@remote-pilot/shared';
import initSqlJs from 'sql.js';
import * as vscode from 'vscode';
import { findWorkspaceHashes, getWorkspaceStorageRoot } from '../workspaceUtils';

interface AgentSessionItem {
  resource?: string;
  label?: string;
  timing?: {
    created?: number;
    lastRequestStarted?: number;
    lastRequestEnded?: number;
  };
}

export class ChatSessions {
  public workspaceStoragePaths: string[] = [];
  private sqlJsPromise: ReturnType<typeof initSqlJs> = initSqlJs({
    locateFile: (file) => path.join(__dirname, file),
  });

  constructor(private onSessionsList?: (list: ChatSessionsList) => void) {}

  public async start() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      return;
    }

    const storageRoot = getWorkspaceStorageRoot();
    const workspaceHashes = await findWorkspaceHashes(storageRoot, workspaceRoot.toString());
    if (workspaceHashes.length === 0) {
      return;
    }

    this.workspaceStoragePaths = workspaceHashes.map((h) => path.join(storageRoot, h));
  }

  public async stop() {
    this.workspaceStoragePaths = [];
  }

  public async emitSessionsList(): Promise<void> {
    if (this.workspaceStoragePaths.length === 0) {
      return;
    }
    try {
      const sessions: ChatSessionsList['sessions'] = [];

      for (const storagePath of this.workspaceStoragePaths) {
        const dbPath = path.join(storagePath, 'state.vscdb');
        if (!fs.existsSync(dbPath)) {
          continue;
        }
        try {
          const items = await this.readAgentSessionsFromDb(dbPath);
          for (const item of items) {
            if (!item.resource) {
              continue;
            }
            const urlPart = item.resource.split('/').pop();
            if (!urlPart) {
              continue;
            }
            const sessionId = Buffer.from(urlPart, 'base64').toString('utf-8');

            const createdAt = item.timing?.created
              ? new Date(item.timing.created).toISOString()
              : new Date().toISOString();
            const lastMessageAt = item.timing?.lastRequestEnded
              ? new Date(item.timing.lastRequestEnded).toISOString()
              : createdAt;

            sessions.push({
              sessionId,
              title: item.label ?? '',
              createdAt,
              lastMessageAt,
            });
          }
        } catch {
          // ignore this db
        }
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!workspaceRoot) {
        return;
      }
      const list: ChatSessionsList = {
        workspaceName: path.basename(workspaceRoot.fsPath),
        workspacePath: workspaceRoot.fsPath,
        sessions,
      };
      console.log(`[ChatWatcher] emitting sessions list (${sessions.length} sessions)`);
      this.onSessionsList?.(list);
    } catch {
      return;
    }
  }

  private async readAgentSessionsFromDb(dbPath: string): Promise<AgentSessionItem[]> {
    const [SQL, fileBuffer] = await Promise.all([this.sqlJsPromise, fs.promises.readFile(dbPath)]);
    const db = new SQL.Database(fileBuffer);
    try {
      const results = db.exec(
        "SELECT value FROM ItemTable WHERE key = 'agentSessions.model.cache'",
      );
      if (!results.length || !results[0].values.length) {
        return [];
      }
      const value = results[0].values[0][0];
      if (typeof value !== 'string') {
        return [];
      }
      const parsed = JSON.parse(value) as AgentSessionItem[];
      return Array.isArray(parsed) ? [...parsed].reverse() : [];
    } catch {
      return [];
    } finally {
      db.close();
    }
  }
}
