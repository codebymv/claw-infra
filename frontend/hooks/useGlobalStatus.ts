'use client';

import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import type { AgentRun, ResourceSnapshot } from '@/lib/api';

export function useGlobalStatus() {
  const { subscribe, unsubscribe, on, status } = useWebSocket();
  const [recentUpdates, setRecentUpdates] = useState<Partial<AgentRun>[]>([]);
  const [liveResources, setLiveResources] = useState<ResourceSnapshot | null>(null);
  const isSubscribed = useRef(false);

  useEffect(() => {
    if (status !== 'connected' || isSubscribed.current) return;

    subscribe('global:status');
    subscribe('resources:live');
    isSubscribed.current = true;

    const offStatus = on('global:status', (data) => {
      setRecentUpdates((prev) => {
        const updated = [data as Partial<AgentRun>, ...prev];
        return updated.slice(0, 50);
      });
    });

    const offResources = on('resources:live', (data) => {
      setLiveResources(data as ResourceSnapshot);
    });

    return () => {
      unsubscribe('global:status');
      unsubscribe('resources:live');
      offStatus();
      offResources();
      isSubscribed.current = false;
    };
  }, [status, subscribe, unsubscribe, on]);

  return { recentUpdates, liveResources, wsStatus: status };
}
