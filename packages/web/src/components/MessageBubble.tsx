import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatResponsePart } from '@remote-pilot/shared';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content?: string;
  parts?: ChatResponsePart[];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content, parts }) => {
  const isUser = role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div 
        style={{
          maxWidth: '85%',
          background: isUser ? 'var(--bg-panel-hover)' : 'transparent',
          border: isUser ? '1px solid var(--border-subtle)' : 'none',
          borderRadius: '8px',
          padding: isUser ? '12px 16px' : '0',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
        ) : (
          <div className="flex flex-col gap-sm">
            {parts?.map((part, idx) => (
              <ResponsePart key={idx} part={part} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ResponsePart: React.FC<{ part: ChatResponsePart }> = ({ part }) => {
  if (part.kind === 'markdown') {
    return (
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {part.content}
        </ReactMarkdown>
      </div>
    );
  }

  if (part.kind === 'tool_invocation') {
    return <ToolInvocation part={part} />;
  }
  
  if (part.kind === 'code_citation') {
    return (
      <div style={{ 
        fontSize: '0.8em', 
        color: 'var(--text-secondary)',
        borderLeft: '2px solid var(--border-subtle)',
        paddingLeft: '8px'
      }}>
        Citation: {part.content}
      </div>
    );
  }

  return null;
};

const ToolInvocation: React.FC<{ part: ChatResponsePart }> = ({ part }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  let statusColor = 'var(--text-secondary)';
  let statusIcon = '○';
  
  if (part.toolStatus === 'running') {
    statusColor = 'var(--accent-warning)';
    statusIcon = '●'; // Should animate ideally
  } else if (part.toolStatus === 'completed') {
    statusColor = 'var(--accent-success)';
    statusIcon = '✓';
  } else if (part.toolStatus === 'failed') {
    statusColor = 'var(--accent-error)';
    statusIcon = '✕';
  }

  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: '4px',
      background: 'var(--bg-panel)',
      overflow: 'hidden',
      margin: '4px 0'
    }}>
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-white/5"
        style={{ padding: '8px 12px' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-sm">
          <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusIcon}</span>
          <span style={{ fontWeight: 600, fontSize: '0.9em' }}>
            {part.toolName || 'Tool'}
          </span>
        </div>
        <div style={{ fontSize: '0.8em', color: 'var(--text-secondary)' }}>
          {isExpanded ? 'Hide' : 'Show'}
        </div>
      </div>
      
      {isExpanded && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.9em',
          background: 'rgba(0,0,0,0.2)',
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono)'
        }}>
          {part.content}
        </div>
      )}
    </div>
  );
};
