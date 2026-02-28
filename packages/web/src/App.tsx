import React, { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { PairingScreen } from './components/PairingScreen';
import { ChatLayout } from './components/ChatLayout';
import './styles/global.css';

export const App: React.FC = () => {
  const {
    isConnected,
    isPaired,
    extensionStatus,
    sessionsList,
    activeSession,
    editingState,
    send,
  } = useWebSocket();

  const [pairingError, setPairingError] = useState<string | undefined>();
  // We track local active session ID to know what we are looking at, 
  // though the source of truth is the extension.
  const [localActiveSessionId, setLocalActiveSessionId] = useState<string | undefined>();

  // Sync local active session with extension status or update
  useEffect(() => {
    if (activeSession?.sessionId) {
      setLocalActiveSessionId(activeSession.sessionId);
    } else if (extensionStatus?.activeSessionId) {
      setLocalActiveSessionId(extensionStatus.activeSessionId);
    }
  }, [activeSession, extensionStatus]);

  const handlePair = (code: string) => {
    setPairingError(undefined);
    sessionStorage.setItem('pairing_code', code);
    send('pair_request', { pairingCode: code });
    
    // Timeout error if no response in 5s (handled by UI state mostly, but good for UX)
    setTimeout(() => {
      if (!isPaired) {
        // This is a rough heuristic, ideally pair_response would set error
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

  // We are "connected" if the websocket is open.
  // We are "ready" if we are paired.

  if (!isConnected) {
    return (
      <div className="flex justify-center items-center h-full text-dim">
        <div style={{ color: 'var(--text-secondary)' }}>Connecting to server...</div>
      </div>
    );
  }

  if (!isPaired) {
    return (
      <PairingScreen 
        onPair={handlePair} 
        isConnecting={false} // We are connected to WS, just not paired
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
      onSelectSession={(id) => {
        setLocalActiveSessionId(id);
        // Note: The protocol doesn't seem to have a "switch session" command 
        // that doesn't involve sending a message. 
        // We might just be viewing the last known state until we send a message.
        // Or maybe we should trigger a "refresh" if the protocol supported it.
        // For now, we just update local state to highlight it.
      }}
      onNewSession={handleNewSession}
      onSendMessage={handleSendMessage}
      onAcceptAll={handleAcceptAll}
      onRejectAll={handleRejectAll}
      onContinue={handleContinue}
    />
  );
};
