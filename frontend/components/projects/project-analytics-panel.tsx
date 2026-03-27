'use client';

import { useEffect, useState } from 'react';
import { X, TrendingUp, Clock, Users, BarChart3, AlertTriangle, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { projectsApi, type ProjectInsights } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ProjectAnalyticsPanelProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

export function ProjectAnalyticsPanel({ projectId, projectName, open, onClose }: ProjectAnalyticsPanelProps) {
  const [insights, setInsights] = useState<ProjectInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    if (open) {
      loadInsights();
    }
  }, [open, range]);

  const loadInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (range === '7d' ? 7 : range === '30d' ? 30 : 90));
      const res = await projectsApi.getInsights(projectId, {
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      });
      setInsights(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Analytics</h2>
              <p className="text-xs text-muted-foreground">{projectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['7d', '30d', '90d'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{error}</p>
              <button onClick={loadInsights} className="mt-2 text-xs text-primary hover:text-primary/80">Retry</button>
            </div>
          ) : insights ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
                  label="Completed"
                  value={String(insights.velocity.completedCards)}
                  sub="cards"
                />
                <StatCard
                  icon={<TrendingUp className="h-4 w-4 text-primary" />}
                  label="Throughput"
                  value={insights.velocity.throughput.toFixed(1)}
                  sub="cards/day"
                />
                <StatCard
                  icon={<Clock className="h-4 w-4 text-primary" />}
                  label="Cycle Time"
                  value={insights.velocity.cycleTime < 24
                    ? `${insights.velocity.cycleTime.toFixed(1)}h`
                    : `${(insights.velocity.cycleTime / 24).toFixed(1)}d`}
                  sub="avg"
                />
                <StatCard
                  icon={<Users className="h-4 w-4 text-primary" />}
                  label="Completion Rate"
                  value={`${insights.productivity.completionRate.toFixed(0)}%`}
                  sub={`${insights.productivity.completedCards}/${insights.productivity.totalCards}`}
                />
              </div>

              {/* Distribution Charts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DistributionCard title="By Status" data={insights.statusDistribution} colorMap={statusColors} />
                <DistributionCard title="By Priority" data={insights.priorityDistribution} colorMap={priorityColors} />
                <DistributionCard title="By Type" data={insights.typeDistribution} colorMap={typeColors} />
              </div>

              {/* Column Metrics */}
              {insights.columnMetrics.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/10 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-primary" />
                    Column Flow
                  </h3>
                  <div className="space-y-2">
                    {insights.columnMetrics.map(col => (
                      <div key={col.columnId} className="flex items-center gap-3">
                        <span className="text-xs font-medium w-24 truncate text-gray-700 dark:text-gray-300">{col.columnName}</span>
                        <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              col.bottleneckScore > 0.7 ? 'bg-red-500/70' : col.bottleneckScore > 0.4 ? 'bg-amber-500/70' : 'bg-primary/70'
                            )}
                            style={{ width: `${Math.min(100, (col.cardCount / Math.max(...insights.columnMetrics.map(c => c.cardCount), 1)) * 100)}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-foreground">
                            {col.cardCount} cards · {col.averageTimeInColumn < 24
                              ? `${col.averageTimeInColumn.toFixed(0)}h`
                              : `${(col.averageTimeInColumn / 24).toFixed(1)}d`} avg
                          </span>
                        </div>
                        {col.bottleneckScore > 0.7 && (
                          <span title="Potential bottleneck"><AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" /></span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Performers */}
              {insights.productivity.topPerformers.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/10 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Top Contributors
                  </h3>
                  <div className="space-y-2">
                    {insights.productivity.topPerformers.map((p, i) => (
                      <div key={p.userId} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}.</span>
                          <span className="font-medium text-gray-900 dark:text-white">{p.username}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{p.completedCards} done</span>
                          <span>{p.averageCompletionTime < 24
                            ? `${p.averageCompletionTime.toFixed(0)}h avg`
                            : `${(p.averageCompletionTime / 24).toFixed(1)}d avg`}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {insights.recommendations.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Recommendations</h3>
                  <ul className="space-y-1.5">
                    {insights.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Burndown Mini Chart */}
              {insights.velocity.burndownData.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/10 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Burndown</h3>
                  <div className="h-32 flex items-end gap-px">
                    {insights.velocity.burndownData.map((d, i) => {
                      const max = Math.max(...insights.velocity.burndownData.map(x => x.total), 1);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.remaining} remaining`}>
                          <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                            <div
                              className="w-full bg-primary/30 rounded-t-sm"
                              style={{ height: `${(d.remaining / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                    <span>{insights.velocity.burndownData[0]?.date?.slice(5)}</span>
                    <span>{insights.velocity.burndownData[insights.velocity.burndownData.length - 1]?.date?.slice(5)}</span>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

const statusColors: Record<string, string> = {
  open: 'bg-gray-400', in_progress: 'bg-emerald-500', review: 'bg-teal-500',
  done: 'bg-green-600', completed: 'bg-green-600', blocked: 'bg-red-500', cancelled: 'bg-gray-500',
};

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-green-500',
};

const typeColors: Record<string, string> = {
  task: 'bg-gray-500', feature: 'bg-emerald-500', bug: 'bg-red-500', epic: 'bg-teal-500', story: 'bg-green-500',
};

function DistributionCard({ title, data, colorMap }: { title: string; data: Record<string, number>; colorMap: Record<string, string> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="flex h-2 rounded-full overflow-hidden mb-2">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className={cn('h-full', colorMap[k] || 'bg-gray-400')}
            style={{ width: `${(v / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', colorMap[k] || 'bg-gray-400')} />
              <span className="text-gray-700 dark:text-gray-300 capitalize">{k.replace('_', ' ')}</span>
            </div>
            <span className="text-muted-foreground font-mono">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
