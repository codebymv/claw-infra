'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { RefreshCw, ChevronLeft, ChevronRight, X, Search } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { PageLoader } from '@/components/shared/loading-spinner';
import { agentsApi, type AgentRunsResponse } from '@/lib/api';
import { formatRelativeTime, formatDuration, formatCost, formatTokens } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'];

function AgentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AgentRunsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const status = searchParams.get('status') || '';
  const agentName = searchParams.get('agentName') || '';
  const page = parseInt(searchParams.get('page') || '1');

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '20' };
    if (status) params.status = status;
    if (agentName) params.agentName = agentName;
    try {
      const res = await agentsApi.list(params);
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [status, agentName, page]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by agent name..."
            value={agentName}
            onChange={(e) => setParam('agentName', e.target.value)}
            className="h-9 rounded-lg border border-border bg-card pl-9 pr-3 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
          />
        </div>

        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setParam('status', status === s ? '' : s)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide capitalize transition-all duration-200',
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

        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden card-shine gradient-border">
        {loading && !data ? (
          <PageLoader />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Agent</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Status</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Duration</th>
                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Cost</th>
                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Tokens</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Started</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Trigger</th>
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
