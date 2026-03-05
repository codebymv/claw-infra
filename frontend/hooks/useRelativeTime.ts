'use client';

import { useState, useEffect } from 'react';

/**
 * Returns a human-readable "X seconds/minutes ago" string that ticks
 * every `tickMs` milliseconds. Returns null if `date` is null/undefined.
 */
export function useRelativeTime(date: Date | null | undefined, tickMs = 5000): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!date) {
      setLabel(null);
      return;
    }

    function compute() {
      const secs = Math.round((Date.now() - date!.getTime()) / 1000);
      if (secs < 5) return 'just now';
      if (secs < 60) return `${secs}s ago`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    }

    setLabel(compute());
    const id = setInterval(() => setLabel(compute()), tickMs);
    return () => clearInterval(id);
  }, [date, tickMs]);

  return label;
}
