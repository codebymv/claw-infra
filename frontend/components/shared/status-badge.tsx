import { cn } from '@/lib/utils';

type Status = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;

const statusConfig: Record<string, { label: string; classes: string; dot?: string }> = {
  queued: { label: 'Queued', classes: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
  running: {
    label: 'Running',
    classes: 'bg-green-400/10 text-green-400 border-green-400/20',
    dot: 'bg-green-400 animate-pulse-slow',
  },
  completed: { label: 'Completed', classes: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
  failed: { label: 'Failed', classes: 'bg-red-400/10 text-red-400 border-red-400/20' },
  cancelled: { label: 'Cancelled', classes: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20' },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const config = statusConfig[status] || { label: status, classes: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20' };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.classes,
        className,
      )}
    >
      {config.dot && <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />}
      {config.label}
    </span>
  );
}
