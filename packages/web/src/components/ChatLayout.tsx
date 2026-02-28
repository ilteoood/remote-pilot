import React, { useState } from 'react';
import { SessionList } from './SessionList';
import { ChatView } from './ChatView';
import { ActionBar } from './ActionBar';
import { StatusIndicator } from './StatusIndicator';
import { ChatSessionUpdate, ChatSessionsList, ExtensionStatus } from '@remote-pilot/shared';

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
    <div className="flex h-full w-full relative">
      {/* Mobile Sidebar Toggle */}
      <button 
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setShowSidebar(!showSidebar)}
        style={{
          background: 'var(--bg-panel)',
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid var(--border-subtle)'
        }}
      >
        ☰
      </button>

      {/* Sidebar */}
      <div 
        className={`h-full absolute md:relative z-40 transition-transform transform ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ background: 'var(--bg-dark)' }}
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
      <div className="flex flex-col grow h-full relative" style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div className="flex justify-between items-center" style={{
          padding: 'var(--space-md)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel)'
        }}>
          <h1 style={{ fontSize: '16px', marginLeft: '40px' }}>
            {activeSessionId ? 'Chat' : 'Remote Pilot'}
          </h1>
          <StatusIndicator 
            isConnected={isConnected} 
            isPaired={isPaired} 
            extensionStatus={extensionStatus} 
          />
        </div>

        {/* Chat Area */}
        <div className="grow" style={{ overflow: 'hidden' }}>
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
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}
    </div>
  );
};
