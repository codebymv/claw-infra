'use client';

import { useWebSocket, WsStatus } from '@/hooks/useWebSocket';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

const statusConfig: Record<WsStatus, { icon: React.ReactNode; text: string; color: string }> = {
  connecting: {
    icon: <RefreshCw className="h-4 w-4 animate-spin" />,
    text: 'Connecting...',
    color: 'text-yellow-500',
  },
  connected: {
    icon: <Wifi className="h-4 w-4" />,
    text: 'Connected',
    color: 'text-green-500',
  },
  disconnected: {
    icon: <WifiOff className="h-4 w-4" />,
    text: 'Disconnected',
    color: 'text-gray-500',
  },
  reconnecting: {
    icon: <RefreshCw className="h-4 w-4 animate-spin" />,
    text: 'Reconnecting...',
    color: 'text-yellow-500',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    text: 'Connection Error',
    color: 'text-red-500',
  },
  failed: {
    icon: <WifiOff className="h-4 w-4" />,
    text: 'Connection Failed',
    color: 'text-red-500',
  },
};

export function WebSocketStatus() {
  const { status, reconnectAttempt, reconnect } = useWebSocket();
  const config = statusConfig[status];

  // Don't show indicator when connected (clean UI)
  if (status === 'connected') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <div className={config.color}>{config.icon}</div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {config.text}
            </p>
            {status === 'reconnecting' && reconnectAttempt > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Attempt {reconnectAttempt} of 10
              </p>
            )}
            {status === 'failed' && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Maximum reconnection attempts reached
              </p>
            )}
          </div>
        </div>
        
        {(status === 'failed' || status === 'error') && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={reconnect}
              className="flex-1 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors"
            >
              Retry Connection
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Refresh Page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
