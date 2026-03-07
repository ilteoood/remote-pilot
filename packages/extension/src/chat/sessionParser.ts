import * as fs from 'node:fs';
import type { VscodeChatRequestData, VscodeChatSessionFile } from './types';

export const SUPPORTED_EXTENSION = '.jsonl';

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
export async function parseSessionFile(filePath: string): Promise<VscodeChatSessionFile | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return parseSessionContent(raw);
  } catch {
    return null;
  }
}

function parseSessionContent(raw: string): VscodeChatSessionFile | null {
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

      // Special handling for k=['requests']:
      // kind=1 (set): VS Code replaces the full requests array – honour the new order.
      // kind=2 (append): VS Code appends new/updated requests – merge by requestId.
      if (keyPath.length === 1 && keyPath[0] === 'requests' && Array.isArray(parsed.v)) {
        if (parsed.kind === 1) {
          replaceRequests(session, parsed.v as Record<string, unknown>[]);
        } else {
          mergeRequests(session, parsed.v as Record<string, unknown>[]);
        }
      } else {
        applyPatch(
          session as unknown as Record<string, unknown>,
          keyPath,
          parsed.v,
          parsed.kind === 2,
          typeof parsed.i === 'number' ? (parsed.i as number) : undefined,
        );
      }
      continue;
    }

    // Plain JSON (no kind envelope)
    if (parsed.sessionId) {
      session = parsed as unknown as VscodeChatSessionFile;
    }
  }

  return session;
}

/**
 * Apply a JSONL incremental patch: walk the key path and set the value.
 * When `isAppend` is true (kind=2), array values are concatenated rather than replaced.
 */
function applyPatch(
  target: Record<string, unknown>,
  keyPath: (string | number)[],
  value: unknown,
  isAppend: boolean,
  spliceIndex: number = -1,
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
    const lastKey = keyPath[keyPathLength - 1];
    if (isAppend && Array.isArray(value)) {
      const existing = (obj as Record<string | number, unknown>)[lastKey];
      if (Array.isArray(existing)) {
        if (spliceIndex < existing.length) {
          existing.splice(spliceIndex, existing.length - spliceIndex, ...value);
        } else {
          existing.push(...value);
        }
        return;
      }
    }
    (obj as Record<string | number, unknown>)[lastKey] = value;
  }
}

/**
 * Replace the session's requests array wholesale (kind=1 / set).
 * Preserves the order provided by VS Code.
 */
function replaceRequests(
  session: VscodeChatSessionFile,
  incoming: Record<string, unknown>[],
): void {
  session.requests = incoming
    .filter((r) => r.requestId)
    .map((r) => r as unknown as VscodeChatRequestData);
}

/**
 * Merge incoming requests into the session's requests array by requestId.
 * VS Code writes each new request as a kind=2 patch with k=['requests']
 * containing only the new/updated request(s). We need to accumulate them.
 */
function mergeRequests(session: VscodeChatSessionFile, incoming: Record<string, unknown>[]): void {
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
