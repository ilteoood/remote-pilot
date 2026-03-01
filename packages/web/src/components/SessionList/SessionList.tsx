import React, { useState } from 'react';
import { ChatSessionsList, ChatSessionSummary } from '@remote-pilot/shared';
import styles from './SessionList.module.css';

interface SessionListProps {
  sessions: ChatSessionsList | null;
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({ 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  onNewSession 
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Sessions</h2>
        <button 
          onClick={onNewSession}
          className={styles.newButton}
          title="New Session"
        >
          +
        </button>
      </div>
      
      <div className={styles.sessionList}>
        {sessions?.sessions.map(session => (
          <SessionItem 
            key={session.sessionId} 
            session={session} 
            isActive={session.sessionId === activeSessionId}
            onClick={() => onSelectSession(session.sessionId)}
          />
        ))}
        {(!sessions || sessions.sessions.length === 0) && (
          <div className={styles.emptyState}>
            No sessions found.
          </div>
        )}
      </div>
    </div>
  );
};

const SessionItem: React.FC<{ 
  session: ChatSessionSummary; 
  isActive: boolean; 
  onClick: () => void;
}> = ({ session, isActive, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`${styles.sessionItem} ${isActive ? styles.sessionItemActive : styles.sessionItemInactive}`}
    >
      <div className="flex justify-between items-start mb-1">
        <div className={`${styles.sessionTitle} ${isActive ? styles.sessionTitleActive : styles.sessionTitleInactive}`}>
          {session.title || 'Untitled Session'}
        </div>
        {session.hasPendingEdits && (
          <div className={styles.pendingIndicator} />
        )}
      </div>
      <div className={styles.sessionDate}>
        {new Date(session.lastMessageAt).toLocaleDateString()}
      </div>
    </div>
  );
};
