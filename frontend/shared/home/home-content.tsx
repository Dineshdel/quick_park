'use client';

import { CalendarCheck, Clock, MapPin, QrCode, Search, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { useT } from '@/shared/i18n/i18n';
import type { MessageKey } from '@/shared/i18n/messages';
import { SearchBar } from '@/shared/search/search-bar';
import { Button } from '@/shared/ui/button';

const STEPS: { icon: typeof Search; title: MessageKey; text: MessageKey }[] = [
  { icon: Search, title: 'home.step1Title', text: 'home.step1Text' },
  { icon: CalendarCheck, title: 'home.step2Title', text: 'home.step2Text' },
  { icon: QrCode, title: 'home.step3Title', text: 'home.step3Text' },
];

const HIGHLIGHTS: { icon: typeof Search; text: MessageKey }[] = [
  { icon: MapPin, text: 'home.hl1' },
  { icon: Clock, text: 'home.hl2' },
  { icon: Wallet, text: 'home.hl3' },
];

/** Home page body (client, so it follows the chosen language). */
export function HomeContent() {
  const t = useT();
  return (
    <div>
      {/* Hero: midnight panel with a soft glow and dot texture; the search card overlaps its lower edge. */}
      <section className="bg-midnight relative overflow-hidden text-chrome-foreground">
        <div className="bg-dots absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-5xl gap-6 px-4 pt-20 pb-32 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-gold-light backdrop-blur">
            <ShieldCheck className="size-3.5" aria-hidden /> {t('home.badge')}
          </p>
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-white sm:text-6xl">
            {t('home.titleBefore')}
            <span className="text-gold-gradient italic">{t('home.titleAccent')}</span>
            {t('home.titleAfter')}
          </h1>
          <p className="mx-auto max-w-xl text-lg text-chrome-muted">
            {t('home.subtitle')}
          </p>
          <ul className="mx-auto mt-2 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-chrome-foreground/80">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-2">
                <h.icon className="size-4 text-gold-light" aria-hidden /> {t(h.text)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-20 px-4">
        <div className="relative -mt-24 text-foreground">
          <Suspense>
            <SearchBar />
          </Suspense>
        </div>

        <section className="grid gap-6">
          <div className="grid gap-2 text-center">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-gold-deep uppercase">{t('home.stepsKicker')}</p>
            <h2 className="font-serif text-3xl font-semibold">{t('home.stepsTitle')}</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="group shadow-premium relative grid gap-3 overflow-hidden rounded-2xl border bg-card p-7 transition-all hover:-translate-y-0.5 hover:shadow-premium-lg">
                <span className="bg-gold-gradient absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                <div className="flex items-center justify-between gap-3">
                  <span className="bg-midnight flex size-11 items-center justify-center rounded-xl text-gold-light shadow-md shadow-primary/20">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-serif text-4xl font-semibold text-border">0{i + 1}</span>
                </div>
                <h3 className="font-serif text-lg font-semibold">{t(s.title)}</h3>
                <p className="text-sm text-muted-foreground">{t(s.text)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-midnight shadow-premium-lg relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl p-12 text-center text-chrome-foreground">
          <div className="bg-dots absolute inset-0" aria-hidden />
          <h2 className="relative font-serif text-3xl font-semibold text-white">
            {t('home.ownerBefore')}
            <span className="text-gold-gradient italic">{t('home.ownerAccent')}</span>
            {t('home.ownerAfter')}
          </h2>
          <p className="relative max-w-lg text-chrome-muted">{t('home.ownerText')}</p>
          <Button asChild size="lg" variant="gold" className="relative mt-3">
            <Link href="/register?role=PARKING_OWNER">{t('home.ownerCta')}</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
