'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Moon, Sun, Bell, RefreshCw, Signal, WifiOff, Loader2, Menu } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useWebSocket, type WsStatus } from '@/hooks/useWebSocket';
import Image from 'next/image';

const titles: Record<string, { label: string; description: string }> = {
  '/': { label: 'Dashboard', description: 'System overview & real-time metrics' },
  '/agents': { label: 'Agent Runs', description: 'Monitor and inspect agent executions' },
  '/costs': { label: 'Cost Analytics', description: 'Spending trends & budget tracking' },
  '/resources': { label: 'Resources', description: 'CPU, memory & network utilization' },
  '/settings': { label: 'Settings', description: 'API keys, budgets & configuration' },
};

const wsConfig: Record<WsStatus, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  connected:    { label: 'Connected',    className: 'bg-primary/10 border-primary/20 text-primary',                                  icon: Signal   },
  connecting:   { label: 'Connecting…',  className: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',        icon: Loader2  },
  reconnecting: { label: 'Reconnecting', className: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',        icon: RefreshCw },
  disconnected: { label: 'Offline',      className: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',            icon: WifiOff  },
  error:        { label: 'Error',        className: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',            icon: WifiOff  },
  failed:       { label: 'Failed',       className: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',            icon: WifiOff  },
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { status } = useWebSocket();

  useEffect(() => {
    setMounted(true);
  }, []);

  const entry =
    Object.entries(titles).find(([path]) =>
      path === '/' ? pathname === '/' : pathname.startsWith(path),
    )?.[1] || titles['/'];

  const ws = wsConfig[status];
  const WsIcon = ws.icon;

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

        {/* Brand icon — only visible on mobile, between hamburger and page title */}
        <Image
          src="/clawinfra-icon.png"
          alt="ClawInfra"
          width={24}
          height={24}
          className="logo-adaptive shrink-0 lg:hidden"
        />

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
          {/* Live WS status badge */}
          <div
            className={cn(
              'hidden md:flex items-center gap-1.5 mr-3 rounded-full border px-3 py-1 transition-all duration-300',
              ws.className,
            )}
          >
            <WsIcon
              className={cn(
                'h-3 w-3',
                (status === 'connecting' || status === 'reconnecting') && 'animate-spin',
              )}
            />
            <span className="text-[11px] font-medium">{ws.label}</span>
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
