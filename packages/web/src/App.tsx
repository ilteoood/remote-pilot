import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './App.module.css';
import { ChatLayout } from './components/ChatLayout/ChatLayout';
import { PairingScreen } from './components/PairingScreen/PairingScreen';
import { useWebSocket } from './hooks/useWebSocket';
import './styles/global.css';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const {
    isConnected,
    isPaired,
    extensionStatus,
    sessionsList,
    activeSession,
    send,
  } = useWebSocket();

  const [pairingError, setPairingError] = useState<string | undefined>();
  const [localActiveSessionId, setLocalActiveSessionId] = useState<string | undefined>();

  useEffect(() => {
    if (activeSession?.sessionId) {
      setLocalActiveSessionId(activeSession.sessionId);
    } else if (extensionStatus?.activeSessionId) {
      setLocalActiveSessionId(extensionStatus.activeSessionId);
    }
  }, [activeSession, extensionStatus]);

  useEffect(() => {
    if (!localActiveSessionId && sessionsList?.sessions?.length) {
      const first = sessionsList.sessions[0];
      setLocalActiveSessionId(first.sessionId);
    }
  }, [sessionsList, localActiveSessionId]);

  useEffect(() => {
    if (localActiveSessionId && isPaired) {
      if (!activeSession || activeSession.sessionId !== localActiveSessionId) {
        send('request_session', { sessionId: localActiveSessionId });
      }
    }
  }, [localActiveSessionId, isPaired]);

  const handlePair = (code: string) => {
    setPairingError(undefined);
    sessionStorage.setItem('pairing_code', code);
    send('pair_request', { pairingCode: code });

    setTimeout(() => {
      if (!isPaired) {
      }
    }, 5000);
  };

  const handleSendMessage = (text: string) => {
    send('send_message', {
      prompt: text,
      sessionId: localActiveSessionId
    });
  };

  const handleNewSession = () => {
    send('new_chat_session', {});
  };

  const handleAcceptAll = () => {
    send('accept_all_edits', {});
  };

  const handleRejectAll = () => {
    send('reject_all_edits', {});
  };

  const handleContinue = () => {
    send('continue_iteration', {});
  };

  const hasPendingEdits = !!sessionsList?.sessions.find(s => s.sessionId === localActiveSessionId)?.hasPendingEdits;

  if (!isConnected) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>{t('app.connecting')}</div>
      </div>
    );
  }

  if (!isPaired) {
    return (
      <PairingScreen
        onPair={handlePair}
        isConnecting={false}
        error={pairingError}
      />
    );
  }

  return (
    <ChatLayout
      sessions={sessionsList}
      activeSession={activeSession}
      activeSessionId={localActiveSessionId}
      extensionStatus={extensionStatus}
      isConnected={isConnected}
      isPaired={isPaired}
      hasPendingEdits={hasPendingEdits}
      onSelectSession={setLocalActiveSessionId}
      onNewSession={handleNewSession}
      onSendMessage={handleSendMessage}
      onAcceptAll={handleAcceptAll}
      onRejectAll={handleRejectAll}
      onContinue={handleContinue}
    />
  );
};
