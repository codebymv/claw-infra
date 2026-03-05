'use client';

import { useRelativeTime } from '@/hooks/useRelativeTime';
import { RefreshCw } from 'lucide-react';

interface LastUpdatedProps {
  at: Date | null;
}

export function LastUpdated({ at }: LastUpdatedProps) {
  const label = useRelativeTime(at);
  if (!label) return null;
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
      <RefreshCw className="h-3 w-3" />
      {label}
    </span>
  );
}
