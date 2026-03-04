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
  if (!run) return <p className="text-muted-foreground/60">Run not found</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/50 hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to runs
        </Link>
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">{run.agentName}</h2>
            <p className="text-[11px] text-muted-foreground/40 font-mono mt-1">{run.id}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger">
        <MetaCard icon={Clock} label="Duration" value={formatDuration(run.durationMs)} />
        <MetaCard icon={DollarSign} label="Total Cost" value={formatCost(run.totalCostUsd)} />
        <MetaCard icon={Hash} label="Tokens Used" value={formatTokens(run.totalTokensIn + run.totalTokensOut)} />
        <MetaCard icon={Cpu} label="Started" value={formatDateTime(run.startedAt)} small />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Step Timeline" description={`${steps.length} steps`}>
          {steps.length === 0 ? (
            <p className="text-[13px] text-muted-foreground/50 text-center py-6">No steps recorded yet</p>
          ) : (
            <div className="space-y-0.5">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-start gap-3 py-2.5">
                  <div className="flex flex-col items-center">
                    <StepIcon status={step.status} />
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 bg-border/30 mt-1 min-h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground/40">
                        #{step.stepIndex + 1}
                      </span>
                      <span className="text-[13px] font-medium truncate">
                        {step.stepName || step.toolName || `Step ${step.stepIndex + 1}`}
                      </span>
                      <span className="ml-auto text-[11px] font-mono text-muted-foreground/40 shrink-0">
                        {formatDuration(step.durationMs)}
                      </span>
                    </div>
                    {(step.tokensIn > 0 || step.tokensOut > 0) && (
                      <div className="flex gap-3 mt-1">
                        <span className="text-[11px] text-muted-foreground/50 font-mono">
                          {formatTokens(step.tokensIn + step.tokensOut)} tok
                        </span>
                        <span className="text-[11px] text-muted-foreground/50 font-mono">
                          {formatCost(step.costUsd)}
                        </span>
                        {step.modelUsed && (
                          <span className="text-[11px] text-muted-foreground/40 font-mono">
                            {step.modelUsed}
                          </span>
                        )}
                      </div>
                    )}
                    {step.status === 'failed' && step.errorMessage && (
                      <p className="text-[11px] text-rose-400/80 mt-1 truncate">{step.errorMessage}</p>
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
          <div className="h-80 overflow-y-auto font-mono text-[11px] rounded-lg bg-background/60 border border-border/30 p-4 space-y-0.5">
            {allLogs.length === 0 ? (
              <p className="text-muted-foreground/40 text-center py-6">No logs yet</p>
            ) : (
              allLogs.map((log, i) => (
                <div key={log.id || i} className={cn('leading-5', logLevelClass(log.level))}>
                  <span className="text-muted-foreground/30 mr-2 select-none">
                    {new Date(log.createdAt).toISOString().slice(11, 23)}
                  </span>
                  <span className={cn('uppercase mr-2 font-bold text-[9px] tracking-wider', logLevelClass(log.level))}>
                    [{log.level}]
                  </span>
                  <span className="text-foreground/80">{log.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Step Cost Breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/30">
                <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Step</th>
                <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Tool</th>
                <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Model</th>
                <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Tokens In</th>
                <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Tokens Out</th>
                <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Cost</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.id} className="border-b border-border/15">
                  <td className="py-2.5 text-muted-foreground/50 font-mono text-[12px]">#{step.stepIndex + 1}</td>
                  <td className="py-2.5">{step.toolName || '—'}</td>
                  <td className="py-2.5 text-muted-foreground/50 font-mono text-[11px]">{step.modelUsed || '—'}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground/60 font-mono text-[12px]">
                    {formatTokens(step.tokensIn)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground/60 font-mono text-[12px]">
                    {formatTokens(step.tokensOut)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-medium font-mono text-[12px]">
                    {formatCost(step.costUsd)}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="pt-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
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
    <div className="rounded-xl border border-border/40 bg-card/80 p-4 card-shine gradient-border">
      <div className="relative z-10 flex items-center gap-2.5 text-muted-foreground/50 mb-2">
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
    return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (status === 'failed')
    return <XCircle className="h-4 w-4 text-rose-400 shrink-0" />;
  if (status === 'running')
    return (
      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
    );
  return <div className="h-4 w-4 rounded-full border-2 border-border/40 shrink-0" />;
}

function logLevelClass(level: string) {
  switch (level) {
    case 'error': return 'text-rose-400/80';
    case 'warn': return 'text-amber-400/80';
    case 'debug': return 'text-muted-foreground/40';
    default: return 'text-foreground/70';
  }
}
