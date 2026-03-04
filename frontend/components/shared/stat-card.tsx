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

const accentClasses = {
  default: 'text-primary bg-primary/10',
  success: 'text-green-400 bg-green-400/10',
  warning: 'text-yellow-400 bg-yellow-400/10',
  destructive: 'text-red-400 bg-red-400/10',
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
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          {trend && (
            <p
              className={cn(
                'text-xs font-medium',
                trend.value >= 0 ? 'text-green-400' : 'text-red-400',
              )}
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-md p-2', accentClasses[accent])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}
