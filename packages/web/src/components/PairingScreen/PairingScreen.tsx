import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PairingScreen.module.css';

interface PairingScreenProps {
  onPair: (code: string) => void;
  isConnecting: boolean;
  error?: string;
}

const CODE_LENGTH = 6;

export const PairingScreen: React.FC<PairingScreenProps> = ({ onPair, isConnecting, error }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === CODE_LENGTH) {
      onPair(code);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('pairing.title')}</h1>

        <p className={styles.description}>{t('pairing.description')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, CODE_LENGTH).toUpperCase())}
            placeholder={t('pairing.placeholder')}
            className={styles.codeInput}
            maxLength={CODE_LENGTH}
            disabled={isConnecting}
          />

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={code.length !== CODE_LENGTH || isConnecting}
            className={styles.submitButton}
          >
            {isConnecting ? t('pairing.connecting') : t('pairing.connect')}
          </button>
        </form>
      </div>
    </div>
  );
};
