import type { Metadata } from 'next';
import { Outfit, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ThemeProvider } from '@/components/layout/theme-provider';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ZeroClaw Dashboard',
  description: 'Monitor ZeroClaw agent processes, costs, and resources',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${dmSans.variable} ${jetbrains.variable} font-sans`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="noise">
            <div className="flex h-screen overflow-hidden bg-gradient-mesh">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden pl-[260px]">
                <Header />
                <main className="flex-1 overflow-y-auto dot-grid">
                  <div className="p-6 lg:p-8">
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
