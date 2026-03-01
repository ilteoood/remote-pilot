import React, { useState, KeyboardEvent } from 'react';
import styles from './ActionBar.module.css';

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
    <div className={`flex flex-col gap-sm ${styles.container}`}>
      {hasPendingEdits && (
        <div className={styles.editActions}>
          <div className={styles.editButtons}>
            <button
              onClick={onAcceptAll}
              disabled={disabled}
              className={`${styles.acceptButton} ${disabled ? styles.disabled : ''}`}
            >
              Accept All
            </button>
            <button
              onClick={onRejectAll}
              disabled={disabled}
              className={`${styles.rejectButton} ${disabled ? styles.disabled : ''}`}
            >
              Reject All
            </button>
          </div>
          <button
            onClick={onContinue}
            disabled={disabled}
            className={`${styles.continueButton} ${disabled ? styles.disabled : ''}`}
          >
            Continue
          </button>
        </div>
      )}

      <div className={styles.inputContainer}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Copilot..."
          disabled={disabled}
          className={`grow ${styles.messageInput}`}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className={`${styles.sendButton} ${(!input.trim() || disabled) ? styles.disabled : ''}`}
        >
          SEND
        </button>
      </div>
    </div>
  );
};
