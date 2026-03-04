import { cn } from '@/lib/utils';

type Status = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;

const statusConfig: Record<string, { label: string; classes: string; dot?: string }> = {
  queued: {
    label: 'Queued',
    classes: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
  running: {
    label: 'Running',
    classes: 'bg-primary/10 text-primary border-primary/20',
    dot: 'bg-primary animate-pulse-slow',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
  },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const config = statusConfig[status] || {
    label: status,
    classes: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        config.classes,
        className,
      )}
    >
      {config.dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      )}
      {config.label}
    </span>
  );
}
