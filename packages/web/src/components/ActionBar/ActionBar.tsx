import clsx from 'clsx';
import { KeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  onSendMessage: (text: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onContinue: () => void;
  hasPendingEdits: boolean;
  disabled: boolean;
}

export const ActionBar = ({
  onSendMessage,
  onAcceptAll,
  onRejectAll,
  onContinue,
  hasPendingEdits,
  disabled,
}: ActionBarProps) => {
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
              type="button"
              onClick={onAcceptAll}
              disabled={disabled}
              className={clsx(styles.acceptButton, disabled && styles.disabled)}
            >
              {t('actionBar.acceptAll')}
            </button>
            <button
              type="button"
              onClick={onRejectAll}
              disabled={disabled}
              className={clsx(styles.rejectButton, disabled && styles.disabled)}
            >
              {t('actionBar.rejectAll')}
            </button>
          </div>
          <button
            type="button"
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
          type="button"
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
