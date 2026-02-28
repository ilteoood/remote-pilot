import React from 'react';
import { ChatSessionsList, ChatSessionSummary } from '@remote-pilot/shared';

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
    <div className="flex flex-col h-full" style={{ 
      width: '280px', 
      borderRight: '1px solid var(--border-subtle)',
      background: 'var(--bg-panel)',
      flexShrink: 0
    }}>
      <div className="flex justify-between items-center" style={{ padding: 'var(--space-md)' }}>
        <h2 style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Sessions</h2>
        <button 
          onClick={onNewSession}
          style={{ 
            color: 'var(--accent-primary)',
            fontSize: '18px',
            lineHeight: 1
          }}
          title="New Session"
        >
          +
        </button>
      </div>
      
      <div className="grow" style={{ overflowY: 'auto' }}>
        {sessions?.sessions.map(session => (
          <SessionItem 
            key={session.sessionId} 
            session={session} 
            isActive={session.sessionId === activeSessionId}
            onClick={() => onSelectSession(session.sessionId)}
          />
        ))}
        {(!sessions || sessions.sessions.length === 0) && (
          <div style={{ padding: 'var(--space-md)', color: 'var(--text-dim)', fontSize: '12px' }}>
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
      style={{
        padding: '12px var(--space-md)',
        background: isActive ? 'var(--bg-panel-hover)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div className="flex justify-between items-start mb-1">
        <div style={{ 
          fontWeight: isActive ? 600 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '180px',
          fontSize: '14px'
        }}>
          {session.title || 'Untitled Session'}
        </div>
        {session.hasPendingEdits && (
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--accent-warning)',
            marginTop: '4px'
          }} />
        )}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
        {new Date(session.lastMessageAt).toLocaleDateString()}
      </div>
    </div>
  );
};
