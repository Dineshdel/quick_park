import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/shared/layout/site-header';
import { Providers } from '@/shared/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Quick Park', template: '%s · Quick Park' },
  description: 'Find and book parking near you or in any city.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <SiteHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
