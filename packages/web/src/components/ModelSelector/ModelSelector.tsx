import type { AvailableModels, ModelInfo } from '@remote-pilot/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ModelSelector.module.css';

interface ModelSelectorProps {
  availableModels: AvailableModels | null;
  selectedModel?: ModelInfo;
  onSetModel: (modelIdentifier: string) => void;
  disabled: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  availableModels,
  selectedModel,
  onSetModel,
  disabled,
}) => {
  const { t } = useTranslation();
  const models = availableModels?.models ?? [];

  if (models.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>{t('modelSelector.label')}</span>
      <select
        className={styles.select}
        value={selectedModel?.identifier}
        onChange={(e) => onSetModel(e.target.value)}
        disabled={disabled}
      >
        {!selectedModel && <option value="">{t('modelSelector.select')}</option>}
        {models.map((model) => (
          <option key={model.identifier} value={model.identifier}>
            {model.name || model.identifier}
          </option>
        ))}
      </select>
    </div>
  );
};
