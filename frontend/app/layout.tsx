import type { Metadata } from 'next';
import { Inter, Lora, Noto_Sans_Devanagari, Noto_Sans_Tamil } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/shared/i18n/i18n';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from '@/shared/i18n/messages';
import { SiteFooter } from '@/shared/layout/site-footer';
import { SiteHeader } from '@/shared/layout/site-header';
import { Providers } from '@/shared/providers';
import { ThemeProvider } from '@/shared/theme/theme';
import { isThemeChoice, THEME_BOOT_SCRIPT, THEME_COOKIE } from '@/shared/theme/theme-config';
import './globals.css';

const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const heading = Lora({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['500', '600', '700'],
  display: 'swap',
});
// Tamil and Hindi scripts (Inter/Lora have no glyphs for them); only downloaded when those characters appear.
const tamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  variable: '--font-tamil',
  display: 'swap',
  preload: false,
});
const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-devanagari',
  display: 'swap',
  preload: false,
});

/** Public site address, used for absolute links in link previews (first WEB_ORIGIN from the root .env). */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.WEB_ORIGIN?.split(',')[0]?.trim() ||
  'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Quick Park', template: '%s · Quick Park' },
  description: 'Find and book parking near you or in any city.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Language and day/night choice are remembered in cookies, so the first render already matches them.
  const jar = await cookies();
  const lang = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const themeCookie = jar.get(THEME_COOKIE)?.value;
  const theme = isThemeChoice(themeCookie) ? themeCookie : 'system';

  return (
    <html
      lang={locale}
      className={`${body.variable} ${heading.variable} ${tamil.variable} ${devanagari.variable}${theme === 'dark' ? ' dark' : ''}`}
      style={theme === 'system' ? undefined : { colorScheme: theme }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <ThemeProvider initialChoice={theme}>
          <I18nProvider initialLocale={locale}>
            <Providers>
              <SiteHeader />
              <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
              <SiteFooter />
            </Providers>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
