'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getWebSocketUrl, getAuthToken, type WsStatus } from './socket-utils';

let globalSocket: Socket | null = null;
let connectionCount = 0;

function getSocket(): Socket | null {
  const wsUrl = getWebSocketUrl();
  const token = getAuthToken();
  
  if (!token) return null;
  
  if (!globalSocket || !globalSocket.connected) {
    globalSocket = io(wsUrl, {
      auth: token ? { token } : {},
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });
  }
  return globalSocket;
}

export type { WsStatus };

export function useWebSocket() {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    const socket = getSocket();
    if (!socket) {
      if (isMountedRef.current) {
        setStatus('disconnected');
      }
      return;
    }
    
    socketRef.current = socket;
    connectionCount++;

    const onConnect = () => {
      if (isMountedRef.current) {
        setStatus('connected');
        setReconnectAttempt(0);
      }
    };

    const onDisconnect = (reason: string) => {
      if (!isMountedRef.current) return;
      if (reason === 'io client disconnect') {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
    };

    const onReconnectAttempt = (attemptNumber: number) => {
      if (isMountedRef.current) {
        setStatus('reconnecting');
        setReconnectAttempt(attemptNumber);
      }
    };

    const onReconnectError = () => {
      if (isMountedRef.current) {
        setStatus('error');
      }
    };

    const onReconnectFailed = () => {
      if (isMountedRef.current) {
        setStatus('failed');
      }
    };

    const onError = () => {
      if (isMountedRef.current) {
        setStatus('error');
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('reconnect_error', onReconnectError);
    socket.on('reconnect_failed', onReconnectFailed);
    socket.on('connect_error', onError);

    if (socket.connected && isMountedRef.current) {
      setStatus('connected');
    }

    return () => {
      isMountedRef.current = false;
      connectionCount--;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('reconnect_error', onReconnectError);
      socket.off('reconnect_failed', onReconnectFailed);
      socket.off('connect_error', onError);
      if (connectionCount === 0 && globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
      }
    };
  }, []);

  const subscribe = useCallback((channel: string) => {
    socketRef.current?.emit('subscribe', { channel });
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    socketRef.current?.emit('unsubscribe', { channel });
  }, []);

  const on = useCallback((event: string, handler: (data: unknown) => void) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  const reconnect = useCallback(() => {
    socketRef.current?.connect();
    setStatus('connecting');
    setReconnectAttempt(0);
  }, []);

  return {
    socket: socketRef,
    status,
    reconnectAttempt,
    subscribe,
    unsubscribe,
    on,
    reconnect,
  };
}
