import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ChatEditingState,
  ChatSessionsList,
  ChatSessionUpdate,
  VscodeChatEditingSessionFile,
  VscodeChatSessionFile,
} from '@remote-pilot/shared';
import * as vscode from 'vscode';

export interface ChatWatcherCallbacks {
  onSessionsList?: (list: ChatSessionsList) => void;
  onSessionUpdate?: (update: ChatSessionUpdate) => void;
  onEditingState?: (state: ChatEditingState) => void;
}

interface DebounceHandle {
  timer: NodeJS.Timeout;
}

export class ChatWatcher {
  private readonly callbacks: ChatWatcherCallbacks;
  private readonly debounceMs: number;
  private readonly disposables: vscode.Disposable[] = [];
  private sessionWatcher: fs.FSWatcher | null = null;
  private editingWatcher: fs.FSWatcher | null = null;
  private workspaceStoragePath: string | null = null;
  private sessionsDir: string | null = null;
  private editingDir: string | null = null;
  private debouncedReads = new Map<string, DebounceHandle>();

  constructor(callbacks: ChatWatcherCallbacks, debounceMs = 500) {
    this.callbacks = callbacks;
    this.debounceMs = debounceMs;
  }

  async start(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      return;
    }

    const storageRoot = this.getWorkspaceStorageRoot();
    const workspaceHash = await this.findWorkspaceHash(storageRoot, workspaceRoot.toString());
    if (!workspaceHash) {
      return;
    }

    this.workspaceStoragePath = path.join(storageRoot, workspaceHash);
    this.sessionsDir = path.join(this.workspaceStoragePath, 'chatSessions');
    this.editingDir = path.join(this.workspaceStoragePath, 'chatEditingSessions');

