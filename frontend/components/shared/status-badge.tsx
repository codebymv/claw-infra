import { cn } from '@/lib/utils';

type Status = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;

const statusConfig: Record<string, { label: string; classes: string; dot?: string }> = {
  queued: {
    label: 'Queued',
    classes: 'bg-sky-400/8 text-sky-400 border-sky-400/15',
  },
  running: {
    label: 'Running',
    classes: 'bg-primary/8 text-primary border-primary/15',
    dot: 'bg-primary animate-pulse-slow',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-emerald-400/8 text-emerald-400 border-emerald-400/15',
  },
  failed: {
    label: 'Failed',
    classes: 'bg-rose-400/8 text-rose-400 border-rose-400/15',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'bg-zinc-400/8 text-zinc-400 border-zinc-400/15',
  },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const config = statusConfig[status] || {
    label: status,
    classes: 'bg-zinc-400/8 text-zinc-400 border-zinc-400/15',
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
