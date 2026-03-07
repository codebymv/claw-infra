'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  DollarSign,
  Cpu,
  Settings,
  GitPullRequest,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agents', label: 'Agent Runs', icon: Bot },
  { href: '/costs', label: 'Cost Analytics', icon: DollarSign },
  { href: '/code', label: 'Code', icon: GitPullRequest },
  { href: '/resources', label: 'Resources', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-border bg-card/80 glass',
        'transform transition-transform duration-300 ease-out',
        // Hidden off-screen on mobile unless open; always visible on lg+
        isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0',
      )}
      aria-label="Sidebar navigation"
    >
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-primary/30 via-primary/10 to-transparent" />

      <div className="flex h-16 items-center gap-3 px-5">
        <Image
          src="/clawinfra-icon.png"
          alt="ClawInfra"
          width={32}
          height={32}
          className="logo-adaptive shrink-0"
        />
        <Image
          src="/clawinfra-text.png"
          alt="ClawInfra"
          width={110}
          height={22}
          className="logo-adaptive"
        />
      </div>

      <div className="mx-5 h-px bg-gradient-to-r from-border via-border/50 to-transparent" />

      <nav className="flex-1 overflow-y-auto py-5 px-3">
        <p className="px-3 mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Navigation
        </p>
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onCloseMobile}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary glow-sm-primary" />
                  )}
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
                      active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
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
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse-slow" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              System Online
            </p>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            ClawInfra v0.1.0
          </p>
        </div>
      </div>
    </aside>
  );
}
