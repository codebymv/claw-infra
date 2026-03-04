'use client';

import { useEffect, useState, useCallback } from 'react';
import { Suspense } from 'react';
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
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by agent name..."
            value={agentName}
            onChange={(e) => setParam('agentName', e.target.value)}
            className="h-9 rounded-md border border-border bg-card pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setParam('status', status === s ? '' : s)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                status === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {(status || agentName) && (
          <button
            onClick={() => { setParam('status', ''); setParam('agentName', ''); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}

        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading && !data ? (
          <PageLoader />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Agent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Duration</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Tokens</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        No runs found
                      </td>
                    </tr>
                  ) : (
                    data?.items.map((run) => (
                      <tr
                        key={run.id}
                        className="border-b border-border/50 hover:bg-accent/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/agents/${run.id}`}
                            className="font-medium hover:text-primary transition-colors"
                          >
                            {run.agentName}
                          </Link>
                          <p className="text-xs text-muted-foreground font-mono">{run.id.slice(0, 8)}…</p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {formatDuration(run.durationMs)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCost(run.totalCostUsd)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                          {formatTokens(run.totalTokensIn + run.totalTokensOut)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatRelativeTime(run.startedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground capitalize">{run.trigger}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.pages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {data.total} total runs
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setParam('page', String(page - 1))}
                    disabled={page <= 1}
                    className="rounded p-1 hover:bg-accent disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs">
                    Page {page} of {data.pages}
                  </span>
                  <button
                    onClick={() => setParam('page', String(page + 1))}
                    disabled={page >= data.pages}
                    className="rounded p-1 hover:bg-accent disabled:opacity-40"
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
