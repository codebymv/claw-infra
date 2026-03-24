'use client';

import { cn } from '@/lib/utils';
import { formatDuration, formatCost } from '@/lib/utils';
import type { AgentStep } from '@/lib/api';

interface StepTimelineProps {
  steps: AgentStep[];
}

export function StepTimeline({ steps }: StepTimelineProps) {
  if (steps.length === 0) return null;

  const maxDuration = Math.max(...steps.map((s) => s.durationMs || 1), 1);

  return (
    <div className="space-y-1.5">
      {steps.map((step) => {
        const pct = Math.max(((step.durationMs || 0) / maxDuration) * 100, 2);
        const statusColor =
          step.status === 'failed'
            ? 'bg-rose-500/80'
            : step.status === 'running'
              ? 'bg-primary/60 animate-pulse-slow'
              : 'bg-emerald-500/70';

        return (
          <div key={step.id} className="flex items-center gap-3 group">
            <span className="text-[10px] font-mono text-muted-foreground w-6 text-right shrink-0">
              #{step.stepIndex + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-medium truncate">
                  {step.stepName || step.toolName || `Step ${step.stepIndex + 1}`}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground ml-auto shrink-0">
                  {formatDuration(step.durationMs)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', statusColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground w-14 text-right shrink-0 hidden sm:block">
              {formatCost(step.costUsd)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
