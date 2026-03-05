import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
  accent?: 'default' | 'success' | 'warning' | 'destructive';
}

const accentConfig = {
  default: {
    icon: 'text-primary bg-primary/10 ring-primary/25',
    glow: 'group-hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.2)]',
  },
  success: {
    icon: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 ring-emerald-500/25',
    glow: 'group-hover:shadow-[0_0_20px_-5px_rgba(52,211,153,0.2)]',
  },
  warning: {
    icon: 'text-amber-500 dark:text-amber-400 bg-amber-500/10 ring-amber-500/25',
    glow: 'group-hover:shadow-[0_0_20px_-5px_rgba(251,191,36,0.2)]',
  },
  destructive: {
    icon: 'text-rose-500 dark:text-rose-400 bg-rose-500/10 ring-rose-500/25',
    glow: 'group-hover:shadow-[0_0_20px_-5px_rgba(251,113,133,0.2)]',
  },
};

export function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  trend,
  className,
  accent = 'default',
}: StatCardProps) {
  const config = accentConfig[accent];

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-border bg-card p-4 sm:p-5 transition-all duration-300 card-shine gradient-border overflow-hidden',
        config.glow,
        className,
      )}
    >
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground truncate">
            {title}
          </p>
          <p className="font-display text-xl sm:text-2xl font-bold tabular-nums tracking-tight truncate">
            {value}
          </p>
          {subtext && (
            <p className="text-[11px] text-muted-foreground">{subtext}</p>
          )}
          {trend && (
            <p
              className={cn(
                'text-xs font-semibold',
                trend.value >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400',
              )}
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-lg p-2.5 ring-1 transition-all duration-300', config.icon)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}
