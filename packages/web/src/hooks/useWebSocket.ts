import {
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
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);
  const [sessionsList, setSessionsList] = useState<ChatSessionsList | null>(null);
  // Cache session data keyed by sessionId so switching sessions is instant
  const [sessionDataMap, setSessionDataMap] = useState<Record<string, ChatSessionUpdate>>({});

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
      switch (message.type) {
        case 'pair_response': {
          const data = message.data as WsMessageDataMap['pair_response'];
          if (data.success) {
            setIsPaired(true);
            if (data.token) {
              sessionStorage.setItem('auth_token', data.token);
            }
            send('request_sessions_list', {});
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
        case 'chat_session_update': {
          const update = message.data as ChatSessionUpdate;
          setSessionDataMap((prev) => ({
            ...prev,
            [update.sessionId]: update,
          }));
          break;
        }
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
    const storedToken = sessionStorage.getItem('auth_token');

    // If we have a stored token, pass it in the URL so the server auto-pairs us
    let wsUrl = `ws://${window.location.hostname}:${port}?role=web`;
    if (storedToken) {
      wsUrl += `&token=${encodeURIComponent(storedToken)}`;
    }

    console.log(`Connecting to ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectDelayRef.current = RECONNECT_DELAY_START;

      if (storedToken) {
        // We connected with a token and the server accepted us (didn't close),
        // so we're already paired. Request sessions immediately.
        setIsPaired(true);
        const sessionsMsg = createMessage('request_sessions_list', {});
        ws.send(JSON.stringify(sessionsMsg));
      } else {
        // No token – try to re-pair with stored pairing code
        const storedCode = sessionStorage.getItem('pairing_code');
        if (storedCode) {
          const pairMsg = createMessage('pair_request', { pairingCode: storedCode });
          ws.send(JSON.stringify(pairMsg));
        }
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

    ws.onclose = (event) => {
      console.log('WebSocket closed', event);
      setIsConnected(false);
      setIsPaired(false);
      socketRef.current = null;

      // If the server rejected our token (1008), clear it
      if (event.code === 1008 && storedToken) {
        sessionStorage.removeItem('auth_token');
      }

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
  }, [handleMessage]);

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
    extensionStatus,
    sessionsList,
    sessionDataMap,
    send,
  };
}
