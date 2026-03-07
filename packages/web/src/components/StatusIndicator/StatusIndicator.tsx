import { ExtensionStatus } from '@remote-pilot/shared';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import styles from './StatusIndicator.module.css';

interface StatusIndicatorProps {
  isConnected: boolean;
  isPaired: boolean;
  extensionStatus: ExtensionStatus | null;
}

export const StatusIndicator = ({
  isConnected,
  isPaired,
  extensionStatus,
}: StatusIndicatorProps) => {
  const { t } = useTranslation();

  let statusClass = styles.statusDisconnected;
  let title = t('status.disconnected');

  if (isConnected && isPaired) {
    if (extensionStatus?.connected) {
      statusClass = styles.statusConnected;
      title = t('status.connectedToExtension');
    } else {
      statusClass = styles.statusWarning;
      title = t('status.webConnectedExtensionDisconnected');
    }
  } else if (isConnected) {
    statusClass = styles.statusWarning;
    title = t('status.webConnectedNotPaired');
  }

  return <div title={title} className={clsx(styles.indicator, statusClass)} />;
};
