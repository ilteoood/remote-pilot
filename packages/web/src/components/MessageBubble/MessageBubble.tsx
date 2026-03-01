import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatResponsePart } from '@remote-pilot/shared';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content?: string;
  parts?: ChatResponsePart[];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content, parts }) => {
  const isUser = role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${styles.container}`}>
      <div 
        className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
      >
        {isUser ? (
          <div className={styles.userContent}>{content}</div>
        ) : (
          <div className={styles.responseContainer}>
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
      <div className={styles.citation}>
        Citation: {part.content}
      </div>
    );
  }

  return null;
};

const ToolInvocation: React.FC<{ part: ChatResponsePart }> = ({ part }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  let statusIcon = '○';
  let statusClass = styles.statusDefault;
  
  if (part.toolStatus === 'running') {
    statusIcon = '●';
    statusClass = styles.statusRunning;
  } else if (part.toolStatus === 'completed') {
    statusIcon = '✓';
    statusClass = styles.statusCompleted;
  } else if (part.toolStatus === 'failed') {
    statusIcon = '✕';
    statusClass = styles.statusFailed;
  }

  return (
    <div className={styles.toolContainer}>
      <div 
        className={styles.toolHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.toolInfo}>
          <span className={`${styles.statusIcon} ${statusClass}`}>{statusIcon}</span>
          <span className={styles.toolName}>
            {part.toolName || 'Tool'}
          </span>
        </div>
        <div className={styles.toggleText}>
          {isExpanded ? 'Hide' : 'Show'}
        </div>
      </div>
      
      {isExpanded && (
        <div className={styles.toolContent}>
          {part.content}
        </div>
      )}
    </div>
  );
};
