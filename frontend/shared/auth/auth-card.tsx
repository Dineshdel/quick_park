'use client';

import { Car, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n/i18n';
import type { MessageKey } from '@/shared/i18n/messages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

const PERKS: { icon: typeof Car; text: MessageKey }[] = [
  { icon: ShieldCheck, text: 'auth.perk1' },
  { icon: Wallet, text: 'auth.perk2' },
  { icon: QrCode, text: 'auth.perk3' },
];

/** Sign-in / sign-up frame: a midnight brand panel beside the form on large screens. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[1fr_440px] lg:items-center lg:py-16">
      <aside className="bg-midnight relative hidden overflow-hidden rounded-2xl p-10 text-chrome-foreground shadow-premium-lg lg:block">
        <div className="bg-dots absolute inset-0" aria-hidden />
        <div className="relative grid gap-8">
          <span className="bg-gold-gradient flex size-12 items-center justify-center rounded-xl text-gold-foreground shadow-lg shadow-black/20">
            <Car className="size-6" aria-hidden />
          </span>
          <div className="grid gap-3">
            <p className="font-serif text-3xl leading-tight font-semibold text-white">
              {t('auth.taglineBefore')}
              <span className="text-gold-gradient italic">{t('auth.taglineAccent')}</span>
              {t('auth.taglineAfter')}
            </p>
            <p className="text-chrome-muted">{t('auth.sub')}</p>
          </div>
          <ul className="grid gap-4">
            {PERKS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-sm">
                <span className="flex size-9 items-center justify-center rounded-lg border border-gold/25 bg-white/5 text-gold-light">
                  <p.icon className="size-4" aria-hidden />
                </span>
                {t(p.text)}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <Card className="shadow-premium-lg">
        <CardHeader className="gap-2">
          <CardTitle className="text-2xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
