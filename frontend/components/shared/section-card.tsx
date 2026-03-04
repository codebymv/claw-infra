import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, description, action, children, className }: SectionCardProps) {
  return (
    <div className={cn('rounded-xl border border-border/50 bg-card/80 card-shine gradient-border', className)}>
      {(title || action) && (
        <div className="relative z-10 flex items-center justify-between border-b border-border/40 px-5 py-4">
          <div>
            {title && (
              <h3 className="font-display text-sm font-semibold tracking-tight">{title}</h3>
            )}
            {description && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">{description}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="relative z-10 p-5">{children}</div>
    </div>
  );
}
