'use client';

import { useState, useCallback, useRef } from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

let idCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant = 'default', duration = 4000) => {
      const id = String(++idCounter);
      setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const toast = {
    show: (message: string) => push(message, 'default'),
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error', 6000),
    warning: (message: string) => push(message, 'warning'),
  };

  return { toasts, toast, dismiss };
}