    this.watchSessions();
    this.watchEditingSessions();
    await this.emitSessionsList();
  }

  /**
   * Emit a specific session's content by its ID.
   * Used when the web client requests a particular session.
   */
  async emitSessionById(sessionId: string): Promise<boolean> {
    if (!this.sessionsDir) {
      return false;
    }
    try {
      const files = await fs.promises.readdir(this.sessionsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }
        const fullPath = path.join(this.sessionsDir, file);
        try {
          const raw = await fs.promises.readFile(fullPath, 'utf-8');
          const parsed = JSON.parse(raw) as VscodeChatSessionFile;
          if (parsed.sessionId === sessionId) {
            const update = this.toChatSessionUpdate(parsed);
            if (this.callbacks.onSessionUpdate) {
              this.callbacks.onSessionUpdate(update);
            }
            return true;
          }
        } catch {}
      }
      return false;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.sessionWatcher?.close();
    this.editingWatcher?.close();
    this.sessionWatcher = null;
    this.editingWatcher = null;
    this.debouncedReads.forEach((handle) => {
      clearTimeout(handle.timer);
    });
    this.debouncedReads.clear();
    this.disposables.splice(0).forEach((disposable) => {
      disposable.dispose();
    });
  }

  private getWorkspaceStorageRoot(): string {
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
        return path.join(
          home,
          'Library',
          'Application Support',
          'Code',
          'User',
          'workspaceStorage',
        );
    }
  }

  private async findWorkspaceHash(
    storageRoot: string,
    workspaceUri: string,
  ): Promise<string | null> {
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
            return entry.name;
          }
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }

  private watchSessions(): void {
    if (!this.sessionsDir) {
      return;
    }
    if (!fs.existsSync(this.sessionsDir)) {
      return;
    }
    this.sessionWatcher = fs.watch(this.sessionsDir, (_event, filename) => {
      if (!filename?.endsWith('.json')) {
        return;
      }
      const fullPath = path.join(this.sessionsDir!, filename);
      this.debounceRead(fullPath, async () => {
        await this.handleSessionFile(fullPath);
        await this.emitSessionsList();
      });
    });
  }

  private watchEditingSessions(): void {
    if (!this.editingDir) {
      return;
    }
    if (!fs.existsSync(this.editingDir)) {
      return;
    }
    this.editingWatcher = fs.watch(this.editingDir, { recursive: true }, (_event, filename) => {
      if (!filename?.endsWith('state.json')) {
        return;
      }
      const fullPath = path.join(this.editingDir!, filename);
      this.debounceRead(fullPath, () => this.handleEditingStateFile(fullPath));
    });
  }

  private debounceRead(filePath: string, action: () => Promise<void>): void {
    const existing = this.debouncedReads.get(filePath);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const timer = setTimeout(() => {
      this.debouncedReads.delete(filePath);
      action().catch(() => {});
    }, this.debounceMs);
    this.debouncedReads.set(filePath, { timer });
  }

  private async handleSessionFile(filePath: string): Promise<void> {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as VscodeChatSessionFile;
      const update = this.toChatSessionUpdate(parsed);
      this.callbacks.onSessionUpdate?.(update);
    } catch {
      return;
    }
  }

  private async handleEditingStateFile(filePath: string): Promise<void> {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as VscodeChatEditingSessionFile;
      const state = this.toChatEditingState(parsed);
      if (state) {
        this.callbacks.onEditingState?.(state);
      }
    } catch {
      return;
    }
  }

  private toChatSessionUpdate(session: VscodeChatSessionFile): ChatSessionUpdate {
    const requests = session.requests.map((request) => {
      const message = typeof request.message === 'string' ? request.message : request.message.text;
      const responseParts = request.response.map((item) => {
        if (item.kind === 'markdownContent' || item.value) {
          return { kind: 'markdown' as const, content: item.value || '' };
        }
        if (item.toolId || item.toolCallId) {
          const toolStatus: 'completed' | 'running' = item.isComplete ? 'completed' : 'running';
          return {
            kind: 'tool_invocation' as const,
            content: item.invocationMessage || item.pastTenseMessage || '',
            toolName: item.toolId || item.toolCallId || '',
            toolStatus,
          };
        }
        return { kind: 'unknown' as const, content: JSON.stringify(item) };
      });
      const lastResponse = request.response[request.response.length - 1];
      const isStreaming = lastResponse ? lastResponse.isComplete === false : false;
      return {
        requestId: request.requestId,
        message,
        responseParts,
        isStreaming,
        isCanceled: request.isCanceled ?? false,
        timestamp: new Date(request.timestamp ?? Date.now()).toISOString(),
      };
    });

    return { sessionId: session.sessionId, requests };
  }

  private toChatEditingState(file: VscodeChatEditingSessionFile): ChatEditingState | null {
    const sessionId = file.sessionId || this.extractEditingSessionId();
    if (!sessionId) {
      return null;
    }
    const entries =
      file.recentSnapshot?.entries ||
      file.linearHistory?.[file.linearHistory.length - 1]?.stops?.[0]?.entries ||
      [];
    const mappedEntries = entries.map((entry) => {
      return {
        filePath: this.toWorkspaceRelativePath(entry.resource),
        state: (entry.state ?? 0) as 0 | 1 | 2,
        originalHash: entry.originalHash,
        currentHash: entry.currentHash,
      };
    });

    return { sessionId, entries: mappedEntries };
  }

  private extractEditingSessionId(): string | undefined {
    return undefined;
  }

  private toWorkspaceRelativePath(resource: string): string {
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

  public async emitSessionsList(): Promise<void> {
    if (!this.sessionsDir) {
      return;
    }
    try {
      const files = await fs.promises.readdir(this.sessionsDir);
      const sessions = [] as ChatSessionsList['sessions'];
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }
        const fullPath = path.join(this.sessionsDir, file);
        try {
          const raw = await fs.promises.readFile(fullPath, 'utf-8');
          const parsed = JSON.parse(raw) as VscodeChatSessionFile;
          const firstRequest = parsed.requests[0];
          const title = firstRequest
            ? typeof firstRequest.message === 'string'
              ? firstRequest.message
              : firstRequest.message.text
            : '';
          const createdAt = parsed.creationDate
            ? new Date(parsed.creationDate).toISOString()
            : new Date().toISOString();
          const lastMessageAt = parsed.lastMessageDate
            ? new Date(parsed.lastMessageDate).toISOString()
            : createdAt;
          sessions.push({
            sessionId: parsed.sessionId,
            title,
            createdAt,
            lastMessageAt,
            requestCount: parsed.requests.length,
            hasPendingEdits: parsed.hasPendingEdits ?? false,
          });
        } catch {}
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
      this.callbacks.onSessionsList?.(list);
    } catch {
      return;
    }
  }
}
