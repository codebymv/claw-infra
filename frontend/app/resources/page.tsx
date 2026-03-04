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
    <div className="space-y-6">
      {/* Live Gauges */}
      <SectionCard
        title="Live Metrics"
        description="Updated in real-time via WebSocket"
        action={
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse-slow" />
            Live
          </span>
        }
      >
        {displayLatest ? (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <GaugeChart
              value={displayLatest.cpuPercent}
              label="CPU Usage"
              color="#60a5fa"
            />
            <GaugeChart
              value={displayLatest.memoryPercent}
              label="Memory Usage"
              color="#34d399"
            />
            <div className="flex flex-col items-center justify-center space-y-1">
              <p className="text-2xl font-bold">{formatBytes(displayLatest.memoryMb)}</p>
              <p className="text-xs text-muted-foreground">Memory Used</p>
            </div>
            <div className="flex flex-col items-center justify-center space-y-1">
              <p className="text-2xl font-bold">{displayLatest.activeConnections}</p>
              <p className="text-xs text-muted-foreground">Active Connections</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No metrics data available — make sure agents are reporting resource snapshots
          </p>
        )}
      </SectionCard>

      {/* Resolution Picker + History */}
      <div className="flex items-center gap-2 mb-2">
        {RESOLUTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setResolution(value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              resolution === value
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground',
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

      {/* Per-Agent Resource Breakdown */}
      <SectionCard title="Usage by Agent" description="Average resource consumption per agent">
        {byAgent.length === 0 ? (
          <EmptyState message="No per-agent data available" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Agent</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Avg CPU</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Peak CPU</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Avg Memory</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Peak Memory</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((a) => (
                  <tr key={a.agentName} className="border-b border-border/40">
                    <td className="py-2 font-medium">{a.agentName}</td>
                    <td className="py-2 text-right tabular-nums">{parseFloat(a.avgCpu).toFixed(1)}%</td>
                    <td className="py-2 text-right tabular-nums">{parseFloat(a.peakCpu).toFixed(1)}%</td>
                    <td className="py-2 text-right tabular-nums">{formatBytes(parseFloat(a.avgMemoryMb))}</td>
                    <td className="py-2 text-right tabular-nums">{formatBytes(parseFloat(a.peakMemoryMb))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* I/O Stats */}
      {displayLatest && (
        <SectionCard title="Network & Disk I/O">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
    <div className="rounded-md bg-muted/30 border border-border p-3 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
