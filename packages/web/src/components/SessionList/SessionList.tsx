import { ChatSessionSummary, ChatSessionsList } from '@remote-pilot/shared';
import clsx from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
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
  onNewSession,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('sessionList.sessions')}</h2>
        <button
          type="button"
          onClick={onNewSession}
          className={styles.newButton}
          title={t('sessionList.newSession')}
        >
          +
        </button>
      </div>

      <div className={styles.sessionList}>
        {sessions?.sessions.map((session) => (
          <SessionItem
            key={session.sessionId}
            session={session}
            isActive={session.sessionId === activeSessionId}
            onClick={() => onSelectSession(session.sessionId)}
          />
        ))}
        {(!sessions || sessions.sessions.length === 0) && (
          <div className={styles.emptyState}>{t('sessionList.noSessions')}</div>
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
  const { t } = useTranslation();

  return (
    <div
      onClick={onClick}
      className={clsx(
        styles.sessionItem,
        isActive ? styles.sessionItemActive : styles.sessionItemInactive,
      )}
    >
      <div className="flex justify-between items-start mb-1">
        <div
          className={clsx(
            styles.sessionTitle,
            isActive ? styles.sessionTitleActive : styles.sessionTitleInactive,
          )}
        >
          {session.title || t('sessionList.untitled')}
        </div>
        {session.hasPendingEdits && <div className={styles.pendingIndicator} />}
      </div>
      <div className={styles.sessionDate}>
        {new Date(session.lastMessageAt).toLocaleDateString()}
      </div>
    </div>
  );
};
