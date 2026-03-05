'use client';

import { useEffect, useState } from 'react';
import { Bot, DollarSign, Activity, Zap, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { PageLoader } from '@/components/shared/loading-spinner';
import { LastUpdated } from '@/components/shared/last-updated';
import { RunTimelineChart } from '@/components/charts/run-timeline-chart';
import { CostTrendChart } from '@/components/charts/cost-trend-chart';
import { agentsApi, costsApi, type AgentRun, type DashboardStats, type TimelinePoint, type CostTrendPoint } from '@/lib/api';
import { formatRelativeTime, formatDuration, formatCost } from '@/lib/utils';
import { useAppToast } from '@/components/layout/app-shell';
import { useDynamicTitle } from '@/hooks/useDynamicTitle';
import Link from 'next/link';

export default function DashboardPage() {
  useDynamicTitle('Dashboard | ClawInfra');

  const toast = useAppToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [costTrend, setCostTrend] = useState<CostTrendPoint[]>([]);
  const [activeRuns, setActiveRuns] = useState<AgentRun[]>([]);
  const [costSummary, setCostSummary] = useState<{ totalCostUsd: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

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
        setLastRefreshed(new Date());
      } catch (err) {
        toast.error((err as Error).message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 animate-stagger">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Run Timeline"
          description="Last 7 days by status"
          action={<LastUpdated at={lastRefreshed} />}
        >
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

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Active Agents"
          action={
            <Link
              href="/agents"
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View all
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
        >
          {activeRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-[13px] text-muted-foreground">No active agents</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activeRuns.slice(0, 8).map((run) => (
                <Link
                  key={run.id}
                  href={`/agents/${run.id}`}
                  className="flex items-center justify-between rounded-lg p-2.5 hover:bg-accent transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={run.status} />
                    <span className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">
                      {run.agentName}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-2">
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
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {stats?.recentFailed ?? 0} failures
            </span>
          }
        >
          {(stats?.recentFailed ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
                <Activity className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <p className="text-[13px] text-muted-foreground">All systems healthy</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg bg-rose-500/5 border border-rose-500/15 p-4">
                <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-[13px] font-medium">
                    {stats?.recentFailed} agent(s) failed in the last 24h
                  </p>
                  <Link
                    href="/agents?status=failed"
                    className="text-[11px] text-primary hover:underline mt-0.5 inline-block"
                  >
                    View failed runs
                  </Link>
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
    <div className="flex h-60 items-center justify-center">
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </div>
  );
}
