import React, { useState } from 'react';

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
    <div className="flex justify-center items-center h-full w-full bg-dark">
      <div style={{
        padding: 'var(--space-xl)',
        background: 'var(--bg-panel)',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center'
      }}>
        <h1 style={{ marginBottom: 'var(--space-lg)', color: 'var(--accent-primary)' }}>Remote Pilot</h1>
        
        <p style={{ marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
          Enter the 6-digit pairing code from your editor.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 6).toUpperCase())}
            placeholder="XXXXXX"
            style={{
              fontSize: '24px',
              textAlign: 'center',
              letterSpacing: '4px',
              padding: '12px',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)'
            }}
            maxLength={6}
            disabled={isConnecting}
            autoFocus
          />

          {error && (
            <div style={{ color: 'var(--accent-error)', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={code.length !== 6 || isConnecting}
            style={{
              background: 'var(--accent-primary)',
              color: '#000',
              padding: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              opacity: (code.length !== 6 || isConnecting) ? 0.5 : 1
            }}
          >
            {isConnecting ? 'CONNECTING...' : 'CONNECT'}
          </button>
        </form>
      </div>
    </div>
  );
};
