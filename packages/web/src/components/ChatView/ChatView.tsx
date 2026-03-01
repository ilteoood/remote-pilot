import { ChatSessionUpdate } from '@remote-pilot/shared';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageBubble } from '../MessageBubble/MessageBubble';
import styles from './ChatView.module.css';

interface ChatViewProps {
  session: ChatSessionUpdate | null;
}

export const ChatView: React.FC<ChatViewProps> = ({ session }) => {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  if (!session) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyContent}>
          <h3>{t('chatView.noSession')}</h3>
          <p>{t('chatView.selectOrStart')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {session.requests.map((req) => (
        <React.Fragment key={req.requestId}>
          <MessageBubble content={req.message} />
          {(req.responseParts.length > 0 || req.isStreaming) && (
            <MessageBubble parts={req.responseParts} />
          )}
        </React.Fragment>
      ))}
      <div ref={endRef} />
    </div>
  );
};
