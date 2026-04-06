'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, ChevronRight, Activity, Clock, DollarSign, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentsApi, type AgentRun } from '@/lib/api';

interface ProjectRunSummary {
  projectId: string;
  projectName: string;
  activeRuns: number;
  totalRuns: number;
  lastRun: AgentRun | null;
  status: 'active' | 'idle' | 'error';
}

interface ProjectRunsCardProps {
  className?: string;
  maxProjects?: number;
}

export function ProjectRunsCard({ className, maxProjects = 5 }: ProjectRunsCardProps) {
  const [summaries, setSummaries] = useState<ProjectRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjectRuns() {
      try {
        const activeRuns = await agentsApi.getActive();
        
        const runs = await agentsApi.list({ limit: '50' });
        
        const projectMap = new Map<string, ProjectRunSummary>();
        
        for (const run of runs.items) {
          const projectId = run.linkedCard?.board?.projectId || 'unlinked';
          const projectName = run.linkedCard?.board?.project?.name || 'Unlinked Runs';
          
          if (!projectMap.has(projectId)) {
            projectMap.set(projectId, {
              projectId,
              projectName,
              activeRuns: 0,
              totalRuns: 0,
              lastRun: null,
              status: 'idle',
            });
          }
          
          const summary = projectMap.get(projectId)!;
          summary.totalRuns++;
          
          if (run.status === 'running' || run.status === 'queued') {
            summary.activeRuns++;
            summary.status = 'active';
          } else if (run.status === 'failed' && summary.status !== 'active') {
            summary.status = 'error';
          }
          
          if (!summary.lastRun || new Date(run.createdAt) > new Date(summary.lastRun.createdAt)) {
            summary.lastRun = run;
          }
        }
        
        const sorted = Array.from(projectMap.values())
          .sort((a, b) => {
            if (a.activeRuns !== b.activeRuns) return b.activeRuns - a.activeRuns;
            if (!a.lastRun || !b.lastRun) return a.lastRun ? -1 : 1;
            return new Date(b.lastRun.createdAt).getTime() - new Date(a.lastRun.createdAt).getTime();
          })
          .slice(0, maxProjects);
        
        setSummaries(sorted);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchProjectRuns();
    const interval = setInterval(fetchProjectRuns, 30000);
    return () => clearInterval(interval);
  }, [maxProjects]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-muted rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-xl border border-rose-500/30 bg-rose-500/5 p-4', className)}>
        <p className="text-sm text-rose-500">Failed to load project runs: {error}</p>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
        <p className="text-sm text-muted-foreground text-center py-4">
          No runs recorded yet
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card', className)}>
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />
          Project Activity
        </h3>
      </div>

      <div className="divide-y divide-border">
        {summaries.map((summary) => (
          <ProjectRow key={summary.projectId} summary={summary} />
        ))}
      </div>
    </div>
  );
}

function ProjectRow({ summary }: { summary: ProjectRunSummary }) {
  const StatusIcon = summary.status === 'active' 
    ? Activity 
    : summary.status === 'error' 
      ? AlertCircle 
      : CheckCircle2;
  
  const statusColor = summary.status === 'active'
    ? 'text-primary'
    : summary.status === 'error'
      ? 'text-rose-500'
      : 'text-muted-foreground';

  const formatCost = (usd: string) => {
    const num = parseFloat(usd);
    if (num < 0.01) return `$${(num * 100).toFixed(2)}¢`;
    return `$${num.toFixed(2)}`;
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <Link
      href={summary.projectId === 'unlinked' ? '/agents' : `/projects/${summary.projectId}`}
      className="block p-4 hover:bg-muted/30 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusIcon className={cn('h-3.5 w-3.5', statusColor, 
              summary.status === 'active' && 'animate-pulse'
            )} />
            <span className="font-medium truncate">{summary.projectName}</span>
            {summary.activeRuns > 0 && (
              <span className="shrink-0 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                {summary.activeRuns} active
              </span>
            )}
          </div>
          
          {summary.lastRun && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(summary.lastRun.durationMs)}
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {formatCost(summary.lastRun.totalCostUsd)}
              </span>
              <span className="font-mono">
                {summary.lastRun.agentName}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-muted-foreground">
            {summary.totalRuns} run{summary.totalRuns !== 1 ? 's' : ''}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </Link>
  );
}

export default ProjectRunsCard;