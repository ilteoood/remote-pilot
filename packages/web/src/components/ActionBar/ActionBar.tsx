import React, { useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
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
  const { t } = useTranslation();
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
    <div className={clsx('flex flex-col gap-sm', styles.container)}>
      {hasPendingEdits && (
        <div className={styles.editActions}>
          <div className={styles.editButtons}>
            <button
              onClick={onAcceptAll}
              disabled={disabled}
              className={clsx(styles.acceptButton, disabled && styles.disabled)}
            >
              {t('actionBar.acceptAll')}
            </button>
            <button
              onClick={onRejectAll}
              disabled={disabled}
              className={clsx(styles.rejectButton, disabled && styles.disabled)}
            >
              {t('actionBar.rejectAll')}
            </button>
          </div>
          <button
            onClick={onContinue}
            disabled={disabled}
            className={clsx(styles.continueButton, disabled && styles.disabled)}
          >
            {t('actionBar.continue')}
          </button>
        </div>
      )}

      <div className={styles.inputContainer}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('actionBar.placeholder')}
          disabled={disabled}
          className={clsx('grow', styles.messageInput)}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className={clsx(styles.sendButton, (!input.trim() || disabled) && styles.disabled)}
        >
          {t('actionBar.send')}
        </button>
      </div>
    </div>
  );
};
