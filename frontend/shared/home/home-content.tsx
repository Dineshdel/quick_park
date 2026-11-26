'use client';

import { ArrowRight, Clock, MapPin, QrCode, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useT } from '@/shared/i18n/i18n';
import type { MessageKey } from '@/shared/i18n/messages';
import { SearchBar } from '@/shared/search/search-bar';
import { CategoryGrid, PopularRow } from './app-sections';
import { Beams, DeckFloor, Orbs, Sparks } from '@/shared/ui/atmosphere';
import { Button } from '@/shared/ui/button';
import { Tilt } from '@/shared/ui/tilt';

const STEPS: { title: MessageKey; text: MessageKey }[] = [
  { title: 'home.step1Title', text: 'home.step1Text' },
  { title: 'home.step2Title', text: 'home.step2Text' },
  { title: 'home.step3Title', text: 'home.step3Text' },
];

const HIGHLIGHTS: { icon: typeof MapPin; text: MessageKey }[] = [
  { icon: MapPin, text: 'home.hl1' },
  { icon: Clock, text: 'home.hl2' },
  { icon: Wallet, text: 'home.hl3' },
];

const BAY_W = 60;
const BAYS = 8;
/** Which bays are taken in the drawing (top row, bottom row). Bottom bay 5 is "yours". */
const TOP_TAKEN = [true, true, false, true, true, true, false, true];
const BOTTOM_TAKEN = [true, false, true, true, true, false, true, true];
const YOUR_BAY = 5;
const CAR_TONES = ['#bfdbfe', '#94a3b8', '#cbd5e1', '#64748b', '#7dd3fc'];

/** A parked car seen from above, centred on (0,0), nose pointing right (+x). */
function CarTopDown({ fill, nose = '#0f1e3d' }: { fill: string; nose?: string }) {
  return (
    <g>
      <rect x={-34} y={-17} width={68} height={34} rx={9} fill={fill} />
      <rect x={6} y={-13} width={13} height={26} rx={3} fill={nose} opacity={0.75} />
      <rect x={-22} y={-13} width={9} height={26} rx={3} fill={nose} opacity={0.55} />
    </g>
  );
}

/**
 * Top-down car park: painted bays either side of an aisle. One bay is outlined in gold and a car pulls into
 * it once when the page loads (CSS in globals.css, skipped when the visitor prefers reduced motion).
 */
