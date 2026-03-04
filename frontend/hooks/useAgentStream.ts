'use client';

import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import type { AgentLog, AgentRun } from '@/lib/api';

interface AgentStreamOptions {
  runId: string;
  maxLogs?: number;
}

export function useAgentStream({ runId, maxLogs = 500 }: AgentStreamOptions) {
  const { subscribe, unsubscribe, on, status } = useWebSocket();
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [runUpdate, setRunUpdate] = useState<Partial<AgentRun> | null>(null);
  const isSubscribed = useRef(false);

  useEffect(() => {
    if (status !== 'connected' || isSubscribed.current) return;

    const runChannel = `run:${runId}`;
    const logsChannel = `logs:${runId}`;

    subscribe(runChannel);
    subscribe(logsChannel);
    isSubscribed.current = true;

    const offRun = on(runChannel, (data) => {
      setRunUpdate(data as Partial<AgentRun>);
    });

    const offLogs = on(logsChannel, (data) => {
      setLogs((prev) => {
        const updated = [...prev, data as AgentLog];
        return updated.length > maxLogs ? updated.slice(-maxLogs) : updated;
      });
    });

    return () => {
      unsubscribe(runChannel);
      unsubscribe(logsChannel);
      offRun();
      offLogs();
      isSubscribed.current = false;
    };
  }, [runId, status, subscribe, unsubscribe, on, maxLogs]);

  const clearLogs = () => setLogs([]);

  return { logs, runUpdate, wsStatus: status, clearLogs };
}
