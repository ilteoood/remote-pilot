import { ChatResponsePart } from '@remote-pilot/shared';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolInvocation } from '../ToolInvocation/ToolInvocation';
import styles from './ResponsePart.module.css';

interface ResponsePartProps {
  part: ChatResponsePart;
}

export const ResponsePart: React.FC<ResponsePartProps> = ({ part }) => {
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

  if (part.kind === 'code_citation') {
    return <div className={styles.citation}>Citation: {part.content}</div>;
  }

  return null;
};
