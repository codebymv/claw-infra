'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  DollarSign,
  Cpu,
  Settings,
  Activity,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agents', label: 'Agent Runs', icon: Bot },
  { href: '/costs', label: 'Cost Analytics', icon: DollarSign },
  { href: '/resources', label: 'Resources', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col border-r border-border/60 bg-card/80 glass">
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-primary/40 via-primary/10 to-transparent" />

      <div className="flex h-16 items-center gap-3 px-6">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <Activity className="h-4.5 w-4.5 text-primary" />
          <div className="absolute inset-0 rounded-lg animate-glow-pulse" />
        </div>
        <div>
          <p className="font-display text-sm font-bold tracking-tight text-gradient-primary">
            ZeroClaw
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            Command Center
          </p>
        </div>
      </div>

      <div className="mx-5 h-px bg-gradient-to-r from-border via-border/50 to-transparent" />

      <nav className="flex-1 overflow-y-auto py-5 px-3">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
          Navigation
        </p>
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary glow-sm-primary" />
                  )}
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
                      active ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground/80',
                    )}
                  />
                  <span className="flex-1">{label}</span>
                  {active && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-slow" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-4 pb-4">
        <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse-slow" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
              System Online
            </p>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground/50">
            ZeroClaw Infra v0.1.0
          </p>
        </div>
      </div>
    </aside>
  );
}
