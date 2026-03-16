'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ChatSocketMessage {
  content: string;
  type: 'message' | 'command';
  projectId?: string;
  metadata?: Record<string, any>;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseChatSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  sendMessage: (message: ChatSocketMessage) => Promise<void>;
  startTyping: () => void;
  stopTyping: () => void;
  disconnect: () => void;
}

export function useChatSocket(): UseChatSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Get auth token from localStorage or wherever it's stored
  const getAuthToken = useCallback(() => {
    // This should match your authentication implementation
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  }, []);

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    const token = getAuthToken();
    
    if (!token) {
      console.warn('No auth token found, cannot connect to chat socket');
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');

    // Create socket connection
    const newSocket = io('/chat', {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: false, // We'll handle reconnection manually
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Chat socket connected');
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Chat socket disconnected:', reason);
      setIsConnected(false);
      setConnectionStatus('disconnected');
      
      // Attempt reconnection if not manually disconnected
      if (reason !== 'io client disconnect') {
        attemptReconnection();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Chat socket connection error:', error);
      setIsConnected(false);
      setConnectionStatus('disconnected');
      attemptReconnection();
    });

    newSocket.on('error', (error) => {
      console.error('Chat socket error:', error);
    });

    setSocket(newSocket);

    return newSocket;
  }, [getAuthToken]);

  // Attempt reconnection with exponential backoff
  const attemptReconnection = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
    reconnectAttemptsRef.current += 1;

    console.log(`Attempting reconnection ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms`);
    
    setConnectionStatus('connecting');

    reconnectTimeoutRef.current = setTimeout(() => {
      initializeSocket();
    }, delay);
  }, [initializeSocket]);

  // Send message
  const sendMessage = useCallback(async (message: ChatSocketMessage): Promise<void> => {
    if (!socket || !isConnected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      socket.emit('send_message', message, (response: any) => {
        if (response.status === 'ok') {
          resolve();
        } else {
          reject(new Error(response.message || 'Failed to send message'));
        }
      });
    });
  }, [socket, isConnected]);

  // Start typing indicator
  const startTyping = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('typing_start');
    }
  }, [socket, isConnected]);

  // Stop typing indicator
  const stopTyping = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('typing_stop');
    }
  }, [socket, isConnected]);

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    reconnectAttemptsRef.current = 0;
  }, [socket]);

  // Initialize socket on mount
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      initializeSocket();
    }

    return () => {
      disconnect();
    };
  }, [initializeSocket, disconnect, getAuthToken]);

  // Handle auth token changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token' || e.key === null) {
        const token = getAuthToken();
        if (token && !socket) {
          initializeSocket();
        } else if (!token && socket) {
          disconnect();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [socket, initializeSocket, disconnect, getAuthToken]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isConnected) {
        const token = getAuthToken();
        if (token) {
          initializeSocket();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, initializeSocket, getAuthToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    socket,
    isConnected,
    connectionStatus,
    sendMessage,
    startTyping,
    stopTyping,
    disconnect,
  };
}