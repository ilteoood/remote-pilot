import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './App.module.css';
import { ChatLayout } from './components/ChatLayout/ChatLayout';
import { PairingScreen } from './components/PairingScreen/PairingScreen';
import { useWebSocket } from './hooks/useWebSocket';
import './styles/global.css';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const { isConnected, isPaired, extensionStatus, sessionsList, sessionDataMap, send } =
    useWebSocket();

  const [pairingError, setPairingError] = useState<string | undefined>();
  const [localActiveSessionId, setLocalActiveSessionId] = useState<string | undefined>();

  // Derive activeSession from the cache
  const activeSession = localActiveSessionId
    ? (sessionDataMap[localActiveSessionId] ?? null)
    : null;

  // Auto-select the first session if none is selected
  useEffect(() => {
    if (!localActiveSessionId && sessionsList?.sessions?.length) {
      setLocalActiveSessionId(sessionsList.sessions[0].sessionId);
    }
  }, [sessionsList, localActiveSessionId]);

  // Request session data when active session changes (and we don't have it cached)
  useEffect(() => {
    if (localActiveSessionId && isPaired && !sessionDataMap[localActiveSessionId]) {
      send('request_session', { sessionId: localActiveSessionId });
    }
  }, [localActiveSessionId, isPaired, send, sessionDataMap]);

  const handlePair = (code: string) => {
    setPairingError(undefined);
    sessionStorage.setItem('pairing_code', code);
    send('pair_request', { pairingCode: code });
  };

  const handleSendMessage = (text: string) => {
    send('send_message', {
      prompt: text,
      sessionId: localActiveSessionId,
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

  const hasPendingEdits = !!sessionsList?.sessions.find((s) => s.sessionId === localActiveSessionId)
    ?.hasPendingEdits;

  // When user clicks a session, always request fresh data from the extension
  const handleSelectSession = useCallback(
    (id: string) => {
      setLocalActiveSessionId(id);
      if (isPaired) {
        send('request_session', { sessionId: id });
      }
    },
    [isPaired, send],
  );

  if (!isConnected) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>{t('app.connecting')}</div>
      </div>
    );
  }

  if (!isPaired) {
    return <PairingScreen onPair={handlePair} isConnecting={false} error={pairingError} />;
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
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
      onSendMessage={handleSendMessage}
      onAcceptAll={handleAcceptAll}
      onRejectAll={handleRejectAll}
      onContinue={handleContinue}
    />
  );
};
