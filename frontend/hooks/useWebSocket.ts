'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

let globalSocket: Socket | null = null;
let connectionCount = 0;

function getSocket(): Socket {
  if (!globalSocket || !globalSocket.connected) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    globalSocket = io(WS_URL, {
      auth: token ? { token } : {},
      // Reconnection configuration with exponential backoff
      reconnection: true,
      reconnectionAttempts: 10, // Max 10 attempts before giving up
      reconnectionDelay: 1000, // Initial delay: 1 second
      reconnectionDelayMax: 10000, // Max delay: 10 seconds
      randomizationFactor: 0.5, // Randomization to prevent thundering herd
      timeout: 20000, // Connection timeout
    });
  }
  return globalSocket;
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting' | 'failed';

export function useWebSocket() {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    connectionCount++;

    const onConnect = () => {
      setStatus('connected');
      setReconnectAttempt(0);
    };
    
    const onDisconnect = (reason: string) => {
      // Don't show reconnecting if it was an intentional disconnect
      if (reason === 'io client disconnect') {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
    };
    
    const onReconnectAttempt = (attemptNumber: number) => {
      setStatus('reconnecting');
      setReconnectAttempt(attemptNumber);
    };
    
    const onReconnectError = () => {
      setStatus('error');
    };
    
    const onReconnectFailed = () => {
      setStatus('failed');
    };
    
    const onError = () => {
      setStatus('error');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('reconnect_error', onReconnectError);
    socket.on('reconnect_failed', onReconnectFailed);
    socket.on('connect_error', onError);

    if (socket.connected) setStatus('connected');

    return () => {
      connectionCount--;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('reconnect_error', onReconnectError);
      socket.off('reconnect_failed', onReconnectFailed);
      socket.off('connect_error', onError);
      if (connectionCount === 0) {
        socket.disconnect();
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
