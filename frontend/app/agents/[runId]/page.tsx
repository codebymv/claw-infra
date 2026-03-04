'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock, DollarSign, Cpu, ChevronRight } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div>
        <Link href="/agents" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-3 w-3" /> Back to runs
        </Link>
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold">{run.agentName}</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{run.id}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs">Duration</span>
          </div>
          <p className="font-semibold">{formatDuration(run.durationMs)}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-xs">Total Cost</span>
          </div>
          <p className="font-semibold">{formatCost(run.totalCostUsd)}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Cpu className="h-3.5 w-3.5" />
            <span className="text-xs">Tokens Used</span>
          </div>
          <p className="font-semibold">{formatTokens(run.totalTokensIn + run.totalTokensOut)}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-1">Started</p>
          <p className="text-sm font-medium">{formatDateTime(run.startedAt)}</p>
        </div>
      </div>

      {/* Steps Timeline + Log Viewer */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Step Timeline" description={`${steps.length} steps`}>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No steps recorded yet</p>
          ) : (
            <div className="space-y-1">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-start gap-3 py-2">
                  <div className="flex flex-col items-center">
                    <StepIcon status={step.status} />
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1 min-h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{step.stepIndex + 1}</span>
                      <span className="text-sm font-medium truncate">
                        {step.stepName || step.toolName || `Step ${step.stepIndex + 1}`}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        {formatDuration(step.durationMs)}
                      </span>
                    </div>
                    {(step.tokensIn > 0 || step.tokensOut > 0) && (
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatTokens(step.tokensIn + step.tokensOut)} tokens
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatCost(step.costUsd)}
                        </span>
                        {step.modelUsed && (
                          <span className="text-xs text-muted-foreground">{step.modelUsed}</span>
                        )}
                      </div>
                    )}
                    {step.status === 'failed' && step.errorMessage && (
                      <p className="text-xs text-red-400 mt-1 truncate">{step.errorMessage}</p>
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
        >
          <div className="h-80 overflow-y-auto font-mono text-xs rounded bg-muted/30 p-3 space-y-0.5">
            {allLogs.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No logs yet</p>
            ) : (
              allLogs.map((log, i) => (
                <div key={log.id || i} className={cn('leading-5', logLevelClass(log.level))}>
                  <span className="text-muted-foreground/60 mr-2">
                    {new Date(log.createdAt).toISOString().slice(11, 23)}
                  </span>
                  <span className="uppercase mr-2 font-semibold text-[10px]">[{log.level}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </SectionCard>
      </div>

      {/* Cost Breakdown */}
      <SectionCard title="Step Cost Breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Step</th>
                <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Tool</th>
                <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Model</th>
                <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Tokens In</th>
                <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Tokens Out</th>
                <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.id} className="border-b border-border/40">
                  <td className="py-2 text-muted-foreground">#{step.stepIndex + 1}</td>
                  <td className="py-2">{step.toolName || '—'}</td>
                  <td className="py-2 text-muted-foreground text-xs">{step.modelUsed || '—'}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {formatTokens(step.tokensIn)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {formatTokens(step.tokensOut)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatCost(step.costUsd)}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="pt-3 text-right text-xs font-semibold">Total</td>
                <td className="pt-3 text-right font-bold">{formatCost(run.totalCostUsd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
  if (status === 'running') return <div className="h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />;
  return <div className="h-4 w-4 rounded-full border-2 border-border shrink-0" />;
}

function logLevelClass(level: string) {
  switch (level) {
    case 'error': return 'text-red-400';
    case 'warn': return 'text-yellow-400';
    case 'debug': return 'text-muted-foreground';
    default: return 'text-foreground';
  }
}
