import {
  ChatEditingState,
  ChatSessionsList,
  ChatSessionUpdate,
  createMessage,
  ExtensionStatus,
  WsMessage,
  WsMessageDataMap,
  WsMessageType,
} from '@remote-pilot/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

const RECONNECT_DELAY_START = 1000;
const RECONNECT_DELAY_MAX = 30000;

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_START);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);
  const [sessionsList, setSessionsList] = useState<ChatSessionsList | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSessionUpdate | null>(null);
  const [editingState, setEditingState] = useState<ChatEditingState | null>(null);

  const send = useCallback(<T extends WsMessageType>(type: T, data: WsMessageDataMap[T]) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const message = createMessage(type, data);
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message, socket not open');
    }
  }, []);

  const handleMessage = useCallback(
    (message: WsMessage) => {
      setLastMessage(message);

      switch (message.type) {
        case 'pair_response': {
          const data = message.data as WsMessageDataMap['pair_response'];
          if (data.success) {
            setIsPaired(true);
            if (data.token) {
              sessionStorage.setItem('auth_token', data.token);
            }
          } else {
            console.error('Pairing failed:', data.error);
            setIsPaired(false);
            sessionStorage.removeItem('auth_token');
          }
          break;
        }
        case 'extension_status':
          setExtensionStatus(message.data as ExtensionStatus);
          break;
        case 'chat_sessions_list':
          setSessionsList(message.data as ChatSessionsList);
          break;
        case 'chat_session_update':
          setActiveSession(message.data as ChatSessionUpdate);
          break;
        case 'chat_editing_state':
          setEditingState(message.data as ChatEditingState);
          break;
        case 'ping':
          send('pong', {});
          break;
      }
    },
    [send],
  );

  const connect = useCallback(() => {
    // Clear any existing reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    const port = window.location.port || '3847';
    const wsUrl = `ws://${window.location.hostname}:${port}?role=web`;

    console.log(`Connecting to ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectDelayRef.current = RECONNECT_DELAY_START;

      // Try to re-pair if we have a token or code
      const storedCode = sessionStorage.getItem('pairing_code');
      const storedToken = sessionStorage.getItem('auth_token');

      if (storedToken) {
        // We don't have a specific "auth with token" message yet in the protocol based on the shared types provided.
        // The PairRequest only takes a pairingCode.
        // If the server expects a token, we might need to adjust, but for now let's assume we re-send the pairing code if we have it,
        // or wait for the user to enter it.
        // Actually, looking at the types, PairResponse returns a token.
        // If the protocol requires sending the token on connect, it might be in the query params or a specific message.
        // Assuming for now we just need to re-pair with the code if we have it.
        if (storedCode) {
          send('pair_request', { pairingCode: storedCode });
        }
      } else if (storedCode) {
        send('pair_request', { pairingCode: storedCode });
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
      setIsPaired(false);
      socketRef.current = null;

      // Schedule reconnect
      const delay = reconnectDelayRef.current;
      console.log(`Reconnecting in ${delay}ms...`);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectDelayRef.current = Math.min(delay * 1.5, RECONNECT_DELAY_MAX);
        connect();
      }, delay);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    };
  }, [handleMessage, send]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    isPaired,
    lastMessage,
    extensionStatus,
    sessionsList,
    activeSession,
    editingState,
    send,
  };
}
