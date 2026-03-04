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
