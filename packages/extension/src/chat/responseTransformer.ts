import type { ChatResponsePart, ChatSessionUpdate } from '@remote-pilot/shared';
import type { VscodeChatResponseItem, VscodeChatSessionFile } from './types';

const UI_ONLY_KINDS = new Set([
  'textEditGroup',
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
  const requests = session.requests.map((request) => {
    const message = typeof request.message === 'string' ? request.message : request.message.text;
    const responseParts = request.response
      .map(transformResponseItem)
      // drop parts whose content is empty or just a code fence
      .filter((part): part is NonNullable<typeof part> => {
        const t = part?.content.trim();
        return Boolean(t);
      });

    const mergedParts = mergeConsecutiveMarkdown(responseParts);

    const lastResponse = request.response.at(-1);
    return {
      requestId: request.requestId,
      message,
      responseParts: mergedParts,
      isStreaming: lastResponse?.isComplete === false,
      isCanceled: request.isCanceled ?? false,
      timestamp: new Date(request.timestamp ?? Date.now()).toISOString(),
    };
  });

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

  // Skip UI-only items like textEditGroup, undoStop, codeblockUri, etc.
  if (UI_ONLY_KINDS.has(kind)) {
    return null;
  }

  return { kind: 'unknown', content: JSON.stringify(item) };
}

/**
 * Merge consecutive markdown parts into a single part to reduce payload size.
 */
function mergeConsecutiveMarkdown(parts: ChatResponsePart[]): ChatResponsePart[] {
  const merged: ChatResponsePart[] = [];
  for (const part of parts) {
    const prev = merged.at(-1);
    if (prev?.kind === 'markdown' && part.kind === 'markdown') {
      prev.content += part.content;
    } else {
      merged.push(part);
    }
  }
  return merged;
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
