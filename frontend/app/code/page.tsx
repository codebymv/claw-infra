'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  GitPullRequest,
  GitMerge,
  GitCommitHorizontal,
  FileCode2,
  Plus,
  Minus,
  Sigma,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { SectionCard } from '@/components/shared/section-card';
import { PageLoader } from '@/components/shared/loading-spinner';
import {
  codeApi,
  type CodeOverview,
  type CodeTrendPoint,
  type CodePrListResponse,
  type CodePrState,
  type CodeQuality,
} from '@/lib/api';
import { formatDuration, cn } from '@/lib/utils';
import { useAppToast } from '@/components/layout/app-shell';
import { useDynamicTitle } from '@/hooks/useDynamicTitle';
import { CodeLatencyChart, CodeLocChart, CodeVolumeChart } from '@/components/charts/code-trend-charts';

type Range = '7d' | '30d' | '90d';
const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

const PR_STATES: Array<{ value: '' | CodePrState; label: string }> = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
];

function daysFromRange(range: Range) {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
}

function toIsoDate(date: Date) {
  return date.toISOString();
}

export default function CodePage() {
  useDynamicTitle('Code | ClawInfra');

  const toast = useAppToast();
  const [range, setRange] = useState<Range>('30d');
  const [repo, setRepo] = useState('');
  const [author, setAuthor] = useState('');
  const [prState, setPrState] = useState<'' | CodePrState>('');
  const [page, setPage] = useState(1);

  const [overview, setOverview] = useState<CodeOverview | null>(null);
  const [trends, setTrends] = useState<CodeTrendPoint[]>([]);
  const [prs, setPrs] = useState<CodePrListResponse | null>(null);
  const [quality, setQuality] = useState<CodeQuality | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [repoInput, setRepoInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const hasLoadedRef = useRef(false);

  const load = useCallback(
    async (isManual = false) => {
      if (!hasLoadedRef.current) setLoading(true);
      else setRefreshing(true);

      const now = new Date();
      const from = new Date(now.getTime() - daysFromRange(range) * 24 * 60 * 60 * 1000);

      const baseParams: Record<string, string> = {
        from: toIsoDate(from),
        to: toIsoDate(now),
      };

      if (repo) baseParams.repo = repo;
      if (author) baseParams.author = author;

      const prsParams: Record<string, string> = {
        ...baseParams,
        page: String(page),
        limit: '20',
      };
      if (prState) prsParams.state = prState;

      try {
        const [o, t, p, q] = await Promise.all([
          codeApi.getOverview(baseParams),
          codeApi.getTrends(baseParams),
          codeApi.getPrs(prsParams),
          codeApi.getQuality(baseParams),
        ]);

        setOverview(o);
        setTrends(t);
        setPrs(p);
        setQuality(q);
      } catch (err) {
        if (isManual || !overview) {
          toast.error((err as Error).message || 'Failed to load code visibility data');
        }
      } finally {
        hasLoadedRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, repo, author, prState, page], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    load();
    const interval = setInterval(() => load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !hasLoadedRef.current) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => {
                setPage(1);
                setRange(value);
              }}
              className={cn(
                'shrink-0 rounded-lg px-4 py-1.5 text-[12px] font-semibold tracking-wide transition-all duration-200',
                range === value
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <input
            type="text"
            placeholder="owner/repo"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all sm:w-44"
          />
          <input
            type="text"
            placeholder="author"
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all sm:w-36"
          />
          <button
            onClick={() => {
              setPage(1);
              setRepo(repoInput.trim());
              setAuthor(authorInput.trim());
            }}
            className="h-9 shrink-0 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setPage(1);
              if (repo || author || prState || repoInput || authorInput) {
                setRepo('');
                setAuthor('');
                setRepoInput('');
                setAuthorInput('');
                setPrState('');
              } else {
                load(true);
              }
            }}
            className="h-9 shrink-0 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            Reset
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="h-9 shrink-0 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-60 transition-all inline-flex items-center gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 animate-stagger">
        <StatCard title="PRs Opened" value={overview?.prsOpened ?? 0} icon={GitPullRequest} accent="default" />
        <StatCard title="PRs Merged" value={overview?.prsMerged ?? 0} icon={GitMerge} accent="success" />
        <StatCard title="Commits" value={overview?.commits ?? 0} icon={GitCommitHorizontal} accent="default" />
        <StatCard title="Files Changed" value={overview?.changedFiles ?? 0} icon={FileCode2} accent="warning" />
      </div>

      <div className="grid gap-4 grid-cols-3">
        <StatCard title="Additions" value={overview?.additions ?? 0} icon={Plus} accent="success" />
        <StatCard title="Deletions" value={overview?.deletions ?? 0} icon={Minus} accent="destructive" />
        <StatCard title="Net Lines" value={overview?.netLines ?? 0} icon={Sigma} accent="default" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="PR Volume" description="Opened vs merged">
          {trends.length > 0 ? <CodeVolumeChart data={trends} /> : <EmptyState message="No PR trend data" />}
        </SectionCard>
        <SectionCard title="LoC Trend" description="Additions / deletions / net">
          {trends.length > 0 ? <CodeLocChart data={trends} /> : <EmptyState message="No LoC trend data" />}
        </SectionCard>
        <SectionCard title="Latency Trend" description="Average hours to first review and merge">
          {trends.length > 0 ? <CodeLatencyChart data={trends} /> : <EmptyState message="No latency trend data" />}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Flow Quality"
          description={`Hotfix/revert follow-ups within ${quality?.hotfixWindowHours ?? 48}h`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span className="text-[13px] font-medium">Merged PRs</span>
              </div>
              <span className="font-mono text-[13px]">{quality?.mergedPrs ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span className="text-[13px] font-medium">Hotfix/revert follow-ups</span>
              </div>
              <span className="font-mono text-[13px]">{quality?.revertOrHotfixFollowupCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <span className="text-[13px] font-medium">Follow-up rate</span>
              <span className="font-mono text-[13px]">
                {quality ? `${(quality.revertOrHotfixFollowupRate * 100).toFixed(1)}%` : '0.0%'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <span className="text-[13px] font-medium">Avg first review latency</span>
              <span className="font-mono text-[13px]">
                {overview?.averageFirstReviewLatencySeconds != null
                  ? formatDuration(overview.averageFirstReviewLatencySeconds * 1000)
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <span className="text-[13px] font-medium">Avg merge latency</span>
              <span className="font-mono text-[13px]">
                {overview?.averageMergeLatencySeconds != null
                  ? formatDuration(overview.averageMergeLatencySeconds * 1000)
                  : '—'}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Largest PRs" description="Biggest changes in selected range">
          <div className="space-y-3">
            {prs?.items && prs.items.length > 0 ? (
              [...prs.items]
                .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
                .slice(0, 5)
                .map((pr) => (
                  <div key={pr.id} className="flex items-center justify-between rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors px-4 py-3">
                    <div className="flex flex-col gap-1 overflow-hidden pr-3">
                      <span className="text-[13px] font-medium truncate">#{pr.number} {pr.title}</span>
                      <span className="text-[11px] text-muted-foreground">{pr.author || 'Unknown'}</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="font-mono text-[12px] tabular-nums text-emerald-500">+{pr.additions}</span>
                      <span className="font-mono text-[12px] tabular-nums opacity-50">/</span>
                      <span className="font-mono text-[12px] tabular-nums text-destructive">-{pr.deletions}</span>
                    </div>
                  </div>
                ))
            ) : (
              <div className="flex h-full min-h-[160px] items-center justify-center">
                <span className="text-[12px] text-muted-foreground">No PRs found</span>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Pull Requests"
        description="Recent PRs for selected range"
        action={
          <div className="flex items-center gap-2">
            {PR_STATES.map(({ value, label }) => (
              <button
                key={label}
                onClick={() => {
                  setPage(1);
                  setPrState(value);
                }}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-all duration-200',
                  prState === value
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="relative overflow-x-auto">
          {refreshing && prs && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">PR</th>
                <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Repo</th>
                <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Author</th>
                <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">State</th>
                <th className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">LoC (+/-)</th>
                <th className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Files</th>
                <th className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Reviews</th>
                <th className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Cycle Time</th>
              </tr>
            </thead>
            <tbody>
              {!prs || prs.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground text-[13px]">
                    No pull requests found for selected filters
                  </td>
                </tr>
              ) : (
                prs.items.map((pr) => (
                  <tr key={pr.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium">#{pr.number} {pr.title}</p>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">{pr.repo}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{pr.author || '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        pr.state === 'merged'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : pr.state === 'open'
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-muted text-muted-foreground border border-border',
                      )}>
                        {pr.state}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-[12px] tabular-nums">
                      +{pr.additions.toLocaleString()} / -{pr.deletions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                      {pr.changedFiles}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                      {pr.reviewCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-[12px] tabular-nums">
                      {pr.cycleTimeSeconds != null ? formatDuration(pr.cycleTimeSeconds * 1000) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {prs && prs.total > 0 && (
          <div className="flex items-center justify-between border-t border-border mt-4 px-4 py-3">
            <p className="text-[11px] text-muted-foreground font-mono">
              Showing {prs.items.length} rows on this page ({prs.total} total)
            </p>
            {prs.pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {page} / {prs.pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(prs.pages, p + 1))}
                  disabled={page >= prs.pages}
                  className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-30 transition-all"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-60 items-center justify-center">
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </div>
  );
}
