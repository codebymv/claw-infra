import { io, Socket } from 'socket.io-client';

export interface SocketConfig {
  url: string;
  namespace?: string;
  auth?: Record<string, string>;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
}

export interface SocketManager {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
}

const DEFAULT_CONFIG: Partial<SocketConfig> = {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  timeout: 20000,
};

export function createSocketConnection(config: SocketConfig): SocketManager {
  let socket: Socket | null = null;
  let shouldReconnect = true;

  const getFullUrl = () => {
    const baseUrl = config.url.replace(/\/$/, '');
    return config.namespace ? `${baseUrl}/${config.namespace}` : baseUrl;
  };

  const connect = () => {
    if (socket?.connected) return socket;

    const fullUrl = getFullUrl();
    const socketConfig = { ...DEFAULT_CONFIG, ...config };

    socket = io(fullUrl, {
      auth: socketConfig.auth,
      reconnection: socketConfig.reconnection,
      reconnectionAttempts: socketConfig.reconnectionAttempts,
      reconnectionDelay: socketConfig.reconnectionDelay,
      reconnectionDelayMax: socketConfig.reconnectionDelayMax,
      timeout: socketConfig.timeout,
      transports: ['polling', 'websocket'],
    });

    return socket;
  };

  const disconnect = () => {
    shouldReconnect = false;
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  const isConnected = () => socket?.connected ?? false;

  return {
    socket,
    connect,
    disconnect,
    isConnected,
  };
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token') ||
    null
  );
}

export function getWebSocketUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000'
  );
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting' | 'failed';

export interface ConnectionState {
  status: WsStatus;
  reconnectAttempt: number;
  error: Error | null;
}