function CarParkIllustration() {
  const bay = (row: 'top' | 'bottom', i: number, taken: boolean) => {
    const x = 24 + i * BAY_W;
    const y = row === 'top' ? 40 : 228;
    const mine = row === 'bottom' && i === YOUR_BAY;
    return (
      <g key={`${row}${i}`}>
        {mine && (
          <rect
            x={x + 4}
            y={y + 4}
            width={BAY_W - 8}
            height={84}
            rx={4}
            fill="oklch(0.78 0.192 254 / 0.14)"
            stroke="oklch(0.6 0.21 253)"
            strokeWidth={2.5}
          />
        )}
        {taken && !mine && (
          <g
            transform={`translate(${x + BAY_W / 2} ${y + 46}) rotate(${row === 'top' ? -90 : 90})`}
          >
            <CarTopDown fill={CAR_TONES[(i + (row === 'top' ? 0 : 2)) % CAR_TONES.length]!} />
          </g>
        )}
      </g>
    );
  };
  return (
    <svg
      viewBox="0 0 528 360"
      className="h-auto w-full"
      role="img"
      aria-label="A car park seen from above, with one bay reserved for you and a car pulling into it"
    >
      <defs>
        <linearGradient id="qp-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--deck-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--deck-bottom)' }} />
        </linearGradient>
      </defs>
      <rect
        width={528}
        height={360}
        rx={20}
        fill="url(#qp-deck)"
        style={{ stroke: 'var(--deck-edge)' }}
      />
      {/* Bay lines: the paint on the tarmac. */}
      <g style={{ stroke: 'var(--deck-line)' }} strokeWidth={2}>
        {Array.from({ length: BAYS + 1 }, (_, i) => (
          <line key={`t${i}`} x1={24 + i * BAY_W} y1={40} x2={24 + i * BAY_W} y2={132} />
        ))}
        {Array.from({ length: BAYS + 1 }, (_, i) => (
          <line key={`b${i}`} x1={24 + i * BAY_W} y1={228} x2={24 + i * BAY_W} y2={320} />
        ))}
        <line x1={24} y1={132} x2={504} y2={132} strokeWidth={1} />
        <line x1={24} y1={228} x2={504} y2={228} strokeWidth={1} />
      </g>
      {/* Aisle: dashed centre line and a direction arrow. */}
      <line
        x1={24}
        y1={180}
        x2={504}
        y2={180}
        stroke="oklch(0.62 0.2 253 / 0.55)"
        strokeWidth={2}
        strokeDasharray="14 12"
      />
      <path
        d="M440 168 l18 12 l-18 12"
        fill="none"
        stroke="oklch(0.5 0.15 248 / 0.4)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {TOP_TAKEN.map((t, i) => bay('top', i, t))}
      {BOTTOM_TAKEN.map((t, i) => bay('bottom', i, t))}
      {/* Bay number painted on the tarmac in front of your bay. */}
      <text
        x={24 + YOUR_BAY * BAY_W + BAY_W / 2}
        y={344}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill="oklch(0.5 0.21 252)"
        className="qp-bay-label"
      >
        B14 reserved for you
      </text>
      {/* Your car, arriving. */}
      <g className="qp-car">
        <CarTopDown fill="oklch(0.66 0.21 253)" nose="#0c2a5b" />
      </g>
    </svg>
  );
}

/**
 * 3D stage for the hero drawing: the deck leans toward the pointer anywhere in the hero (mouse/pen only,
 * skipped for reduced motion) by setting --px/--py, which the .qp-hero-plane transform reads.
 */
function HeroStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = ref.current;
    const hero = stage?.closest('section');
    if (!stage || !hero) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = hero.getBoundingClientRect();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        stage.style.setProperty('--px', `${(e.clientX - r.left) / r.width - 0.5}`);
        stage.style.setProperty('--py', `${(e.clientY - r.top) / r.height - 0.5}`);
      });
    };
    const leave = () => {
      stage.style.setProperty('--px', '0');
      stage.style.setProperty('--py', '0');
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
    };
  }, []);
  return (
    <div ref={ref} className="qp-hero-3d relative mx-auto w-full max-w-[560px]">
      {children}
    </div>
  );
}

