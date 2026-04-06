'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock, DollarSign, Cpu, Hash, StopCircle, Loader2, FolderKanban, ExternalLink, Search, Filter } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { SectionCard } from '@/components/shared/section-card';
import { PageLoader } from '@/components/shared/loading-spinner';
import { Input } from '@/components/ui/input';
import { agentsApi, logsApi, type AgentRun, type AgentStep, type AgentLog, type AgentLinkableCard } from '@/lib/api';
import { formatDateTime, formatDuration, formatCost, formatTokens, cn } from '@/lib/utils';
import { useAgentStream } from '@/hooks/useAgentStream';
import { useAppToast } from '@/components/layout/app-shell';
import { useDynamicTitle } from '@/hooks/useDynamicTitle';
import { StepTimeline } from '@/components/agents/step-timeline';

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const toast = useAppToast();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [historicLogs, setHistoricLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<AgentLinkableCard[]>([]);
  const [searchingCards, setSearchingCards] = useState(false);
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null);
  const [logLevelFilter, setLogLevelFilter] = useState<string | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  const { logs: streamLogs, runUpdate } = useAgentStream({ runId });

  useDynamicTitle(run ? `${run.agentName} | ClawInfra` : 'Run Detail | ClawInfra');

  useEffect(() => {
    async function load() {
      try {
        const [runData, stepsData, logsData] = await Promise.all([
          agentsApi.getById(runId),
          agentsApi.getSteps(runId),
          logsApi.getRunLogs(runId, { limit: '200' }),
        ]);
        setRun(runData);
        setSteps(stepsData);
        setHistoricLogs(logsData.items);
      } catch (err) {
        toast.error((err as Error).message || 'Failed to load run details');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [runId]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (runUpdate) {
      setRun((prev) => prev ? { ...prev, ...runUpdate } : prev);
    }
  }, [runUpdate]);

  useEffect(() => {
    if (!linkQuery.trim()) {
      setLinkResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setSearchingCards(true);
        const cards = await agentsApi.searchCards({ q: linkQuery.trim(), limit: '8' });
        setLinkResults(cards);
      } catch (err) {
        toast.error((err as Error).message || 'Failed to search cards');
      } finally {
        setSearchingCards(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [linkQuery]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamLogs]);

  async function handleCancel() {
    if (!run) return;
    setCancelling(true);
    try {
      await agentsApi.cancel(run.id);
      setRun((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
      toast.success('Run cancelled successfully');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to cancel run');
    } finally {
      setCancelling(false);
    }
  }

  async function handleLinkCard(cardId: string | null) {
    if (!run) return;

    setLinkingCardId(cardId || 'unlink');
    try {
      const updated = await agentsApi.linkCard(run.id, cardId);
      setRun(updated);
      if (!cardId) {
        toast.success('Card unlinked from run');
      } else {
        toast.success('Run linked to card');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update run link');
    } finally {
      setLinkingCardId(null);
    }
  }

  const allLogs = [...historicLogs, ...streamLogs];
  const filteredLogs = allLogs.filter((log) => {
    if (logLevelFilter && log.level !== logLevelFilter) return false;
    if (logSearchQuery && !log.message.toLowerCase().includes(logSearchQuery.toLowerCase())) return false;
    return true;
  });
  const isActive = run?.status === 'running' || run?.status === 'queued';

  if (loading) return <PageLoader />;
  if (!run) return <p className="text-muted-foreground">Run not found</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to runs
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold tracking-tight truncate sm:text-xl">{run.agentName}</h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-1 truncate">{run.id}</p>
          </div>
          <StatusBadge status={run.status} />
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[12px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-50 transition-all"
            >
              {cancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <StopCircle className="h-3.5 w-3.5" />
              )}
              {cancelling ? 'Cancelling…' : 'Cancel Run'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 animate-stagger">
        <MetaCard icon={Clock} label="Duration" value={formatDuration(run.durationMs)} />
        <MetaCard icon={DollarSign} label="Total Cost" value={formatCost(run.totalCostUsd)} />
        <MetaCard icon={Hash} label="Tokens Used" value={formatTokens(run.totalTokensIn + run.totalTokensOut)} />
        <MetaCard icon={Cpu} label="Started" value={formatDateTime(run.startedAt)} small />
      </div>

      {steps.length > 0 && (
        <SectionCard title="Step Duration" description="Relative execution time per step">
          <StepTimeline steps={steps} />
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Related Work" description="Project artifact linked to this run">
          <div className="space-y-3">
            {run.linkedCard ? (
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Linked Card
                    </p>
                    <p className="text-sm font-semibold truncate mt-1">{run.linkedCard.title}</p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground shrink-0">
                    {run.linkedCard.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 text-[12px]">
                  <div>
                    <p className="text-muted-foreground">Project</p>
                    <p className="font-medium truncate">
                      {run.linkedCard.board?.project?.name || run.linkedCard.board?.projectId || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Column</p>
                    <p className="font-medium truncate">{run.linkedCard.column?.name || 'Unknown'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {run.linkedCard.board?.projectId ? (
                    <Link
                      href={`/projects/${run.linkedCard.board.projectId}`}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      <FolderKanban className="h-3.5 w-3.5" />
                      Open project board
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <p className="text-[11px] text-muted-foreground font-mono">Card ID: {run.linkedCard.id}</p>
                  )}

                  <button
                    onClick={() => handleLinkCard(null)}
                    disabled={linkingCardId !== null}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {linkingCardId === 'unlink' ? 'Unlinking...' : 'Unlink card'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
                This run is not linked to a project card yet.
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Link to card
              </p>
              <Input
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search card by title or paste card ID"
                className="h-9"
              />

              {searchingCards ? (
                <p className="text-[12px] text-muted-foreground">Searching cards...</p>
              ) : linkQuery.trim() && linkResults.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted-foreground">No matching cards found.</p>
                  <button
                    onClick={() => handleLinkCard(linkQuery.trim())}
                    disabled={linkingCardId !== null}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {linkingCardId === linkQuery.trim() ? 'Linking...' : 'Link using typed ID'}
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {linkResults.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleLinkCard(card.id)}
                      disabled={linkingCardId !== null}
                      className="w-full text-left rounded-md border border-border/70 px-2.5 py-2 hover:border-border hover:bg-accent/40 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium truncate">{card.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {card.projectName || card.projectId || 'Unknown project'} • {card.columnName || 'Unknown column'}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono uppercase">
                          {card.status.replace('_', ' ')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Step Timeline" description={`${steps.length} steps`}>
          {steps.length === 0 ? (
            <p className="text-[13px] text-muted-foreground text-center py-6">No steps recorded yet</p>
          ) : (
            <div className="space-y-0.5">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-start gap-3 py-2.5">
                  <div className="flex flex-col items-center">
                    <StepIcon status={step.status} />
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1 min-h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        #{step.stepIndex + 1}
                      </span>
                      <span className="text-[13px] font-medium truncate">
                        {step.stepName || step.toolName || `Step ${step.stepIndex + 1}`}
                      </span>
                      <span className="ml-auto text-[11px] font-mono text-muted-foreground shrink-0">
                        {formatDuration(step.durationMs)}
                      </span>
                    </div>
                    {(step.tokensIn > 0 || step.tokensOut > 0) && (
                      <div className="flex gap-3 mt-1">
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {formatTokens(step.tokensIn + step.tokensOut)} tok
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {formatCost(step.costUsd)}
                        </span>
                        {step.modelUsed && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {step.modelUsed}
                          </span>
                        )}
                      </div>
                    )}
                    {step.status === 'failed' && step.errorMessage && (
                      <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-1 truncate">{step.errorMessage}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Live Logs"
          description={isActive ? 'Streaming...' : `${allLogs.length} entries`}
          action={
            isActive ? (
              <span className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-slow" />
                Live
              </span>
            ) : undefined
          }
        >
          {/* Log filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 mb-3">
            <div className="relative w-full sm:w-auto">
              <label htmlFor="log-search" className="sr-only">Search logs</label>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <input
                id="log-search"
                type="text"
                placeholder="Search logs..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[12px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all sm:w-48"
              />
            </div>
            <div className="flex gap-1" role="group" aria-label="Filter logs by level">
              {['debug', 'info', 'warn', 'error'].map((level) => (
                <button
                  key={level}
                  onClick={() => setLogLevelFilter(logLevelFilter === level ? null : level)}
                  aria-pressed={logLevelFilter === level}
                  aria-label={`Filter by ${level} level`}
                  className={cn(
                    'shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50',
                    logLevelFilter === level
                      ? level === 'error' ? 'bg-rose-500/15 text-rose-500 border border-rose-500/25'
                      : level === 'warn' ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                      : level === 'debug' ? 'bg-muted text-muted-foreground border border-border'
                      : 'bg-primary/15 text-primary border border-primary/25'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
            {filteredLogs.length !== allLogs.length && (
              <span className="text-[10px] text-muted-foreground" aria-live="polite">
                {filteredLogs.length} / {allLogs.length}
              </span>
            )}
          </div>

          <div className="h-64 sm:h-80 overflow-y-auto font-mono text-[11px] rounded-lg bg-muted/30 border border-border p-4 space-y-0.5">
            {filteredLogs.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">
                {allLogs.length === 0 ? 'No logs yet' : 'No logs match filters'}
              </p>
            ) : (
              filteredLogs.map((log, i) => (
                <div key={log.id || i} className={cn('leading-5', logLevelClass(log.level))}>
                  <span className="text-muted-foreground mr-2 select-none">
                    {new Date(log.createdAt).toISOString().slice(11, 23)}
                  </span>
                  <span className={cn('uppercase mr-2 font-bold text-[9px] tracking-wider', logLevelClass(log.level))}>
                    [{log.level}]
                  </span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Step Cost Breakdown">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Step</th>
                <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Tool</th>
                <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Model</th>
                <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Tokens In</th>
                <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Tokens Out</th>
                <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.id} className="border-b border-border/50">
                  <td className="py-2.5 text-muted-foreground font-mono text-[12px]">#{step.stepIndex + 1}</td>
                  <td className="py-2.5">{step.toolName || '—'}</td>
                  <td className="py-2.5 text-muted-foreground font-mono text-[11px]">{step.modelUsed || '—'}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground font-mono text-[12px]">
                    {formatTokens(step.tokensIn)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground font-mono text-[12px]">
                    {formatTokens(step.tokensOut)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-medium font-mono text-[12px]">
                    {formatCost(step.costUsd)}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="pt-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Total
                </td>
                <td className="pt-3 text-right font-bold font-mono">{formatCost(run.totalCostUsd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function MetaCard({
  icon: Icon,
  label,
  value,
  small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 card-shine gradient-border">
      <div className="relative z-10 flex items-center gap-2.5 text-muted-foreground mb-2">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em]">{label}</span>
      </div>
      <p className={cn('relative z-10 font-semibold font-mono', small ? 'text-[13px]' : 'text-base')}>
        {value}
      </p>
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === 'completed')
    return <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 shrink-0" />;
  if (status === 'failed')
    return <XCircle className="h-4 w-4 text-rose-500 dark:text-rose-400 shrink-0" />;
  if (status === 'running')
    return (
      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
    );
  return <div className="h-4 w-4 rounded-full border-2 border-border shrink-0" />;
}

function logLevelClass(level: string) {
  switch (level) {
    case 'error': return 'text-rose-500 dark:text-rose-400';
    case 'warn': return 'text-amber-500 dark:text-amber-400';
    case 'debug': return 'text-muted-foreground';
    default: return 'text-foreground';
  }
}
