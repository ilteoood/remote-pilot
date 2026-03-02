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
  // we may have more than one storage hash for the same workspace (e.g. normal vs dev-host)
  private sessionWatchers: fs.FSWatcher[] = [];
  private editingWatchers: fs.FSWatcher[] = [];
  private workspaceStoragePaths: string[] = []; // list of matched hashes
  private sessionsDirs: string[] = [];
  private editingDirs: string[] = [];
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
    const workspaceHashes = await this.findWorkspaceHashes(storageRoot, workspaceRoot.toString());
    if (workspaceHashes.length === 0) {
      return;
    }

    this.workspaceStoragePaths = workspaceHashes.map((h) => path.join(storageRoot, h));
    this.sessionsDirs = this.workspaceStoragePaths.map((p) => path.join(p, 'chatSessions'));
    this.editingDirs = this.workspaceStoragePaths.map((p) => path.join(p, 'chatEditingSessions'));
    console.log('[ChatWatcher] workspaceHashes', workspaceHashes);
    console.log('[ChatWatcher] sessionsDirs', this.sessionsDirs);
    console.log('[ChatWatcher] editingDirs', this.editingDirs);

    this.watchSessions();
    this.watchEditingSessions();
    await this.emitSessionsList();
  }

  /**
   * Emit a specific session's content by its ID.
   * Used when the web client requests a particular session.
   */
  async emitSessionById(sessionId: string): Promise<boolean> {
    if (this.sessionsDirs.length === 0) {
      return false;
    }
    try {
      for (const dir of this.sessionsDirs) {
        try {
          const files = await fs.promises.readdir(dir);
          for (const file of files) {
            if (!file.match(/\.jsonl?$/)) {
              continue;
            }
            const fullPath = path.join(dir, file);
            const parsed = await this.parseSessionFile(fullPath);
            if (parsed && parsed.sessionId === sessionId) {
              const update = this.toChatSessionUpdate(parsed);
              if (this.callbacks.onSessionUpdate) {
                this.callbacks.onSessionUpdate(update);
              }
              return true;
            }
          }
        } catch {
          // ignore this directory
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.sessionWatchers.forEach((w) => {
      w.close();
    });
    this.editingWatchers.forEach((w) => {
      w.close();
    });
    this.sessionWatchers = [];
    this.editingWatchers = [];
    this.sessionsDirs = [];
    this.editingDirs = [];
    this.workspaceStoragePaths = [];

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

  /**
   * Returns all storage hash directories whose workspace.json matches the
   * provided URI.  When multiple hashes exist we prefer the one(s) that
   * already contain chat sessions so that diagnostics are correct during dev
   * scenarios (extension-host vs normal window).
   */
  private async findWorkspaceHashes(storageRoot: string, workspaceUri: string): Promise<string[]> {
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

    if (hashes.length <= 1) {
      return hashes;
    }

    // if multiple hashes match, choose the one containing the largest number
    // of session files. this ensures the dev-host storage (often empty) is
    // ignored when the real workspace already has sessions.
    const counts: Record<string, number> = {};
    for (const h of hashes) {
      const chatDir = path.join(storageRoot, h, 'chatSessions');
      try {
        const files = await fs.promises.readdir(chatDir);
        counts[h] = files.filter((f) => f.match(/\.jsonl?$/)).length;
      } catch {
        counts[h] = 0;
      }
    }
    hashes.sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    // return all matches, sorted highest‑count first so that the one with
    // the most sessions is used when choosing a single path elsewhere if
    // needed.  emitSessionsList will iterate across all and dedupe.
    return hashes;
  }

  private watchSessions(): void {
    for (const dir of this.sessionsDirs) {
      if (!dir || !fs.existsSync(dir)) {
        continue;
      }
      try {
        const watcher = fs.watch(dir, (_event, filename) => {
          if (!filename?.match(/\.jsonl?$/)) {
            return;
          }
          const fullPath = path.join(dir, filename);
          this.debounceRead(fullPath, async () => {
            await this.handleSessionFile(fullPath);
            await this.emitSessionsList();
          });
        });
        this.sessionWatchers.push(watcher);
      } catch {
        // ignore failures to watch
      }
    }
  }

  private watchEditingSessions(): void {
    for (const dir of this.editingDirs) {
      if (!dir || !fs.existsSync(dir)) {
        continue;
      }
      try {
        const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
          if (!filename?.endsWith('state.json')) {
            return;
          }
          const fullPath = path.join(dir, filename);
          this.debounceRead(fullPath, () => this.handleEditingStateFile(fullPath));
        });
        this.editingWatchers.push(watcher);
      } catch {
        // ignore
      }
    }
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
    const parsed = await this.parseSessionFile(filePath);
    if (!parsed) {
      return;
    }
    const update = this.toChatSessionUpdate(parsed);
    this.callbacks.onSessionUpdate?.(update);
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

  /**
   * Read a session file which may be either plain JSON or newline-delimited (jsonl).
   * For jsonl the last non-empty line represents the current session state.
   */
  private async parseSessionFile(filePath: string): Promise<VscodeChatSessionFile | null> {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      // split into lines and drop empties
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        return null;
      }
      // iterate backwards to find the last line that parses as JSON
      for (let i = lines.length - 1; i >= 0; --i) {
        const line = lines[i];
        try {
          const parsed = JSON.parse(line) as any;
          // some .jsonl files wrap the session in a `{ kind:0, v: {...} }` envelope
          if (parsed && typeof parsed === 'object' && parsed.v && parsed.v.sessionId) {
            return parsed.v as VscodeChatSessionFile;
          }
          if (parsed && parsed.sessionId) {
            return parsed as VscodeChatSessionFile;
          }
          // otherwise continue looking backwards
        } catch {
          // try the previous one
        }
      }
      return null;
    } catch {
      return null;
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
    if (this.sessionsDirs.length === 0) {
      return;
    }
    try {
      const sessions: ChatSessionsList['sessions'] = [];
      const seen = new Set<string>();
      for (const dir of this.sessionsDirs) {
        try {
          const files = await fs.promises.readdir(dir);
          for (const file of files) {
            if (!file.match(/\.jsonl?$/)) {
              continue;
            }
            const fullPath = path.join(dir, file);
            const parsed = await this.parseSessionFile(fullPath);
            if (!parsed) {
              console.log('[ChatWatcher] failed to parse', fullPath);
              continue;
            }
            if (seen.has(parsed.sessionId)) {
              continue;
            }
            seen.add(parsed.sessionId);
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
          }
        } catch {
          // ignore this dir
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
      this.callbacks.onSessionsList?.(list);
    } catch {
      return;
    }
  }
}
