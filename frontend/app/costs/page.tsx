'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, DollarSign, Zap, BarChart2 } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { SectionCard } from '@/components/shared/section-card';
import { PageLoader } from '@/components/shared/loading-spinner';
import { CostTrendChart } from '@/components/charts/cost-trend-chart';
import { CostByModelChart, CostByAgentChart } from '@/components/charts/cost-breakdown-chart';
import {
  costsApi,
  type CostSummary,
  type CostByModel,
  type CostByAgent,
  type CostTrendPoint,
  type BudgetStatus,
  type ProjectedSpend,
  type TopRun,
} from '@/lib/api';
import { formatCost, formatTokens, cn } from '@/lib/utils';
import Link from 'next/link';

type Period = '1d' | '7d' | '30d';
const PERIODS: { value: Period; label: string }[] = [
  { value: '1d', label: '24h' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

export default function CostsPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [byModel, setByModel] = useState<CostByModel[]>([]);
  const [byAgent, setByAgent] = useState<CostByAgent[]>([]);
  const [trend, setTrend] = useState<CostTrendPoint[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus[]>([]);
  const [projected, setProjected] = useState<ProjectedSpend | null>(null);
  const [topRuns, setTopRuns] = useState<TopRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { period };
    try {
      const [s, bm, ba, t, bs, pr, tr] = await Promise.all([
        costsApi.getSummary(params),
        costsApi.getByModel(params),
        costsApi.getByAgent(params),
        costsApi.getTrend(30),
        costsApi.getBudgetStatus(),
        costsApi.getProjected(),
        costsApi.getTopRuns(params),
      ]);
      setSummary(s);
      setByModel(bm);
      setByAgent(ba);
      setTrend(t);
      setBudgetStatus(bs);
      setProjected(pr);
      setTopRuns(tr);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !summary) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-1.5">
        {PERIODS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-[12px] font-semibold tracking-wide transition-all duration-200',
              period === value
                ? 'bg-primary/15 text-primary border border-primary/20'
                : 'bg-card/60 border border-border/40 text-muted-foreground/60 hover:text-foreground hover:border-border',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 animate-stagger">
        <StatCard
          title="Total Spend"
          value={formatCost(summary?.totalCostUsd)}
          icon={DollarSign}
          accent="warning"
        />
        <StatCard
          title="Total Tokens"
          value={formatTokens((summary?.totalTokensIn ?? 0) + (summary?.totalTokensOut ?? 0))}
          icon={Zap}
          accent="default"
        />
        <StatCard
          title="API Calls"
          value={summary?.callCount ?? 0}
          icon={BarChart2}
          accent="default"
        />
        <StatCard
          title="Projected (month)"
          value={formatCost(projected?.projected)}
          icon={TrendingUp}
          accent="default"
          subtext={`$${projected?.dailyRate.toFixed(4) ?? '0'}/day`}
        />
      </div>

      {budgetStatus.length > 0 && (
        <SectionCard title="Budget Status">
          <div className="space-y-5">
            {budgetStatus.map(({ budget, daySpend, monthSpend, dayPercent, monthPercent, dayAlert, monthAlert }) => (
              <div key={budget.id}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-semibold">
                    {budget.agentName || 'Global budget'}
                  </span>
                  {(dayAlert || monthAlert) && (
                    <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse-slow" />
                      Alert threshold reached
                    </span>
                  )}
                </div>
                {budget.dailyLimitUsd && (
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] text-muted-foreground/60 mb-1.5">
                      <span className="font-mono">Daily: {formatCost(daySpend)} / {formatCost(budget.dailyLimitUsd)}</span>
                      <span className="font-mono">{dayPercent?.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          dayAlert
                            ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                            : 'bg-gradient-to-r from-primary/80 to-primary',
                        )}
                        style={{ width: `${Math.min(dayPercent ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {budget.monthlyLimitUsd && (
                  <div>
                    <div className="flex justify-between text-[11px] text-muted-foreground/60 mb-1.5">
                      <span className="font-mono">Monthly: {formatCost(monthSpend)} / {formatCost(budget.monthlyLimitUsd)}</span>
                      <span className="font-mono">{monthPercent?.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          monthAlert
                            ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                            : 'bg-gradient-to-r from-primary/80 to-primary',
                        )}
                        style={{ width: `${Math.min(monthPercent ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cost Trend" description="Last 30 days">
          <CostTrendChart data={trend} />
        </SectionCard>
        <SectionCard title="Cost by Model">
          {byModel.length > 0 ? (
            <CostByModelChart data={byModel} />
          ) : (
            <EmptyState message="No model cost data" />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cost by Agent">
          {byAgent.length > 0 ? (
            <CostByAgentChart data={byAgent} />
          ) : (
            <EmptyState message="No agent cost data" />
          )}
        </SectionCard>

        <SectionCard title="Top Expensive Runs">
          {topRuns.length === 0 ? (
            <EmptyState message="No run cost data" />
          ) : (
            <div className="space-y-1.5">
              {topRuns.map((run, i) => (
                <div
                  key={run.runId}
                  className="flex items-center justify-between rounded-lg p-2.5 hover:bg-accent/20 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[11px] font-mono text-muted-foreground/40 w-5 text-right">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/agents/${run.runId}`}
                        className="text-[13px] font-medium hover:text-primary truncate block transition-colors"
                      >
                        {run.agentName}
                      </Link>
                      <p className="text-[10px] text-muted-foreground/40 font-mono">{run.runId.slice(0, 8)}…</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-[13px] font-semibold font-mono">{formatCost(run.totalCostUsd)}</p>
                    <p className="text-[10px] text-muted-foreground/40 font-mono">
                      {formatTokens(parseInt(run.totalTokens))} tok
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
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
