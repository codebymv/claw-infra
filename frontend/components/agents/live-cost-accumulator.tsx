'use client';

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { costsApi, type CostSummary, type ProjectedSpend } from '@/lib/api';

interface LiveCostAccumulatorProps {
  className?: string;
  refreshInterval?: number;
}

export function LiveCostAccumulator({ 
  className,
  refreshInterval = 60000, 
}: LiveCostAccumulatorProps) {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [projected, setProjected] = useState<ProjectedSpend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [summaryData, projectedData] = await Promise.all([
          costsApi.getSummary({ period: '1d' }),
          costsApi.getProjected(),
        ]);
        setSummary(summaryData);
        setProjected(projectedData);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-xl border border-rose-500/30 bg-rose-500/5 p-4', className)}>
        <p className="text-sm text-rose-500">Failed to load cost data: {error}</p>
      </div>
    );
  }

  const formatCost = (usd: number | string) => {
    const num = typeof usd === 'string' ? parseFloat(usd) : usd;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(num);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className={cn('rounded-xl border border-border bg-card', className)}>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Cost Overview
          </h3>
          <span className="text-[10px] text-muted-foreground">Last 24h</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CostCard
            label="Total Cost"
            value={formatCost(summary?.totalCostUsd || 0)}
            icon={DollarSign}
            highlight
          />
          <CostCard
            label="API Calls"
            value={formatNumber(summary?.callCount || 0)}
            icon={Zap}
          />
          <CostCard
            label="Tokens In"
            value={formatNumber(summary?.totalTokensIn || 0)}
            icon={TrendingUp}
          />
          <CostCard
            label="Tokens Out"
            value={formatNumber(summary?.totalTokensOut || 0)}
            icon={TrendingUp}
          />
        </div>

        {projected && (
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Monthly Projection
              </h4>
              <span className="text-[10px] text-muted-foreground">
                Day {projected.daysElapsed} of {projected.daysInMonth}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Month to Date</p>
                <p className="text-lg font-bold font-mono">{formatCost(projected.monthToDate)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Daily Rate</p>
                <p className="text-lg font-bold font-mono">{formatCost(projected.dailyRate)}</p>
              </div>
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
                <p className="text-[10px] text-primary mb-1">Projected</p>
                <p className="text-lg font-bold font-mono text-primary">{formatCost(projected.projected)}</p>
              </div>
            </div>

            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ 
                  width: `${Math.min((projected.daysElapsed / projected.daysInMonth) * 100, 100)}%` 
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CostCard({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div 
      className={cn(
        'rounded-lg p-3 border',
        highlight 
          ? 'bg-primary/5 border-primary/20' 
          : 'bg-muted/50 border-border'
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('h-3 w-3', highlight ? 'text-primary' : 'text-muted-foreground')} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={cn(
        'text-sm font-bold font-mono',
        highlight && 'text-primary'
      )}>
        {value}
      </p>
    </div>
  );
}

export default LiveCostAccumulator;