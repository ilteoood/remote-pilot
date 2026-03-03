import { ChatResponsePart } from '@remote-pilot/shared';
import clsx from 'clsx';
import React, { useState } from 'react';
import styles from './ToolInvocation.module.css';

interface ToolInvocationProps {
  part: ChatResponsePart;
}

export const ToolInvocation: React.FC<ToolInvocationProps> = ({ part }) => {
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
      <div className={styles.toolHeader} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.toolInfo}>
          <span className={clsx(styles.statusIcon, statusClass)}>{statusIcon}</span>
          <span className={styles.toolName}>{part.toolName || 'Tool'}</span>
        </div>
        <div className={styles.toggleText}>{isExpanded ? 'Hide' : 'Show'}</div>
      </div>

      {isExpanded && <div className={styles.toolContent}>{part.content}</div>}
    </div>
  );
};
