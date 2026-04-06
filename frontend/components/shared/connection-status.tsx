'use client';

import { useWebSocket, type WsStatus } from '@/hooks/useWebSocket';

interface ConnectionStatusProps {
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<WsStatus, { color: string; label: string; pulse: boolean }> = {
  connected: { color: 'bg-emerald-500', label: 'Connected', pulse: false },
  connecting: { color: 'bg-amber-500', label: 'Connecting...', pulse: true },
  reconnecting: { color: 'bg-amber-500', label: 'Reconnecting...', pulse: true },
  disconnected: { color: 'bg-gray-500', label: 'Disconnected', pulse: false },
  error: { color: 'bg-red-500', label: 'Error', pulse: false },
  failed: { color: 'bg-red-500', label: 'Failed', pulse: false },
};

export function ConnectionStatus({ showLabel = false, className = '' }: ConnectionStatusProps) {
  const { status, reconnectAttempt } = useWebSocket();
  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex items-center justify-center">
        <span
          className={`h-2 w-2 rounded-full ${config.color} ${
            config.pulse ? 'animate-pulse' : ''
          }`}
        />
        {status === 'connecting' || status === 'reconnecting' ? (
          <span className="absolute inset-0 h-2 w-2 rounded-full bg-amber-500/30 animate-ping" />
        ) : null}
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {config.label}
          {status === 'reconnecting' && reconnectAttempt > 0 && ` (${reconnectAttempt})`}
        </span>
      )}
    </div>
  );
}