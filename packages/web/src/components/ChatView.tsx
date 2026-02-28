import React, { useEffect, useRef } from 'react';
import { ChatSessionUpdate } from '@remote-pilot/shared';
import { MessageBubble } from './MessageBubble';

interface ChatViewProps {
  session: ChatSessionUpdate | null;
}

export const ChatView: React.FC<ChatViewProps> = ({ session }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.requests.length, session?.requests[session.requests.length - 1]?.responseParts.length]);

  if (!session) {
    return (
      <div className="flex justify-center items-center h-full text-dim">
        <div style={{ color: 'var(--text-dim)', textAlign: 'center' }}>
          <h3>No Session Selected</h3>
          <p>Select a chat or start a new one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full" style={{ overflowY: 'auto', padding: 'var(--space-md)' }}>
      {session.requests.map((req) => (
        <React.Fragment key={req.requestId}>
          <MessageBubble role="user" content={req.message} />
          {(req.responseParts.length > 0 || req.isStreaming) && (
            <MessageBubble role="assistant" parts={req.responseParts} />
          )}
        </React.Fragment>
      ))}
      <div ref={endRef} />
    </div>
  );
};
