import { cn } from '@/lib/utils';
import { Activity } from 'lucide-react';

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center animate-fade-in">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-10 w-10 animate-spin-slow rounded-full border-2 border-border border-t-primary" />
          <Activity className="absolute inset-0 m-auto h-4 w-4 text-primary/70" />
        </div>
        <div className="text-center">
          <p className="font-display text-sm font-medium">Loading</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Fetching data...</p>
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-muted/60', className)} />
  );
}

export function ChartSkeleton() {
  return (
    <div className="flex h-60 items-end gap-2 px-4 pb-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t-md bg-muted/50"
          style={{ height: `${30 + Math.random() * 50}%`, animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 7 }: { cols?: number }) {
  return (
    <tr className="border-b border-border/50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <Skeleton className="h-4 w-full max-w-[100px]" />
        </td>
      ))}
    </tr>
  );
}
