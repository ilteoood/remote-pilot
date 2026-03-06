import type { ChatResponsePart, ChatSessionUpdate } from '@remote-pilot/shared';
import type { VscodeChatResponseItem, VscodeChatSessionFile } from './types';

const UI_ONLY_KINDS = new Set([
  'undoStop',
  'codeblockUri',
  'confirmation',
  'progressTaskSerialized',
]);

/**
 * Transform a parsed VS Code session file into a protocol-level ChatSessionUpdate.
 * This is a pure function: no I/O, no side effects.
 */
export function transformSession(session: VscodeChatSessionFile): ChatSessionUpdate {
  const requests = session.requests
    .map((request) => {
      const message = typeof request.message === 'string' ? request.message : request.message.text;
      const responseParts = request.response
        .map(transformResponseItem)
        .filter((part): part is NonNullable<typeof part> => Boolean(part?.content.trim()));

      const mergedParts = deduplicateTextEdits(
        stripOrphanFences(mergeConsecutiveMarkdown(responseParts)),
      );

      const lastResponse = request.response.at(-1);
      return {
        requestId: request.requestId,
        message,
        responseParts: mergedParts,
        isStreaming: lastResponse?.isComplete === false,
        isCanceled: request.isCanceled ?? false,
        timestamp: new Date(request.timestamp ?? Date.now()).toISOString(),
      };
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    sessionId: session.sessionId,
    requests,
    hasPendingEdits: Boolean(session.hasPendingEdits),
  };
}

function transformResponseItem(item: VscodeChatResponseItem): ChatResponsePart | null {
  const kind = item.kind ?? '';

  // Tool invocations – identified by explicit kind or presence of toolId/toolCallId
  if (kind === 'toolInvocationSerialized' || item.toolId || item.toolCallId) {
    const toolStatus: 'completed' | 'running' = item.isComplete ? 'completed' : 'running';
    // Prefer pastTenseMessage when complete, otherwise invocationMessage
    const displayMessage =
      (item.isComplete ? extractString(item.pastTenseMessage) : '') ||
      extractString(item.invocationMessage) ||
      extractString(item.pastTenseMessage) ||
      '';
    return {
      kind: 'tool_invocation',
      content: displayMessage,
      toolName: item.toolId || item.toolCallId || '',
      toolStatus,
    };
  }

  // Inline references – convert to backtick-wrapped symbol names
  if (kind === 'inlineReference') {
    const name = item.name || extractInlineReferenceName(item.inlineReference);
    if (name) {
      return { kind: 'markdown', content: `\`${name}\`` };
    }
    return null;
  }

  // Thinking blocks
  if (kind === 'thinking') {
    return { kind: 'markdown', content: extractString(item.value) };
  }

  // Markdown content – items without a kind, or with kind=markdownContent
  if (!kind || kind === 'markdownContent') {
    const text = extractString(item.value);
    if (text) {
      return { kind: 'markdown', content: text };
    }
  }

  // File edits – extract the file path from the URI
  if (kind === 'textEditGroup') {
    const uri = item.uri as Record<string, unknown> | undefined;
    const filePath = (uri?.path as string) || '';
    if (!filePath) {
      return null;
    }
    return {
      kind: 'text_edit' as const,
      content: filePath,
      filePath,
    };
  }

  // Skip UI-only items like undoStop, codeblockUri, etc.
  if (UI_ONLY_KINDS.has(kind)) {
    return null;
  }

  return { kind: 'unknown', content: JSON.stringify(item) };
}

/**
 * Merge consecutive markdown parts into a single part to reduce payload size.
 * Also strips empty code fences that VS Code uses as placeholders for file edit widgets.
 */
function mergeConsecutiveMarkdown(parts: ChatResponsePart[]): ChatResponsePart[] {
  const merged: ChatResponsePart[] = [];
  for (const part of parts) {
    const effective =
      part.kind === 'markdown'
        ? { ...part, content: part.content.replace(/```\s*```/g, '').trim() }
        : part;
    if (!effective.content) continue;
    const prev = merged.at(-1);
    if (prev?.kind === 'markdown' && effective.kind === 'markdown') {
      prev.content += `\n${effective.content}`;
    } else {
      merged.push(effective);
    }
  }
  return merged;
}

/**
 * Strip orphan code fences (``` markers) from markdown parts that sit next to
 * text_edit parts. VS Code wraps each textEditGroup widget in ``` fences;
 * after we extract those as text_edit parts, the surrounding fences become
 * orphans that produce empty code blocks in the rendered output.
 */
function stripOrphanFences(parts: ChatResponsePart[]): ChatResponsePart[] {
  const result: ChatResponsePart[] = [];
  const partsLength = parts.length;
  for (let i = 0; i < partsLength; i++) {
    const part = parts[i];
    if (part.kind !== 'markdown') {
      result.push(part);
      continue;
    }
    const prevIsEdit = parts[i - 1]?.kind === 'text_edit';
    const nextIsEdit = parts[i + 1]?.kind === 'text_edit';
    let content = part.content;
    // Strip trailing ``` when the next part is a text_edit
    if (nextIsEdit) {
      content = content.replace(/\n?```\s*$/, '').trimEnd();
    }
    // Strip leading ``` when the previous part is a text_edit
    if (prevIsEdit) {
      content = content.replace(/^```\s*\n?/, '').trimStart();
    }
    if (content) {
      result.push({ ...part, content });
    }
  }
  return result;
}

/**
 * Deduplicate consecutive text_edit parts that reference the same file path.
 * VS Code may emit multiple textEditGroup items for the same file as edits stream in.
 */
function deduplicateTextEdits(parts: ChatResponsePart[]): ChatResponsePart[] {
  const result: ChatResponsePart[] = [];
  const seenEditPaths = new Set<string>();
  for (const part of parts) {
    if (part.kind === 'text_edit' && part.filePath) {
      if (seenEditPaths.has(part.filePath)) continue;
      seenEditPaths.add(part.filePath);
    }
    result.push(part);
  }
  return result;
}

/**
 * Extract a plain string from a field that may be a string, an object
 * with a `.value` property (VS Code MarkdownString shape), or undefined.
 */
function extractString(val: unknown): string {
  if (typeof val === 'string') {
    return val;
  }
  if (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).value ?? '');
  }
  return '';
}

/**
 * Extract the display name from an inlineReference item.
 */
function extractInlineReferenceName(ref: unknown): string {
  if (!ref || typeof ref !== 'object') {
    return '';
  }
  const obj = ref as Record<string, unknown>;
  if (typeof obj.name === 'string') {
    return obj.name;
  }
  return '';
}
