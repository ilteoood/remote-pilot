import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChatEditingState, ChatSessionUpdate } from '@remote-pilot/shared';
import * as vscode from 'vscode';
import type { ChatSessions } from './chatSessions';
import { parseEditingFile } from './editingParser';
import { transformSession } from './responseTransformer';
import { parseSessionFile, SUPPORTED_EXTENSION } from './sessionParser';

export interface ChatWatcherCallbacks {
  onSessionUpdate?: (update: ChatSessionUpdate) => void;
  onEditingState?: (state: ChatEditingState) => void;
}

interface DebounceHandle {
  timer: NodeJS.Timeout;
}

export class ChatWatcher {
  private readonly disposables: vscode.Disposable[] = [];
  // we may have more than one storage hash for the same workspace (e.g. normal vs dev-host)
  private sessionWatchers: fs.FSWatcher[] = [];
  private editingWatchers: fs.FSWatcher[] = [];
  private sessionsDirs: string[] = [];
  private editingDirs: string[] = [];
  private debouncedReads = new Map<string, DebounceHandle>();
  private readonly debounceMs = 500;

  constructor(
    private readonly callbacks: ChatWatcherCallbacks,
    private chatSessions: ChatSessions,
  ) {}

  async start(): Promise<void> {
    const workspaceStoragePaths = this.chatSessions.workspaceStoragePaths;
    this.sessionsDirs = workspaceStoragePaths.map((p) => path.join(p, 'chatSessions'));
    this.editingDirs = workspaceStoragePaths.map((p) => path.join(p, 'chatEditingSessions'));

    this.watchSessions();
    this.watchEditingSessions();
  }

  /**
   * Emit a specific session's content by its ID.
   * Used when the web client requests a particular session.
   */
  async emitSessionById(sessionId: string): Promise<boolean> {
    for (const dir of this.sessionsDirs) {
      try {
        const fullPath = path.join(dir, `${sessionId}${SUPPORTED_EXTENSION}`);
        const parsed = await parseSessionFile(fullPath);
        if (parsed?.sessionId === sessionId) {
          this.callbacks.onSessionUpdate?.(transformSession(parsed));
          return true;
        }
      } catch {
        // ignore this directory
      }
    }
    return false;
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
            await this.chatSessions.emitSessionsList();
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
      action().catch(() => {});
    }, this.debounceMs);
    this.debouncedReads.set(filePath, { timer });
  }

  private async handleSessionFile(filePath: string): Promise<void> {
    const parsed = await parseSessionFile(filePath);
    if (!parsed) {
      return;
    }
    this.callbacks.onSessionUpdate?.(transformSession(parsed));
  }

  private async handleEditingStateFile(filePath: string): Promise<void> {
    const state = await parseEditingFile(filePath);
    if (state) {
      this.callbacks.onEditingState?.(state);
    }
  }
}
