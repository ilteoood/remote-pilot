import * as fs from 'node:fs';
import type { ChatEditingState } from '@remote-pilot/shared';
import { toWorkspaceRelativePath } from '../workspaceUtils';
import type { VscodeChatEditingSessionFile } from './types';

/**
 * Read and parse a VS Code chat editing state file into a protocol-level ChatEditingState.
 */
export async function parseEditingFile(filePath: string): Promise<ChatEditingState | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as VscodeChatEditingSessionFile;
    return toChatEditingState(parsed);
  } catch {
    return null;
  }
}

export function toChatEditingState(file: VscodeChatEditingSessionFile): ChatEditingState | null {
  const sessionId = file.sessionId;
  if (!sessionId) {
    return null;
  }
  const entries =
    file.recentSnapshot?.entries ||
    file.linearHistory?.[file.linearHistory.length - 1]?.stops?.[0]?.entries ||
    [];
  const mappedEntries = entries.map((entry) => ({
    filePath: toWorkspaceRelativePath(entry.resource),
    state: (entry.state ?? 0) as 0 | 1 | 2,
    originalHash: entry.originalHash,
    currentHash: entry.currentHash,
  }));

  return { sessionId, entries: mappedEntries };
}
