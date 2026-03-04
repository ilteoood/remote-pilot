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
import { Database } from 'node-sqlite3-wasm';
import * as vscode from 'vscode';
import {
  findWorkspaceHashes,
  getWorkspaceStorageRoot,
  toWorkspaceRelativePath,
} from './workspaceUtils';

interface AgentSessionItem {
  resource?: string;
  label?: string;
  timing?: {
    created?: number;
    lastRequestStarted?: number;
    lastRequestEnded?: number;
  };
}

export interface ChatWatcherCallbacks {
  onSessionsList?: (list: ChatSessionsList) => void;
  onSessionUpdate?: (update: ChatSessionUpdate) => void;
  onEditingState?: (state: ChatEditingState) => void;
}

interface DebounceHandle {
  timer: NodeJS.Timeout;
}

const UI_ONLY_KINDS = new Set([
  'inlineReference',
  'textEditGroup',
  'undoStop',
  'codeblockUri',
  'confirmation',
  'progressTaskSerialized',
]);

const SUPPORTED_EXTENSION = '.jsonl';

export class ChatWatcher {
  private readonly disposables: vscode.Disposable[] = [];
  // we may have more than one storage hash for the same workspace (e.g. normal vs dev-host)
  private sessionWatchers: fs.FSWatcher[] = [];
  private editingWatchers: fs.FSWatcher[] = [];
  private workspaceStoragePaths: string[] = []; // list of matched hashes
  private sessionsDirs: string[] = [];
  private editingDirs: string[] = [];
  private debouncedReads = new Map<string, DebounceHandle>();
  private readonly debounceMs = 500;

  constructor(
    private readonly callbacks: ChatWatcherCallbacks,
    private readonly outputChannel: vscode.OutputChannel,
  ) { }

  async start(): Promise<void> {
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
    this.sessionsDirs = this.workspaceStoragePaths.map((p) => path.join(p, 'chatSessions'));
    this.editingDirs = this.workspaceStoragePaths.map((p) => path.join(p, 'chatEditingSessions'));
    console.log('[ChatWatcher] workspaceHashes', workspaceHashes);
    console.log('[ChatWatcher] sessionsDirs', this.sessionsDirs);
    console.log('[ChatWatcher] editingDirs', this.editingDirs);

    this.watchSessions();
    this.watchEditingSessions();
  }

  /**
   * Emit a specific session's content by its ID.
   * Used when the web client requests a particular session.
   */
  async emitSessionById(sessionId: string): Promise<boolean> {
    try {
      for (const dir of this.sessionsDirs) {
        try {
          const fullPath = path.join(dir, `${sessionId}${SUPPORTED_EXTENSION}`);
          const parsed = await this.parseSessionFile(fullPath);
          if (parsed?.sessionId === sessionId) {
            this.updateSession(parsed);
            return true;
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

  /**
   * Returns the paths of the `limit` most recently modified session files in
   * the given directory, sorted by mtime descending.
   */
  private async getRecentSessionFiles(dir: string, limit = 10): Promise<Set<string>> {
    const files = await fs.promises.readdir(dir);
    const sessionFiles = files.filter((f) => f.endsWith(SUPPORTED_EXTENSION));
    const fileStats = await Promise.all(
      sessionFiles.map(async (file) => {
        const fullPath = path.join(dir, file);
        try {
          const stat = await fs.promises.stat(fullPath);
          return { fullPath, mtime: stat.mtimeMs };
        } catch {
          return null;
        }
      }),
    );
    return new Set(
      fileStats
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit)
        .map((entry) => entry.fullPath),
    );
  }

  private async watchSessions(): Promise<void> {
    for (const dir of this.sessionsDirs) {
      if (!dir || !fs.existsSync(dir)) {
        continue;
      }
      try {
        let recentFiles = await this.getRecentSessionFiles(dir);
        const watcher = fs.watch(dir, async (event, filename) => {
          if (!filename?.endsWith(SUPPORTED_EXTENSION)) {
            return;
          }
          if (event === 'rename') {
            recentFiles = await this.getRecentSessionFiles(dir);
            await this.emitSessionsList();
          }
          const fullPath = path.join(dir, filename);
          if (!recentFiles.has(fullPath)) {
            return;
          }
          this.debounceRead(fullPath, () => this.handleSessionFile(fullPath));
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
      action().catch(() => { });
    }, this.debounceMs);
    this.debouncedReads.set(filePath, { timer });
  }

  private async handleSessionFile(filePath: string): Promise<void> {
    const parsed = await this.parseSessionFile(filePath);
    if (!parsed) {
      return;
    }
    this.updateSession(parsed);
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
    const keyPathLength = keyPath.length;
    if (!keyPathLength) {
      return;
    }
    let obj: Record<string, unknown> = target;
    for (let i = 0; i < keyPathLength - 1; i++) {
      if (obj == null || typeof obj !== 'object') {
        return;
      }
      const key = keyPath[i];
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

  private updateSession(session: VscodeChatSessionFile) {
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
          if (UI_ONLY_KINDS.has(kind)) {
            return null;
          }

          return { kind: 'unknown' as const, content: JSON.stringify(item) };
        })
        // final filter: drop parts whose content is empty or just a code fence
        .filter((part): part is NonNullable<typeof part> => {
          const t = part?.content.trim();
          return Boolean(t) && t !== '```';
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

    return this.callbacks.onSessionUpdate?.({
      sessionId: session.sessionId,
      requests,
      hasPendingEdits: Boolean(session.hasPendingEdits),
    });
  }

  private toChatEditingState(file: VscodeChatEditingSessionFile): ChatEditingState | null {
    const sessionId = file.sessionId;
    if (!sessionId) {
      return null;
    }
    const entries =
      file.recentSnapshot?.entries ||
      file.linearHistory?.[file.linearHistory.length - 1]?.stops?.[0]?.entries ||
      [];
    const mappedEntries = entries.map((entry) => {
      return {
        filePath: toWorkspaceRelativePath(entry.resource),
        state: (entry.state ?? 0) as 0 | 1 | 2,
        originalHash: entry.originalHash,
        currentHash: entry.currentHash,
      };
    });

    return { sessionId, entries: mappedEntries };
  }

  public async emitSessionsList(): Promise<void> {
    if (this.workspaceStoragePaths.length === 0) {
      return;
    }
    try {
      const sessions: ChatSessionsList['sessions'] = [];

      for (const storagePath of this.workspaceStoragePaths) {
        const dbPath = path.join(storagePath, 'state.vscdb');
        this.outputChannel.appendLine(`[ChatWatcher] Reading sessions from ${dbPath}`);
        if (!fs.existsSync(dbPath)) {
          continue;
        }
        try {
          const items = this.readAgentSessionsFromDb(dbPath);
          this.outputChannel.appendLine(
            `[ChatWatcher] Found ${items.length} sessions in ${dbPath}`,
          );
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

  private readAgentSessionsFromDb(dbPath: string): AgentSessionItem[] {
    const db = new Database(dbPath, { readOnly: true, fileMustExist: true });
    try {
      const row = db.get("SELECT value FROM ItemTable WHERE key = 'agentSessions.model.cache'") as {
        value: string;
      } | null;
      if (!row?.value) {
        return [];
      }
      const parsed = JSON.parse(row.value) as AgentSessionItem[];
      return Array.isArray(parsed) ? [...parsed].reverse() : [];
    } catch {
      return [];
    } finally {
      db.close();
    }
  }
}
