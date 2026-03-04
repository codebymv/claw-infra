'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Moon, Sun, Bell, RefreshCw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/agents': 'Agent Runs',
  '/costs': 'Cost Analytics',
  '/resources': 'Resource Monitor',
  '/settings': 'Settings',
};

export function Header() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const title =
    Object.entries(titles).find(([path]) =>
      path === '/' ? pathname === '/' : pathname.startsWith(path),
    )?.[1] || 'Dashboard';

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/80 backdrop-blur px-6">
      <h1 className="flex-1 text-lg font-semibold">{title}</h1>

      <div className="flex items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        <button
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors relative"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        </button>

        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
    </header>
  );
}
