import { ChatResponsePart, ChatSessionUpdate } from '@remote-pilot/shared';
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight } from 'react-window';
import { MessageBubble } from '../MessageBubble/MessageBubble';
import styles from './ChatView.module.css';

type RowItem =
  | { type: 'user'; requestId: string; message: string }
  | { type: 'assistant'; requestId: string; parts: ChatResponsePart[]; isStreaming: boolean };

interface ChatRowProps {
  items: RowItem[];
}

const ChatRow = ({ index, style, ariaAttributes, items }: RowComponentProps<ChatRowProps>) => {
  const item = items[index];
  return (
    <div {...ariaAttributes} style={style} className={styles.row}>
      {item.type === 'user' ? (
        <MessageBubble userRole="user" content={item.message} />
      ) : (
        <MessageBubble userRole="assistant" parts={item.parts} />
      )}
    </div>
  );
};

interface ChatViewProps {
  session: ChatSessionUpdate | null;
}

export const ChatView: React.FC<ChatViewProps> = ({ session }) => {
  const { t } = useTranslation();
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 80, key: session?.sessionId });
  const listRef = useRef<ListImperativeAPI | null>(null);

  const rowProps = useMemo<{items: RowItem[]}>(() => {
    const items = session?.requests.flatMap((req) => {
      const rows: RowItem[] = [{ type: 'user', requestId: req.requestId, message: req.message }];
      if (req.responseParts.length > 0 || req.isStreaming) {
        rows.push({
          type: 'assistant',
          requestId: req.requestId,
          parts: req.responseParts,
          isStreaming: req.isStreaming,
        });
      }
      return rows;
    }) ?? [];
    return { items };
  }, [session]);

  useEffect(() => {
    if (rowProps.items.length > 0) {
      listRef.current?.scrollToRow({ index: rowProps.items.length - 1, align: 'end' });
    }
  }, [rowProps.items.length]);

  if (!session) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyContent}>
          <h3>{t('chatView.noSession')}</h3>
          <p>{t('chatView.selectOrStart')}</p>
        </div>
      </div>
    );
  }

  return (
    <List
      className={styles.container}
      rowComponent={ChatRow}
      rowCount={rowProps.items.length}
      rowHeight={dynamicRowHeight}
      rowProps={rowProps}
      listRef={listRef}
      style={{ height: '100%' }}
    />
  );
};
