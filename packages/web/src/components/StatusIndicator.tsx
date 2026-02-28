import React from 'react';
import { ExtensionStatus } from '@remote-pilot/shared';

interface StatusIndicatorProps {
  isConnected: boolean;
  isPaired: boolean;
  extensionStatus: ExtensionStatus | null;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  isConnected,
  isPaired,
  extensionStatus,
}) => {
  let color = 'var(--accent-error)';
  let title = 'Disconnected';

  if (isConnected && isPaired) {
    if (extensionStatus?.connected) {
      color = 'var(--accent-success)';
      title = 'Connected to Extension';
    } else {
      color = 'var(--accent-warning)';
      title = 'Web Connected, Extension Disconnected';
    }
  } else if (isConnected) {
    color = 'var(--accent-warning)';
    title = 'Web Connected, Not Paired';
  }

  return (
    <div
      title={title}
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 5px ${color}`,
        transition: 'background-color 0.3s ease',
      }}
    />
  );
};
