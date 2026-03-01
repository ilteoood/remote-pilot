import React from 'react';
import clsx from 'clsx';
import { ExtensionStatus } from '@remote-pilot/shared';
import styles from './StatusIndicator.module.css';

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
  let statusClass = styles.statusDisconnected;
  let title = 'Disconnected';

  if (isConnected && isPaired) {
    if (extensionStatus?.connected) {
      statusClass = styles.statusConnected;
      title = 'Connected to Extension';
    } else {
      statusClass = styles.statusWarning;
      title = 'Web Connected, Extension Disconnected';
    }
  } else if (isConnected) {
    statusClass = styles.statusWarning;
    title = 'Web Connected, Not Paired';
  }

  return (
    <div
      title={title}
      className={clsx(styles.indicator, statusClass)}
    />
  );
};
