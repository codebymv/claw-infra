'use client';

import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Toast, ToastVariant } from '@/hooks/useToast';

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-card border-border text-foreground',
  success: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
  error: 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300',
  warning: 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300',
};

const variantIcons: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const Icon = variantIcons[toast.variant];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm',
        'animate-fade-in min-w-[260px] max-w-[380px]',
        variantStyles[toast.variant],
      )}
      role="alert"
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <p className="flex-1 text-[13px] leading-snug">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
