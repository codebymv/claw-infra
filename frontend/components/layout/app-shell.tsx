'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileSidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileSidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-mesh">
      {/* Mobile overlay — sits below sidebar (z-40) so sidebar (z-50) renders on top */}
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <Sidebar
        isMobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main content — on mobile takes full width; on desktop offset by sidebar */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:pl-[260px]">
        <Header onMenuClick={() => setMobileSidebarOpen((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto dot-grid">
          {/* Responsive padding: tight on phones, comfortable on tablet+, spacious on desktop */}
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
