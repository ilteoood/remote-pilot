import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ChatEditingState,
  ChatSessionsList,
  ChatSessionUpdate,
  VscodeChatEditingSessionFile,
  VscodeChatRequestData,
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
   *
   * VS Code's JSONL format:
   *  - kind=0: full snapshot of the session object
   *  - kind=1: set value at key path (scalar replace)
   *  - kind=2: set value at key path (array replace / append)
   *
   * Both kind=1 and kind=2 use `k` (key path) and `v` (new value).
   * We parse the snapshot and apply all subsequent patches to get the latest state.
   */
  private async parseSessionFile(filePath: string): Promise<VscodeChatSessionFile | null> {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        return null;
      }

      let session: VscodeChatSessionFile | null = null;

      for (const line of lines) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (!parsed || typeof parsed !== 'object') {
          continue;
        }

        // kind=0: full snapshot
        if (parsed.kind === 0 && parsed.v) {
          const v = parsed.v as Record<string, unknown>;
          if (v.sessionId) {
            session = v as unknown as VscodeChatSessionFile;
          }
          continue;
        }

        // kind=1 or kind=2: incremental patch – apply to the current snapshot
        if ((parsed.kind === 1 || parsed.kind === 2) && session && Array.isArray(parsed.k)) {
          const keyPath = parsed.k as (string | number)[];

          // Special handling for k=['requests']: VS Code writes each new request
          // as a separate kind=2 patch with the full requests array containing only
          // that request. We merge by requestId to accumulate the full history.
          if (keyPath.length === 1 && keyPath[0] === 'requests' && Array.isArray(parsed.v)) {
            this.mergeRequests(session, parsed.v as Record<string, unknown>[]);
          } else {
            this.applyPatch(session as unknown as Record<string, unknown>, keyPath, parsed.v);
          }
          continue;
        }

        // Plain JSON (no kind envelope)
        if (parsed.sessionId) {
          session = parsed as unknown as VscodeChatSessionFile;
        }
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Apply a JSONL incremental patch: walk the key path and set the value.
   */
  private applyPatch(
    target: Record<string, unknown>,
    keyPath: (string | number)[],
    value: unknown,
  ): void {
    if (keyPath.length === 0) {
      return;
    }
    let obj: Record<string, unknown> = target;
    for (let i = 0; i < keyPath.length - 1; i++) {
      const key = keyPath[i];
      if (obj == null || typeof obj !== 'object') {
        return;
      }
      obj = (obj as Record<string | number, unknown>)[key] as Record<string, unknown>;
    }
    if (obj != null && typeof obj === 'object') {
      (obj as Record<string | number, unknown>)[keyPath[keyPath.length - 1]] = value;
    }
  }

  /**
   * Merge incoming requests into the session's requests array by requestId.
   * VS Code writes each new request as a kind=2 patch with k=['requests']
   * containing only the new/updated request(s). We need to accumulate them.
   */
  private mergeRequests(session: VscodeChatSessionFile, incoming: Record<string, unknown>[]): void {
    if (!Array.isArray(session.requests)) {
      session.requests = [];
    }

    for (const req of incoming) {
      const reqId = req.requestId as string | undefined;
      if (!reqId) {
        continue;
      }
      const existingIdx = session.requests.findIndex((r) => r.requestId === reqId);
      if (existingIdx >= 0) {
        // Update existing request with the new data
        session.requests[existingIdx] = req as unknown as VscodeChatRequestData;
      } else {
        // Append new request
        session.requests.push(req as unknown as VscodeChatRequestData);
      }
    }
  }

  /**
   * Extract a plain string from a field that may be a string, an object
   * with a `.value` property (VS Code MarkdownString shape), or undefined.
   */
  private extractString(val: unknown): string {
    if (typeof val === 'string') {
      return val;
    }
    if (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
      return String((val as Record<string, unknown>).value ?? '');
    }
    return '';
  }

  private toChatSessionUpdate(session: VscodeChatSessionFile): ChatSessionUpdate {
    const requests = session.requests.map((request) => {
      const message = typeof request.message === 'string' ? request.message : request.message.text;
      const responseParts = request.response
        .map((item) => {
          const kind = item.kind ?? '';

          // Tool invocations – identified by explicit kind or presence of toolId/toolCallId
          if (kind === 'toolInvocationSerialized' || item.toolId || item.toolCallId) {
            const toolStatus: 'completed' | 'running' = item.isComplete ? 'completed' : 'running';
            // Prefer pastTenseMessage when complete, otherwise invocationMessage
            const displayMessage =
              (item.isComplete ? this.extractString(item.pastTenseMessage) : '') ||
              this.extractString(item.invocationMessage) ||
              this.extractString(item.pastTenseMessage) ||
              '';
            return {
              kind: 'tool_invocation' as const,
              content: displayMessage,
              toolName: item.toolId || item.toolCallId || '',
              toolStatus,
            };
          }

          // Thinking blocks
          if (kind === 'thinking') {
            return { kind: 'markdown' as const, content: this.extractString(item.value) };
          }

          // Markdown content – items without a kind, or with kind=markdownContent
          if (!kind || kind === 'markdownContent') {
            const text = this.extractString(item.value);
            if (text) {
              return { kind: 'markdown' as const, content: text };
            }
          }

          // Skip UI-only items like inlineReference, textEditGroup, undoStop, codeblockUri, etc.
          if (
            [
              'inlineReference',
              'textEditGroup',
              'undoStop',
              'codeblockUri',
              'confirmation',
              'progressTaskSerialized',
            ].includes(kind)
          ) {
            return null;
          }

          return { kind: 'unknown' as const, content: JSON.stringify(item) };
        })
        .filter((part): part is NonNullable<typeof part> => part != null);

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
            // Skip empty sessions (no requests ever sent)
            if (parsed.requests.length === 0) {
              continue;
            }
            // Prefer customTitle (set via kind=1 patches) over first request message
            let title = parsed.customTitle || '';
            if (!title) {
              const firstRequest = parsed.requests[0];
              title = firstRequest
                ? typeof firstRequest.message === 'string'
                  ? firstRequest.message
                  : firstRequest.message.text
                : '';
            }
            const createdAt = parsed.creationDate
              ? new Date(parsed.creationDate).toISOString()
              : new Date().toISOString();
            // Compute lastMessageAt from the latest request timestamp or lastMessageDate
            let lastMessageTs = parsed.lastMessageDate || parsed.creationDate || 0;
            for (const req of parsed.requests) {
              if (req.timestamp && req.timestamp > lastMessageTs) {
                lastMessageTs = req.timestamp;
              }
            }
            const lastMessageAt = lastMessageTs ? new Date(lastMessageTs).toISOString() : createdAt;
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

      // Sort sessions by lastMessageAt descending (newest first) to match VS Code ordering
      sessions.sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );

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