/** Home page body (client, so it follows the chosen language). */
export function HomeContent() {
  const t = useT();
  return (
    <div>
      <section className="bg-aurora relative overflow-hidden text-chrome-foreground">
        <DeckFloor tilt={65} />
        <Orbs dense />
        <Beams />
        <Sparks />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-32 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="grid gap-5">
            <span className="glass rise-in inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-chrome-foreground">
              <span className="qp-live size-1.5 rounded-full bg-gold" aria-hidden />
              {t('home.badge')}
            </span>
            <h1 className="rise-in max-w-[16ch] text-[2.75rem] leading-[1.02] text-chrome-strong [--i:1] sm:text-6xl">
              {t('home.titleBefore')}
              <span className="text-gold-gradient">{t('home.titleAccent')}</span>
              {t('home.titleAfter')}
            </h1>
            <p className="rise-in max-w-[46ch] text-lg leading-relaxed text-chrome-muted [--i:2]">
              {t('home.subtitle')}
            </p>
            <ul className="grid gap-2.5 text-[0.95rem] text-chrome-foreground/90">
              {HIGHLIGHTS.map((h, i) => (
                <li
                  key={h.text}
                  className="rise-in flex items-center gap-3"
                  style={{ '--i': i + 3 } as CSSProperties}
                >
                  <span className="glass flex size-7 items-center justify-center rounded-lg">
                    <h.icon className="size-3.5 text-gold-light" aria-hidden />
                  </span>
                  {t(h.text)}
                </li>
              ))}
            </ul>
          </div>
          <HeroStage>
            {/* Gold light pooling on the "floor" under the tipped-back deck. */}
            <div
              className="absolute inset-x-8 bottom-0 h-24 rounded-[50%] bg-gold/25 blur-3xl"
              aria-hidden
            />
            <div className="qp-hero-plane relative">
              <CarParkIllustration />
              {/* Glass chips floating above the deck at different depths. */}
              <div
                className="qp-chip glass -top-5 right-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-chrome-strong"
                style={{ '--z': '90px' } as CSSProperties}
                aria-hidden
              >
                <span className="icon-3d-gold flex size-6 items-center justify-center rounded-md text-gold-foreground">
                  <QrCode className="size-3.5" />
                </span>
                {t('home.chipPass')}
              </div>
              <div
                className="qp-chip glass bottom-10 -left-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-chrome-strong"
                style={{ '--z': '60px', '--d': '-2.5s' } as CSSProperties}
                aria-hidden
              >
                <span className="qp-live size-2 rounded-full bg-success" />
                {t('home.chipLive')}
              </div>
            </div>
          </HeroStage>
        </div>
        <div className="hairline-gold absolute inset-x-0 bottom-0 h-px opacity-60" aria-hidden />
      </section>

      <div className="mx-auto grid max-w-6xl gap-24 px-4">
        <div className="relative -mt-20 text-foreground [&>*]:rounded-3xl [&>*]:shadow-premium-lg">
          <Suspense>
            <SearchBar />
          </Suspense>
        </div>

        <div className="-mt-8 grid gap-16">
          <CategoryGrid />
          <PopularRow />
        </div>

        {/* A real sequence, so the steps are numbered and read in order; each card leans toward the pointer. */}
        <section className="qp-reveal grid gap-10">
          <div className="grid gap-2">
            <p className="text-sm font-semibold tracking-[0.14em] text-gold-deep uppercase">
              {t('home.stepsKicker')}
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">{t('home.stepsTitle')}</h2>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rise-in" style={{ '--i': i } as CSSProperties}>
                <Tilt max={10} className="h-full">
                  <div className="surface-3d group relative grid h-full content-start gap-3 overflow-hidden rounded-2xl border bg-card p-6 [transform-style:preserve-3d]">
                    <span className="qp-numeral" aria-hidden>
                      {i + 1}
                    </span>
                    <span
                      className="bg-gold-gradient absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                    <span className="icon-3d relative flex size-11 items-center justify-center rounded-xl text-base font-bold text-primary transition-transform duration-300 [transform:translateZ(30px)] group-hover:-translate-y-1">
                      {i + 1}
                    </span>
                    <h3 className="relative text-xl font-bold [transform:translateZ(20px)]">
                      {t(s.title)}
                    </h3>
                    <p className="relative max-w-[34ch] leading-relaxed text-muted-foreground [transform:translateZ(10px)]">
                      {t(s.text)}
                    </p>
                  </div>
                </Tilt>
              </li>
            ))}
          </ol>
        </section>

        <section className="qp-reveal qp-ring mb-4 rounded-2xl">
          <div className="bg-midnight relative grid items-center gap-6 overflow-hidden rounded-2xl p-8 text-chrome-foreground sm:grid-cols-[1fr_auto] sm:p-10">
            <DeckFloor tilt={70} />
            <Orbs />
            <div className="relative grid gap-2">
              <h2 className="text-2xl font-bold text-chrome-strong sm:text-3xl">
                {t('home.ownerBefore')}
                <span className="text-gold-gradient">{t('home.ownerAccent')}</span>
                {t('home.ownerAfter')}
              </h2>
              <p className="max-w-[52ch] leading-relaxed text-chrome-muted">
                {t('home.ownerText')}
              </p>
            </div>
            <Button asChild size="lg" variant="gold" className="relative">
              <Link href="/register?role=PARKING_OWNER">
                {t('home.ownerCta')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
