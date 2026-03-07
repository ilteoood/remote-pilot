import { ChatResponsePart } from '@remote-pilot/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolInvocation } from '../ToolInvocation/ToolInvocation';
import styles from './ResponsePart.module.css';

interface ResponsePartProps {
  part: ChatResponsePart;
}

export const ResponsePart: React.FC<ResponsePartProps> = ({ part }) => {
  const { t } = useTranslation();
  if (part.kind === 'markdown') {
    return (
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
      </div>
    );
  }

  if (part.kind === 'tool_invocation') {
    return <ToolInvocation part={part} />;
  }

  if (part.kind === 'text_edit') {
    const fileName = part.filePath?.split('/').pop() || part.content;
    return (
      <div className={styles.textEdit}>
        <span className={styles.textEditIcon}>✎</span>
        <span className={styles.textEditLabel}>{t('chatView.edited')}</span>
        <span className={styles.textEditFile} title={part.filePath}>
          {fileName}
        </span>
      </div>
    );
  }

  if (part.kind === 'code_citation') {
    return <div className={styles.citation}>Citation: {part.content}</div>;
  }

  return null;
};
