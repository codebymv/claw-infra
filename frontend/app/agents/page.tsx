'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { RefreshCw, ChevronLeft, ChevronRight, X, Search, Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { PageLoader } from '@/components/shared/loading-spinner';
import { LastUpdated } from '@/components/shared/last-updated';
import { agentsApi, type AgentRunsResponse } from '@/lib/api';
import { formatRelativeTime, formatDuration, formatCost, formatTokens } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAppToast } from '@/components/layout/app-shell';
import { useDynamicTitle } from '@/hooks/useDynamicTitle';

const STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'];

function AgentsPageContent() {
  useDynamicTitle('Agent Runs | ClawInfra');

  const toast = useAppToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AgentRunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const isFirstLoad = useRef(true);

  const status = searchParams.get('status') || '';
  const agentName = searchParams.get('agentName') || '';
  const page = parseInt(searchParams.get('page') || '1');

  const load = useCallback(async (isManual = false) => {
    // First load: show full PageLoader. Subsequent: show table overlay.
    if (isFirstLoad.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    const params: Record<string, string> = { page: String(page), limit: '20' };
    if (status) params.status = status;
    if (agentName) params.agentName = agentName;
    try {
      const res = await agentsApi.list(params);
      setData(res);
      setLastRefreshed(new Date());
      isFirstLoad.current = false;
    } catch (err) {
      if (isManual) {
        toast.error((err as Error).message || 'Failed to load agent runs');
      } else if (isFirstLoad.current) {
        toast.error((err as Error).message || 'Failed to load agent runs');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, agentName, page]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isFirstLoad.current = true;
    load();
    const interval = setInterval(() => load(), 15000);
    return () => clearInterval(interval);
  }, [load]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filter bar — stacks vertically on mobile, single row on sm+ */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {/* Search input — full width on mobile */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by agent name..."
            value={agentName}
            onChange={(e) => setParam('agentName', e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all sm:w-52"
          />
        </div>

        {/* Status filters — horizontally scrollable on mobile so they never wrap to 2 rows */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 sm:overflow-visible sm:pb-0">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setParam('status', status === s ? '' : s)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide capitalize transition-all duration-200',
                status === s
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {(status || agentName) && (
          <button
            onClick={() => { setParam('status', ''); setParam('agentName', ''); }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <LastUpdated at={lastRefreshed} />
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-all"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden card-shine gradient-border">
        {loading && !data ? (
          <PageLoader />
        ) : (
          <>
            {/* Table wrapper — relative so the overlay can be positioned inside it */}
            <div className="relative overflow-x-auto">
              {/* Refresh overlay — keeps the table mounted, no jarring remount */}
              {refreshing && data && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}

              {/* overflow-x-auto + min-width table ensures columns never collapse on narrow screens */}
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-5">Agent</th>
                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-5">Status</th>
                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-5">Duration</th>
                    <th className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-5">Cost</th>
                    <th className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-5">Tokens</th>
                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-5">Started</th>
                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-5">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground text-[13px]">
                        No runs found
                      </td>
                    </tr>
                  ) : (
                    data?.items.map((run) => (
                      <tr
                        key={run.id}
                        className="border-b border-border/50 hover:bg-accent/50 transition-colors duration-150"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/agents/${run.id}`}
                            className="font-medium hover:text-primary transition-colors"
                          >
                            {run.agentName}
                          </Link>
                          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {run.id.slice(0, 8)}…
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground tabular-nums font-mono text-[12px]">
                          {formatDuration(run.durationMs)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums font-mono text-[12px]">
                          {formatCost(run.totalCostUsd)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums font-mono text-[12px]">
                          {formatTokens(run.totalTokensIn + run.totalTokensOut)}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-[11px]">
                          {formatRelativeTime(run.startedAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[11px] text-muted-foreground capitalize font-medium">
                            {run.trigger}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data && data.pages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-[11px] text-muted-foreground font-mono">
                  {data.total} total runs
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setParam('page', String(page - 1))}
                    disabled={page <= 1}
                    className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {page} / {data.pages}
                  </span>
                  <button
                    onClick={() => setParam('page', String(page + 1))}
                    disabled={page >= data.pages}
                    className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30 transition-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AgentsPageContent />
    </Suspense>
  );
}
