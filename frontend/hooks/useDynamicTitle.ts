'use client';

import { useEffect } from 'react';

/**
 * Sets document.title for client components (which cannot export Next.js metadata).
 * Falls back gracefully if called during SSR.
 */
export function useDynamicTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
