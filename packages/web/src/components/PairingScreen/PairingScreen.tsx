import React, { useState } from 'react';
import styles from './PairingScreen.module.css';

interface PairingScreenProps {
  onPair: (code: string) => void;
  isConnecting: boolean;
  error?: string;
}

export const PairingScreen: React.FC<PairingScreenProps> = ({ onPair, isConnecting, error }) => {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      onPair(code);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>Remote Pilot</h1>
        
        <p className={styles.description}>
          Enter the 6-digit pairing code from your editor.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 6).toUpperCase())}
            placeholder="XXXXXX"
            className={styles.codeInput}
            maxLength={6}
            disabled={isConnecting}
            autoFocus
          />

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={code.length !== 6 || isConnecting}
            className={styles.submitButton}
          >
            {isConnecting ? 'CONNECTING...' : 'CONNECT'}
          </button>
        </form>
      </div>
    </div>
  );
};
