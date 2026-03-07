import type { AvailableModels, ModelInfo } from '@remote-pilot/shared';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ModelSelector.module.css';

interface ModelSelectorProps {
  availableModels: AvailableModels | null;
  selectedModel?: ModelInfo;
  onSetModel: (modelIdentifier: ModelInfo) => void;
  disabled: boolean;
}

export const ModelSelector = ({
  availableModels,
  selectedModel,
  onSetModel,
  disabled,
}: ModelSelectorProps) => {
  const { t } = useTranslation();
  const models = availableModels?.models ?? [];
  const [identifier, setIdentifier] = useState<string | undefined>(selectedModel?.identifier);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = models.find((m) => m.identifier === e.target.value);
      if (model) {
        onSetModel(model);
        setIdentifier(model.identifier);
      }
    },
    [onSetModel, models],
  );

  if (models.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>{t('modelSelector.label')}</span>
      <select
        className={styles.select}
        value={identifier}
        onChange={onChange}
        disabled={disabled}
      >
        {!selectedModel && <option value="">{t('modelSelector.select')}</option>}
        {models.map((model) => (
          <option key={model.id} value={model.identifier}>
            {model.name || model.id}
          </option>
        ))}
      </select>
    </div>
  );
};
