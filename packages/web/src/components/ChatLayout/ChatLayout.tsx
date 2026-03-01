import React, { useState } from 'react';
import { SessionList } from '../SessionList/SessionList';
import { ChatView } from '../ChatView/ChatView';
import { ActionBar } from '../ActionBar/ActionBar';
import { StatusIndicator } from '../StatusIndicator/StatusIndicator';
import { ChatSessionUpdate, ChatSessionsList, ExtensionStatus } from '@remote-pilot/shared';
import styles from './ChatLayout.module.css';

interface ChatLayoutProps {
  sessions: ChatSessionsList | null;
  activeSession: ChatSessionUpdate | null;
  activeSessionId?: string;
  extensionStatus: ExtensionStatus | null;
  isConnected: boolean;
  isPaired: boolean;
  hasPendingEdits: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onSendMessage: (text: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onContinue: () => void;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  sessions,
  activeSession,
  activeSessionId,
  extensionStatus,
  isConnected,
  isPaired,
  hasPendingEdits,
  onSelectSession,
  onNewSession,
  onSendMessage,
  onAcceptAll,
  onRejectAll,
  onContinue,
}) => {
  const [showSidebar, setShowSidebar] = useState(false);

  return (
    <div className={styles.container}>
      {/* Mobile Sidebar Toggle */}
      <button 
        className={styles.mobileToggle}
        onClick={() => setShowSidebar(!showSidebar)}
      >
        ☰
      </button>

      {/* Sidebar */}
      <div 
        className={`${styles.sidebar} ${showSidebar ? styles.sidebarOpen : styles.sidebarClosed}`}
      >
        <SessionList 
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            onSelectSession(id);
            setShowSidebar(false);
          }}
          onNewSession={onNewSession}
        />
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>
            {activeSessionId ? 'Chat' : 'Remote Pilot'}
          </h1>
          <StatusIndicator 
            isConnected={isConnected} 
            isPaired={isPaired} 
            extensionStatus={extensionStatus} 
          />
        </div>

        {/* Chat Area */}
        <div className={styles.chatArea}>
          <ChatView session={activeSession} />
        </div>

        {/* Input Area */}
        <ActionBar 
          onSendMessage={onSendMessage}
          onAcceptAll={onAcceptAll}
          onRejectAll={onRejectAll}
          onContinue={onContinue}
          hasPendingEdits={hasPendingEdits}
          disabled={!isConnected || !isPaired}
        />
      </div>

      {/* Overlay for mobile sidebar */}
      {showSidebar && (
        <div 
          className={styles.overlay}
          onClick={() => setShowSidebar(false)}
        />
      )}
    </div>
  );
};
