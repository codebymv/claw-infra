'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Moon, Sun, Bell, RefreshCw, Signal, Menu } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const titles: Record<string, { label: string; description: string }> = {
  '/': { label: 'Dashboard', description: 'System overview & real-time metrics' },
  '/agents': { label: 'Agent Runs', description: 'Monitor and inspect agent executions' },
  '/costs': { label: 'Cost Analytics', description: 'Spending trends & budget tracking' },
  '/resources': { label: 'Resources', description: 'CPU, memory & network utilization' },
  '/settings': { label: 'Settings', description: 'API keys, budgets & configuration' },
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/60 glass">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Hamburger — only visible on mobile */}
        <button
          onClick={onMenuClick}
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200 lg:hidden"
          aria-label="Open navigation menu"
          title="Menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Page title — truncates cleanly on narrow viewports */}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-sm font-semibold tracking-tight truncate sm:text-base">
            {entry.label}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
            {entry.description}
          </p>
        </div>

        {/* Actions — shrink-0 prevents them being squeezed off-screen */}
        <div className="flex shrink-0 items-center gap-1">
          <div className="hidden md:flex items-center gap-1.5 mr-3 rounded-full bg-primary/10 border border-primary/20 px-3 py-1">
            <Signal className="h-3 w-3 text-primary" />
            <span className="text-[11px] font-medium text-primary">Connected</span>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200"
            aria-label="Refresh page"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background animate-pulse-slow" />
          </button>

          {/* Theme toggle — renders nothing until mounted to prevent hydration flash */}
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200"
            aria-label="Toggle colour theme"
            title="Toggle theme"
            disabled={!mounted}
          >
            {mounted ? (
              resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )
            ) : (
              /* Placeholder keeps button width stable before mount */
              <span className="block h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
