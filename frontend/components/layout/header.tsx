'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Moon, Sun, Bell, RefreshCw, Signal } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const titles: Record<string, { label: string; description: string }> = {
  '/': { label: 'Dashboard', description: 'System overview & real-time metrics' },
  '/agents': { label: 'Agent Runs', description: 'Monitor and inspect agent executions' },
  '/costs': { label: 'Cost Analytics', description: 'Spending trends & budget tracking' },
  '/resources': { label: 'Resources', description: 'CPU, memory & network utilization' },
  '/settings': { label: 'Settings', description: 'API keys, budgets & configuration' },
};

export function Header() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const entry =
    Object.entries(titles).find(([path]) =>
      path === '/' ? pathname === '/' : pathname.startsWith(path),
    )?.[1] || titles['/'];

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/60 glass">
      <div className="flex h-14 items-center gap-4 px-6 lg:px-8">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-base font-semibold tracking-tight truncate">
            {entry.label}
          </h1>
          <p className="text-[11px] text-muted-foreground/70 truncate hidden sm:block">
            {entry.description}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="hidden md:flex items-center gap-1.5 mr-3 rounded-full bg-primary/8 border border-primary/15 px-3 py-1">
            <Signal className="h-3 w-3 text-primary" />
            <span className="text-[11px] font-medium text-primary/80">Connected</span>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="rounded-lg p-2 text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground transition-all duration-200"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            className="relative rounded-lg p-2 text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground transition-all duration-200"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background animate-pulse-slow" />
          </button>

          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-2 text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground transition-all duration-200"
            title="Toggle theme"
            disabled={!mounted}
          >
            <Sun
              className={cn(
                'h-4 w-4 transition-all',
                mounted && resolvedTheme === 'dark' ? 'block' : 'hidden',
              )}
            />
            <Moon
              className={cn(
                'h-4 w-4 transition-all',
                mounted && resolvedTheme === 'light' ? 'block' : 'hidden',
              )}
            />
          </button>
        </div>
      </div>
    </header>
  );
}
