import { ChatResponsePart } from '@remote-pilot/shared';
import clsx from 'clsx';
import React from 'react';
import { ResponsePart } from './components/ResponsePart/ResponsePart';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  userRole: 'user' | 'assistant';
  content?: string;
  parts?: ChatResponsePart[];
}

export const MessageBubble = ({ userRole, content, parts }: MessageBubbleProps) => {
  const isUser = userRole === 'user';

  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start', styles.container)}>
      <div className={clsx(styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant)}>
        {isUser ? (
          <div className={styles.userContent}>{content}</div>
        ) : (
          <div className={styles.responseContainer}>
            {parts?.map((part) => (
              <ResponsePart key={part.content} part={part} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
