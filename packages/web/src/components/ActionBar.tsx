import React, { useState, KeyboardEvent } from 'react';

interface ActionBarProps {
  onSendMessage: (text: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onContinue: () => void;
  hasPendingEdits: boolean;
  disabled: boolean;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onSendMessage,
  onAcceptAll,
  onRejectAll,
  onContinue,
  hasPendingEdits,
  disabled,
}) => {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col gap-sm" style={{ 
      padding: 'var(--space-md)', 
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--bg-panel)' 
    }}>
      {hasPendingEdits && (
        <div className="flex justify-between gap-sm">
          <div className="flex gap-sm">
            <button
              onClick={onAcceptAll}
              disabled={disabled}
              style={{
                background: 'var(--accent-success)',
                color: '#000',
                padding: '8px 16px',
                borderRadius: '4px',
                fontWeight: 600,
                opacity: disabled ? 0.5 : 1
              }}
            >
              Accept All
            </button>
            <button
              onClick={onRejectAll}
              disabled={disabled}
              style={{
                background: 'var(--accent-error)',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '4px',
                fontWeight: 600,
                opacity: disabled ? 0.5 : 1
              }}
            >
              Reject All
            </button>
          </div>
          <button
            onClick={onContinue}
            disabled={disabled}
            style={{
              border: '1px solid var(--accent-primary)',
              color: 'var(--accent-primary)',
              padding: '8px 16px',
              borderRadius: '4px',
              opacity: disabled ? 0.5 : 1
            }}
          >
            Continue
          </button>
        </div>
      )}

      <div className="flex gap-sm items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Copilot..."
          disabled={disabled}
          className="grow"
          style={{
            padding: '12px',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          style={{
            background: 'var(--accent-primary)',
            color: '#000',
            padding: '12px 20px',
            borderRadius: '4px',
            fontWeight: 700,
            opacity: (!input.trim() || disabled) ? 0.5 : 1
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
};
