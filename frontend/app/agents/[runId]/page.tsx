'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock, DollarSign, Cpu, Hash } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { SectionCard } from '@/components/shared/section-card';
import { PageLoader } from '@/components/shared/loading-spinner';
import { agentsApi, logsApi, type AgentRun, type AgentStep, type AgentLog } from '@/lib/api';
import { formatDateTime, formatDuration, formatCost, formatTokens, cn } from '@/lib/utils';
import { useAgentStream } from '@/hooks/useAgentStream';

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [historicLogs, setHistoricLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  const { logs: streamLogs, runUpdate } = useAgentStream({ runId });

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
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [runId]);

  useEffect(() => {
    if (runUpdate) {
      setRun((prev) => prev ? { ...prev, ...runUpdate } : prev);
    }
  }, [runUpdate]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamLogs]);

  const allLogs = [...historicLogs, ...streamLogs];
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
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold tracking-tight truncate sm:text-xl">{run.agentName}</h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-1 truncate">{run.id}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 animate-stagger">
        <MetaCard icon={Clock} label="Duration" value={formatDuration(run.durationMs)} />
        <MetaCard icon={DollarSign} label="Total Cost" value={formatCost(run.totalCostUsd)} />
        <MetaCard icon={Hash} label="Tokens Used" value={formatTokens(run.totalTokensIn + run.totalTokensOut)} />
        <MetaCard icon={Cpu} label="Started" value={formatDateTime(run.startedAt)} small />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
          <div className="h-64 sm:h-80 overflow-y-auto font-mono text-[11px] rounded-lg bg-muted/30 border border-border p-4 space-y-0.5">
            {allLogs.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No logs yet</p>
            ) : (
              allLogs.map((log, i) => (
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
