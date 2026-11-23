import type { LocationDto } from '@qp/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PlaceView } from './place-view';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.WEB_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
const absolute = (url: string) => new URL(url, SITE_URL).toString();

/** Loaded on the server (cached 60 s) so search engines and link previews (WhatsApp, Google) see the place. */
const load = cache(async (slug: string): Promise<LocationDto | null> => {
  const res = await fetch(`${API}/api/v1/parkings/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } }).catch(() => null);
  return res?.ok ? ((await res.json()) as LocationDto) : null;
});

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ vehicleType?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return { title: 'Parking not found' };
  const cheapest = p.prices.filter((x) => x.isActive).sort((a, b) => a.pricePaise - b.pricePaise)[0];
  const from = cheapest ? ` from ₹${Math.round(cheapest.pricePaise / 100)}` : '';
  const description = `${p.category.name} parking at ${p.address}, ${p.city}${from}. ${p.is24x7 ? 'Open 24×7. ' : ''}Book online and enter with a QR code.`;
  const title = `${p.name}, ${p.city}`;
  return {
    title,
    description,
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title, description, type: 'website', images: p.photos[0] ? [{ url: p.photos[0].url }] : undefined },
  };
}

export default async function PlacePage({ params, searchParams }: Props) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const { vehicleType } = await searchParams;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ParkingFacility',
    name: p.name,
    description: p.description ?? undefined,
    address: { '@type': 'PostalAddress', streetAddress: p.address, addressLocality: p.city, postalCode: p.pincode ?? undefined, addressCountry: 'IN' },
    geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng },
    image: p.photos.map((ph) => absolute(ph.url)),
    url: absolute(`/p/${p.slug}`),
    openingHours: p.is24x7 ? 'Mo-Su 00:00-23:59' : undefined,
  };
  return (
    <>
      {/* Structured data for search engines; JSON.stringify output cannot break out of the script tag once < is escaped. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <PlaceView initial={p} wantedType={vehicleType} />
    </>
  );
}
