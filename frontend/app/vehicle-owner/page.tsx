'use client';

import type { BookingDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, Car, MapPin, QrCode, Search } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { fmtDateTime, formatRupees, planLabel, STATUS_LABEL } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Tilt } from '@/shared/ui/tilt';
import { useVehicles } from './_components/use-vehicles';

/** The booking that matters most right now: parked first, otherwise the next upcoming one. */
function useNextBooking() {
  return useQuery({
    queryKey: ['bookings', 'next'],
    queryFn: async () => {
      const [active, upcoming] = await Promise.all([
        api<BookingDto[]>('/bookings?tab=active'),
        api<BookingDto[]>('/bookings?tab=upcoming'),
      ]);
      return active[0] ?? upcoming[0] ?? null;
    },
  });
}

/** Entry pass for the next booking, styled as a raised ticket with a punched notch and a QR stub. */
function PassCard({ b }: { b: BookingDto }) {
  const parked = b.status === 'ACTIVE';
  return (
    <Tilt max={7} className="float">
      <Link
        href={`/vehicle-owner/bookings/${b.id}`}
        className="bg-aurora relative grid overflow-hidden rounded-2xl text-chrome-foreground shadow-premium-lg sm:grid-cols-[1fr_auto]"
      >
        <div className="grid gap-4 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-gold-light">
            <span
              className={`inline-block size-2 rounded-full ${parked ? 'qp-live bg-success' : 'bg-gold'}`}
            />
            {parked ? 'You are parked' : 'Next booking'} · {STATUS_LABEL[b.status]}
          </div>
          <div>
            <p className="text-2xl font-bold text-chrome-strong">{b.location.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-chrome-muted">
              <MapPin className="size-3.5" aria-hidden /> {b.location.address}, {b.location.city}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-chrome-muted">From</dt>
              <dd className="font-medium text-chrome-strong">{fmtDateTime(b.startAt)}</dd>
            </div>
            <div>
              <dt className="text-chrome-muted">Until</dt>
              <dd className="font-medium text-chrome-strong">{fmtDateTime(b.endAt)}</dd>
            </div>
            <div>
              <dt className="text-chrome-muted">Plan</dt>
              <dd className="font-medium text-chrome-strong">
                {planLabel(b.planType, b.quantity)} · {formatRupees(b.amountPaise)}
              </dd>
            </div>
          </dl>
        </div>
        {/* Tear-off stub */}
        <div className="relative flex flex-col items-center justify-center gap-2 border-t border-dashed border-chrome-line p-6 sm:border-t-0 sm:border-l">
          <span className="absolute -top-3 -left-3 hidden size-6 rounded-full bg-background sm:block" />
          <span className="absolute -bottom-3 -left-3 hidden size-6 rounded-full bg-background sm:block" />
          <span className="flex size-20 items-center justify-center rounded-xl bg-white text-[#1b2540] shadow-[0_10px_24px_-8px_rgb(0_0_0/0.6)]">
            <QrCode className="size-14" aria-hidden />
          </span>
          <span className="font-mono text-sm tracking-widest text-gold-light">{b.code}</span>
          <span className="flex items-center gap-1 text-xs text-chrome-muted">
            Show pass <ArrowRight className="size-3" aria-hidden />
          </span>
        </div>
      </Link>
    </Tilt>
  );
}

/** A number plate with embossed lettering and a raised rim. */
function Plate({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-md border-2 border-[#1b2540] bg-gradient-to-b from-white to-[#e9ecf2] px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-[#1b2540] shadow-[0_3px_0_#1b2540,0_8px_14px_-6px_rgb(0_0_0/0.5)] [text-shadow:0_1px_0_rgb(255_255_255/0.8)]">
      {text}
    </span>
  );
}

function ActionTile({
  href,
  icon,
  title,
  text,
  cta,
  children,
  gold,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
  cta: string;
  children?: ReactNode;
  gold?: boolean;
}) {
  return (
    <Tilt className="h-full">
      <Card className="group flex h-full flex-col gap-4 p-6 hover:shadow-premium-lg">
        <span
          className={`flex size-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-6deg] [&_svg]:size-6 ${gold ? 'icon-3d-gold text-gold-foreground' : 'icon-3d text-gold-light'}`}
        >
          {icon}
        </span>
        <div className="grid gap-1">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
        {children}
        <Button asChild variant={gold ? 'gold' : 'outline'} className="qp-shine mt-auto w-fit">
          <Link href={href}>
            {cta} <ArrowRight />
          </Link>
        </Button>
      </Card>
    </Tilt>
  );
}

export default function VehicleOwnerHome() {
  const s = useSession();
  const name = s.status === 'authenticated' ? s.user.name.split(' ')[0] : '';
  const vehicles = useVehicles();
  const next = useNextBooking();
  const count = vehicles.data?.length ?? 0;

  return (
    <PageShell title={`Hi ${name}`} description="Find parking, book it and enter with a QR code.">
      {next.data && <PassCard b={next.data} />}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          <ActionTile
            key="find"
            gold
            href="/search"
            icon={<Search />}
            title="Find parking"
            text="Search near you or at your destination and book in a minute."
            cta="Search"
          />,
          <ActionTile
            key="veh"
            href="/vehicle-owner/vehicles"
            icon={<Car />}
            title="My vehicles"
            text={
              vehicles.isPending
                ? 'Loading…'
                : count === 0
                  ? 'Add a vehicle to get its QR sticker.'
                  : `${count} vehicle${count === 1 ? '' : 's'} registered.`
            }
            cta={count === 0 ? 'Add a vehicle' : 'Manage vehicles'}
          >
            {count > 0 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {vehicles.data!.slice(0, 3).map((v) => (
                  <Plate key={v.id} text={formatPlate(v.plateNumber)} />
                ))}
                {count > 3 && (
                  <span className="self-center text-sm text-muted-foreground">+{count - 3}</span>
                )}
              </div>
            )}
          </ActionTile>,
          <ActionTile
            key="bk"
            href="/vehicle-owner/bookings"
            icon={<CalendarClock />}
            title="My bookings"
            text="Upcoming, active and past bookings with your entry pass."
            cta="Open bookings"
          />,
        ].map((t, i) => (
          <div key={i} className="rise-in" style={{ '--i': i + 1 } as CSSProperties}>
            {t}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
