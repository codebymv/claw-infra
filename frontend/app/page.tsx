'use client';

import { useEffect, useState } from 'react';
import { Bot, DollarSign, Activity, Zap, AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { PageLoader } from '@/components/shared/loading-spinner';
import { RunTimelineChart } from '@/components/charts/run-timeline-chart';
import { CostTrendChart } from '@/components/charts/cost-trend-chart';
import { agentsApi, costsApi, type AgentRun, type DashboardStats, type TimelinePoint, type CostTrendPoint } from '@/lib/api';
import { formatRelativeTime, formatDuration, formatCost } from '@/lib/utils';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [costTrend, setCostTrend] = useState<CostTrendPoint[]>([]);
  const [activeRuns, setActiveRuns] = useState<AgentRun[]>([]);
  const [costSummary, setCostSummary] = useState<{ totalCostUsd: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, timelineData, trendData, activeData, costData] = await Promise.all([
          agentsApi.getStats(),
          agentsApi.getTimeline(7),
          costsApi.getTrend(30),
          agentsApi.getActive(),
          costsApi.getSummary({ period: '1d' }),
        ]);
        setStats(statsData);
        setTimeline(timelineData);
        setCostTrend(trendData);
        setActiveRuns(activeData);
        setCostSummary(costData);
      } catch {
        // data loads silently; show zeros
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Runs Today"
          value={stats?.totalToday ?? 0}
          icon={Bot}
          accent="default"
        />
        <StatCard
          title="Active Agents"
          value={stats?.activeCount ?? 0}
          icon={Activity}
          accent="success"
          subtext="currently running or queued"
        />
        <StatCard
          title="Cost (24h)"
          value={formatCost(costSummary?.totalCostUsd)}
          icon={DollarSign}
          accent="warning"
        />
        <StatCard
          title="Avg Latency"
          value={formatDuration(stats?.avgLatencyMs)}
          icon={Zap}
          accent={stats?.recentFailed ? 'destructive' : 'default'}
          subtext={stats?.recentFailed ? `${stats.recentFailed} failed today` : 'no failures today'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Run Timeline" description="Last 7 days by status">
          {timeline.length > 0 ? (
            <RunTimelineChart data={timeline} />
          ) : (
            <EmptyChart message="No run data yet" />
          )}
        </SectionCard>

        <SectionCard title="Daily Spend" description="Last 30 days">
          {costTrend.length > 0 ? (
            <CostTrendChart data={costTrend} />
          ) : (
            <EmptyChart message="No cost data yet" />
          )}
        </SectionCard>
      </div>

      {/* Active Agents & Recent Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Active Agents"
          action={
            <Link href="/agents" className="text-xs text-primary hover:underline">
              View all
            </Link>
          }
        >
          {activeRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active agents</p>
          ) : (
            <div className="space-y-2">
              {activeRuns.slice(0, 8).map((run) => (
                <Link
                  key={run.id}
                  href={`/agents/${run.id}`}
                  className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={run.status} />
                    <span className="text-sm font-medium truncate">{run.agentName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {formatRelativeTime(run.startedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Alerts"
          action={
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              {stats?.recentFailed ?? 0} failures
            </span>
          }
        >
          {(stats?.recentFailed ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">All systems healthy</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-md bg-red-400/5 border border-red-400/20 p-3">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{stats?.recentFailed} agent(s) failed in the last 24h</p>
                  <p className="text-xs text-muted-foreground">
                    <Link href="/agents?status=failed" className="hover:underline text-primary">
                      View failed runs
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
