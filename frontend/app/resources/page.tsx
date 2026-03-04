'use client';

import { useEffect, useState, useCallback } from 'react';
import { SectionCard } from '@/components/shared/section-card';
import { PageLoader } from '@/components/shared/loading-spinner';
import { ResourceHistoryChart, GaugeChart } from '@/components/charts/resource-chart';
import { metricsApi, type ResourceSnapshot, type MetricsHistory, type AgentMetrics } from '@/lib/api';
import { formatBytes, cn } from '@/lib/utils';
import { useGlobalStatus } from '@/hooks/useGlobalStatus';

type Resolution = '1h' | '6h' | '24h' | '7d';
const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];

export default function ResourcesPage() {
  const [resolution, setResolution] = useState<Resolution>('1h');
  const [latest, setLatest] = useState<ResourceSnapshot | null>(null);
  const [history, setHistory] = useState<MetricsHistory[]>([]);
  const [byAgent, setByAgent] = useState<AgentMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const { liveResources } = useGlobalStatus();

  const load = useCallback(async () => {
    try {
      const [l, h, a] = await Promise.all([
        metricsApi.getLatest(),
        metricsApi.getHistory(resolution),
        metricsApi.getByAgent(),
      ]);
      setLatest(l);
      setHistory(h);
      setByAgent(a);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [resolution]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const displayLatest = liveResources || latest;

  if (loading && !latest) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionCard
        title="Live Metrics"
        description="Updated in real-time via WebSocket"
        action={
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-slow" />
            Live
          </span>
        }
      >
        {displayLatest ? (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <GaugeChart
              value={displayLatest.cpuPercent}
              label="CPU Usage"
              color="#00dc82"
            />
            <GaugeChart
              value={displayLatest.memoryPercent}
              label="Memory Usage"
              color="#38bdf8"
            />
            <div className="flex flex-col items-center justify-center space-y-1.5">
              <p className="font-display text-2xl font-bold">{formatBytes(displayLatest.memoryMb)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
                Memory Used
              </p>
            </div>
            <div className="flex flex-col items-center justify-center space-y-1.5">
              <p className="font-display text-2xl font-bold">{displayLatest.activeConnections}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
                Active Connections
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <p className="text-[13px] text-muted-foreground/50">
              No metrics data available
            </p>
            <p className="text-[11px] text-muted-foreground/30">
              Make sure agents are reporting resource snapshots
            </p>
          </div>
        )}
      </SectionCard>

      <div className="flex items-center gap-1.5">
        {RESOLUTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setResolution(value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-all duration-200',
              resolution === value
                ? 'bg-primary/15 text-primary border border-primary/20'
                : 'bg-card/60 border border-border/40 text-muted-foreground/60 hover:text-foreground hover:border-border',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="CPU History" description={`Last ${resolution}`}>
          {history.length > 0 ? (
            <ResourceHistoryChart data={history} metric="cpu" />
          ) : (
            <EmptyState message="No CPU history" />
          )}
        </SectionCard>
        <SectionCard title="Memory History" description={`Last ${resolution}`}>
          {history.length > 0 ? (
            <ResourceHistoryChart data={history} metric="memory" />
          ) : (
            <EmptyState message="No memory history" />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Usage by Agent" description="Average resource consumption per agent">
        {byAgent.length === 0 ? (
          <EmptyState message="No per-agent data available" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Agent</th>
                  <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Avg CPU</th>
                  <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Peak CPU</th>
                  <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Avg Memory</th>
                  <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Peak Memory</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((a) => (
                  <tr key={a.agentName} className="border-b border-border/15">
                    <td className="py-2.5 font-medium">{a.agentName}</td>
                    <td className="py-2.5 text-right tabular-nums font-mono text-[12px]">
                      {parseFloat(a.avgCpu).toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-mono text-[12px]">
                      {parseFloat(a.peakCpu).toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-mono text-[12px]">
                      {formatBytes(parseFloat(a.avgMemoryMb))}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-mono text-[12px]">
                      {formatBytes(parseFloat(a.peakMemoryMb))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {displayLatest && (
        <SectionCard title="Network & Disk I/O">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile label="Network In" value={formatBytes(displayLatest.networkInMb)} />
            <MetricTile label="Network Out" value={formatBytes(displayLatest.networkOutMb)} />
            <MetricTile label="Disk Read" value={formatBytes(displayLatest.diskIoReadMb)} />
            <MetricTile label="Disk Write" value={formatBytes(displayLatest.diskIoWriteMb)} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/20 border border-border/30 p-4 text-center">
      <p className="font-display text-lg font-bold">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 mt-1">
        {label}
      </p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center">
      <p className="text-[13px] text-muted-foreground/40">{message}</p>
    </div>
  );
}
