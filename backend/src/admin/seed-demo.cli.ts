/**
 * Fill the database with realistic demo data, for local development and demos only.
 *   pnpm --filter @qp/backend seed:demo            # create demo data (skips if it already exists)
 *   pnpm --filter @qp/backend seed:demo -- --reset # delete the previous demo data first, then create it again
 *
 * Creates (all demo accounts use the domain DEMO_DOMAIN and the password DEMO_PASSWORD):
 *   - 2 parking owners with approved KYC, 9 parking places in Chennai and Bengaluru (photos, capacity, prices; one free)
 *   - 4 drivers with vehicles
 *   - ~30 days of paid, completed bookings (owner revenue charts and admin reports fill up)
 *   - a booking in progress now for every demo vehicle (vehicle inside), a few walk-ins, and upcoming confirmed bookings
 * Only rows linked to demo accounts are ever deleted by --reset; real data is never touched.
 * Data is generated from a fixed seed, so every run produces the same places, prices and amounts.
 * Refuses to run when NODE_ENV=production.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type PlanType, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { PasswordService } from '../shared/auth/password.service';
import { validateEnv } from '../shared/config/env';
import { PrismaModule } from '../shared/database/prisma.module';
import { PrismaService } from '../shared/database/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
  ],
  providers: [PasswordService],
})
class SeedDemoModule {}

const DEMO_DOMAIN = 'demo.quickpark.test';
const DEMO_PASSWORD = 'Demo@12345';
const COMMISSION_PCT = 10;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Small deterministic PRNG (mulberry32), so reruns give the same data. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261126);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const code = () =>
  'QP' +
  Array.from({ length: 6 }, () => pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split(''))).join('');

/** Stock parking photos (same set the web app falls back to). */
const PHOTOS = [
  'photo-1506521781263-d8422e82f27a',
  'photo-1590674899484-d5640e854abe',
  'photo-1573348722427-f1d6819fdf98',
  'photo-1470224114660-3f6686c562eb',
  'photo-1621929747188-0b4dc28498d2',
  'photo-1604063155785-ee4488b8ad15',
  'photo-1545179605-1296651e9d43',
  'photo-1593280405106-e438ebe93f5b',
].map((id) => `https://images.unsplash.com/${id}?w=1200&q=75&auto=format&fit=crop`);

interface PlaceSeed {
  owner: 0 | 1;
  name: string;
  category: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  is24x7: boolean;
  isFree?: boolean;
  /** Slots per vehicle type code. */
  slots: Partial<Record<'CAR' | 'BIKE' | 'AUTO' | 'VAN', number>>;
  /** Hourly price for a car, in rupees; other plans and vehicle types are derived from it. */
  carHourly: number;
  amenities: string[];
}

const PLACES: PlaceSeed[] = [
  {
    owner: 0,
    name: 'Phoenix Marketcity Parking',
    category: 'Mall',
    address: '142 Velachery Main Rd, Velachery',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600042',
    lat: 12.9915,
    lng: 80.2167,
    is24x7: false,
    slots: { CAR: 120, BIKE: 200 },
    carHourly: 40,
    amenities: ['CCTV', 'Covered', 'EV charging', 'Wheelchair access'],
  },
  {
    owner: 0,
    name: 'T Nagar Multi-level Car Park',
    category: 'Mall',
    address: 'Thanikachalam Rd, T Nagar',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600017',
    lat: 13.0418,
    lng: 80.2341,
    is24x7: true,
    slots: { CAR: 80, BIKE: 150 },
    carHourly: 30,
    amenities: ['CCTV', 'Covered', 'Security guard'],
  },
  {
    owner: 0,
    name: 'Chennai Central Station Parking',
    category: 'Railway Station',
    address: 'Kannappar Thidal, Park Town',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600003',
    lat: 13.0827,
    lng: 80.2757,
    is24x7: true,
    slots: { CAR: 60, BIKE: 180, AUTO: 20 },
    carHourly: 25,
    amenities: ['CCTV', 'Security guard'],
  },
  {
    owner: 0,
    name: 'Tidel Park Basement Parking',
    category: 'Office',
    address: '4 Rajiv Gandhi Salai, Taramani',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600113',
    lat: 12.9894,
    lng: 80.2486,
    is24x7: false,
    slots: { CAR: 150, BIKE: 300 },
    carHourly: 20,
    amenities: ['CCTV', 'Covered', 'EV charging'],
  },
  {
    owner: 0,
    name: 'Chennai Airport Car Park',
    category: 'Airport',
    address: 'GST Rd, Meenambakkam',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600027',
    lat: 12.9941,
    lng: 80.1709,
    is24x7: true,
    slots: { CAR: 200, BIKE: 100, VAN: 20 },
    carHourly: 60,
    amenities: ['CCTV', 'Covered', 'Security guard', 'Valet'],
  },
  {
    owner: 0,
    name: 'Apollo Hospital Visitor Parking',
    category: 'Hospital',
    address: '21 Greams Lane, Thousand Lights',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600006',
    lat: 13.0627,
    lng: 80.2516,
    is24x7: true,
    slots: { CAR: 70, BIKE: 120 },
    carHourly: 30,
    amenities: ['CCTV', 'Wheelchair access'],
  },
  {
    owner: 0,
    name: 'Marina Beach Open Ground',
    category: 'Open Ground',
    address: 'Kamarajar Salai, Marina',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600005',
    lat: 13.05,
    lng: 80.2824,
    is24x7: false,
    isFree: true,
    slots: { CAR: 100, BIKE: 200 },
    carHourly: 0,
    amenities: ['Open air'],
  },
  {
    owner: 1,
    name: 'Forum Mall Koramangala Parking',
    category: 'Mall',
    address: '21 Hosur Rd, Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560095',
    lat: 12.9346,
    lng: 77.6113,
    is24x7: false,
    slots: { CAR: 140, BIKE: 220 },
    carHourly: 40,
    amenities: ['CCTV', 'Covered', 'EV charging'],
  },
  {
    owner: 1,
    name: 'Manyata Tech Park Parking',
    category: 'Office',
    address: 'Outer Ring Rd, Nagavara',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560045',
    lat: 13.045,
    lng: 77.62,
    is24x7: true,
    slots: { CAR: 250, BIKE: 400 },
    carHourly: 25,
    amenities: ['CCTV', 'Covered', 'Security guard'],
  },
];

/** Price of one unit of each plan for a car, in rupees; bikes ~35 %, autos 50 %, vans 150 % of the car price. */
const PLAN_MULT: Partial<Record<PlanType, number>> = {
  HOURLY: 1,
  DAILY: 8,
  WEEKLY: 40,
  MONTHLY: 120,
};
const TYPE_MULT = { CAR: 1, BIKE: 0.35, AUTO: 0.5, VAN: 1.5 } as const;
const paise = (rupees: number) => Math.max(500, Math.round(rupees) * 100);

const OWNERS = [
  {
    name: 'Arun Kumar',
    email: `owner@${DEMO_DOMAIN}`,
    business: 'Arun Parking Services',
    phone: '+919840012345',
    address: '12 Anna Salai, Chennai 600002',
  },
  {
    name: 'Kavya Reddy',
    email: `owner2@${DEMO_DOMAIN}`,
    business: 'Reddy Smart Parking',
    phone: '+919845067890',
    address: '45 MG Road, Bengaluru 560001',
  },
];
const DRIVERS = [
  {
    name: 'Priya Sharma',
    email: `driver@${DEMO_DOMAIN}`,
    phone: '+919876543210',
    vehicles: [
      ['CAR', 'TN09AB1234'],
      ['BIKE', 'TN09CD5678'],
    ],
  },
  {
    name: 'Rahul Verma',
    email: `driver2@${DEMO_DOMAIN}`,
    phone: '+919812345678',
    vehicles: [['CAR', 'TN10EF4321']],
  },
  {
    name: 'Meena Iyer',
    email: `driver3@${DEMO_DOMAIN}`,
    phone: '+919900112233',
    vehicles: [
      ['CAR', 'KA01GH8765'],
      ['BIKE', 'KA05JK2468'],
    ],
  },
  {
    name: 'Vikram Singh',
    email: `driver4@${DEMO_DOMAIN}`,
    phone: '+919911223344',
    vehicles: [['CAR', 'TN07LM1357']],
  },
] as const;

async function reset(prisma: PrismaService) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (!userIds.length) return;
  const locations = await prisma.parkingLocation.findMany({
    where: { owner: { userId: { in: userIds } } },
    select: { id: true },
  });
  const locIds = locations.map((l) => l.id);
  const bookingWhere = { OR: [{ userId: { in: userIds } }, { locationId: { in: locIds } }] };
  const bookingIds = (
    await prisma.booking.findMany({ where: bookingWhere, select: { id: true } })
  ).map((b) => b.id);
  await prisma.$transaction([
    prisma.dispute.deleteMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.refund.deleteMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.parkingSession.deleteMany({
      where: { OR: [{ locationId: { in: locIds } }, { bookingId: { in: bookingIds } }] },
    }),
    prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }),
    prisma.payout.deleteMany({ where: { owner: { userId: { in: userIds } } } }),
    prisma.parkingLocation.deleteMany({ where: { id: { in: locIds } } }),
    prisma.owner.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.vehicle.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  console.log(
    `Removed previous demo data (${userIds.length} accounts, ${locIds.length} places, ${bookingIds.length} bookings).`,
  );
}

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('seed:demo refuses to run with NODE_ENV=production.');
  const app = await NestFactory.createApplicationContext(SeedDemoModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    if (process.argv.includes('--reset')) await reset(prisma);
    if (await prisma.user.findFirst({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } })) {
      console.error('Demo data already exists. Run again with --reset to recreate it.');
      process.exitCode = 1;
      return;
    }

    const [types, categories, policy] = await Promise.all([
      prisma.vehicleType.findMany(),
      prisma.category.findMany(),
      prisma.cancellationPolicy.findFirst({ where: { isDefault: true } }),
    ]);
    const typeId = (c: string) => {
      const t = types.find((x) => x.code === c);
      if (!t)
        throw new Error(
          `Vehicle type ${c} is missing. Run the migrations first (pnpm --filter @qp/backend db:deploy).`,
        );
      return t.id;
    };
    const categoryId = (name: string) =>
      (categories.find((c) => c.name === name) ?? categories[0])?.id;
    if (!categories.length) throw new Error('No categories found. Run the migrations first.');
    const rules = (policy?.rules ?? [{ hoursBefore: 0, refundPct: 0 }]) as Prisma.InputJsonValue;
    const passwordHash = await app.get(PasswordService).hash(DEMO_PASSWORD);
    const now = new Date();

    // ---- Owners ----
    const owners = await Promise.all(
      OWNERS.map((o) =>
        prisma.user.create({
          data: {
            name: o.name,
            email: o.email,
            phone: o.phone,
            role: 'PARKING_OWNER',
            passwordHash,
            emailVerifiedAt: now,
            owner: {
              create: {
                businessName: o.business,
                phone: o.phone,
                address: o.address,
                panNumber: 'ABCDE1234F',
                bankAccountName: o.business,
                bankAccountNumber: '000123456789',
                bankIfsc: 'HDFC0001234',
                upiId: `${o.name.split(' ')[0]!.toLowerCase()}@okhdfc`,
                kycStatus: 'APPROVED',
                kycSubmittedAt: new Date(now.getTime() - 40 * DAY),
                kycReviewedAt: new Date(now.getTime() - 39 * DAY),
              },
            },
          },
          include: { owner: true },
        }),
      ),
    );

    // ---- Places with photos, capacity and prices ----
    const places = [];
    for (const [i, p] of PLACES.entries()) {
      const owner = owners[p.owner]!;
      const slug = `${p.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}-demo`;
      const loc = await prisma.parkingLocation.create({
        data: {
          ownerId: owner.owner!.id,
          categoryId: categoryId(p.category)!,
          cancellationPolicyId: policy?.id,
          name: p.name,
          slug,
          description: `${p.name}: secure ${p.is24x7 ? 'round-the-clock ' : ''}parking in ${p.city}. Book online and enter with your QR pass.`,
          address: p.address,
          city: p.city,
          state: p.state,
          pincode: p.pincode,
          lat: p.lat,
          lng: p.lng,
          is24x7: p.is24x7,
          openingHours: p.is24x7
            ? undefined
            : Array.from({ length: 7 }, () => ({ open: '07:00', close: '23:00', closed: false })),
          amenities: p.amenities,
          isFree: !!p.isFree,
          status: 'ACTIVE',
          submittedAt: new Date(now.getTime() - 35 * DAY),
          approvedAt: new Date(now.getTime() - 34 * DAY),
          photos: {
            create: [0, 1].map((k) => ({
              url: PHOTOS[(i * 2 + k) % PHOTOS.length]!,
              storageKey: `seed/${slug}-${k}`,
              sortOrder: k,
            })),
          },
          capacities: {
            create: Object.entries(p.slots).map(([c, total]) => ({
              vehicleTypeId: typeId(c),
              totalSlots: total,
              onlineSlots: Math.round(total * 0.7),
              overstayPerHourPaise: p.isFree
                ? 0
                : paise(p.carHourly * TYPE_MULT[c as keyof typeof TYPE_MULT] * 1.5),
            })),
          },
          prices: p.isFree
            ? undefined
            : {
                create: Object.keys(p.slots).flatMap((c) =>
                  Object.entries(PLAN_MULT).map(([plan, mult]) => ({
                    vehicleTypeId: typeId(c),
                    planType: plan as PlanType,
                    pricePaise: paise(p.carHourly * mult * TYPE_MULT[c as keyof typeof TYPE_MULT]),
                  })),
                ),
              },
        },
        include: { prices: true },
      });
      places.push({ ...loc, seed: p });
    }

    // ---- Drivers and vehicles ----
    const drivers = await Promise.all(
      DRIVERS.map((d) =>
        prisma.user.create({
          data: {
            name: d.name,
            email: d.email,
            phone: d.phone,
            role: 'VEHICLE_OWNER',
            passwordHash,
            emailVerifiedAt: now,
            vehicles: {
              create: d.vehicles.map(([c, plate]) => ({
                vehicleTypeId: typeId(c),
                plateNumber: plate,
                qrToken: randomBytes(16).toString('base64url'),
              })),
            },
          },
          include: { vehicles: true },
        }),
      ),
    );

    // ---- Bookings ----
    const paidPlaces = places.filter((p) => !p.seed.isFree);
    let idem = 0;
    let made = 0;
    let inside = 0;
    const book = async (opts: {
      status: 'COMPLETED' | 'ACTIVE' | 'CONFIRMED';
      start: Date;
      hours: number;
      paidAt: Date;
      inside?: boolean;
      /** Book with this vehicle (a vehicle can only be inside one place at a time). */
      vehicle?: (typeof drivers)[number]['vehicles'][number];
    }) => {
      const vehicle = opts.vehicle ?? pick(pick(drivers).vehicles);
      const driver = drivers.find((d) => d.id === vehicle.userId)!;
      const typeCode = types.find((t) => t.id === vehicle.vehicleTypeId)!.code;
      const place = pick(paidPlaces.filter((p) => typeCode in p.seed.slots));
      const hourly = place.prices.find(
        (x) => x.vehicleTypeId === vehicle.vehicleTypeId && x.planType === 'HOURLY',
      );
      if (!hourly) return;
      const amount = hourly.pricePaise * opts.hours;
      const booking = await prisma.booking.create({
        data: {
          code: code(),
          userId: driver.id,
          vehicleId: vehicle.id,
          locationId: place.id,
          vehicleTypeId: vehicle.vehicleTypeId,
          planType: 'HOURLY',
          quantity: opts.hours,
          startAt: opts.start,
          endAt: new Date(opts.start.getTime() + opts.hours * HOUR),
          status: opts.status,
          amountPaise: amount,
          commissionPaise: Math.round((amount * COMMISSION_PCT) / 100),
          idempotencyKey: `seed-${idem++}`,
          cancellationRules: rules,
          confirmedAt: opts.paidAt,
          createdAt: opts.paidAt,
          payments: {
            create: {
              provider: 'mock',
              providerOrderId: `seed_order_${randomUUID()}`,
              providerPaymentId: `seed_pay_${randomUUID()}`,
              amountPaise: amount,
              status: 'PAID',
              paidAt: opts.paidAt,
              createdAt: opts.paidAt,
            },
          },
        },
      });
      made++;
      if (opts.status === 'COMPLETED' || opts.inside) {
        const entryAt = new Date(opts.start.getTime() + int(0, 15) * 60_000);
        await prisma.parkingSession.create({
          data: {
            locationId: place.id,
            bookingId: booking.id,
            vehicleId: vehicle.id,
            vehicleTypeId: vehicle.vehicleTypeId,
            plateNumber: vehicle.plateNumber,
            entryAt,
            exitAt:
              opts.status === 'COMPLETED'
                ? new Date(booking.endAt.getTime() - int(0, 20) * 60_000)
                : null,
            enteredById: place.ownerId === owners[0]!.owner!.id ? owners[0]!.id : owners[1]!.id,
          },
        });
        if (opts.inside) inside++;
      }
    };

    // Past 30 days: 3–7 completed bookings a day.
    for (let d = 29; d >= 1; d--) {
      for (let k = int(3, 7); k > 0; k--) {
        const start = new Date(now.getTime() - d * DAY);
        start.setHours(int(8, 19), pick([0, 15, 30, 45]), 0, 0);
        await book({
          status: 'COMPLETED',
          start,
          hours: int(1, 4),
          paidAt: new Date(start.getTime() - int(1, 48) * HOUR),
        });
      }
    }
    // Today: in progress now, with the vehicle inside (each vehicle at most once).
    for (const vehicle of drivers.flatMap((d) => d.vehicles)) {
      const start = new Date(now.getTime() - int(15, 120) * 60_000);
      await book({
        status: 'ACTIVE',
        start,
        hours: int(2, 5),
        paidAt: new Date(start.getTime() - int(10, 90) * 60_000),
        inside: true,
        vehicle,
      });
    }
    // Upcoming: confirmed for the next few days.
    for (let k = 0; k < 10; k++) {
      const start = new Date(now.getTime() + int(2, 96) * HOUR);
      start.setMinutes(0, 0, 0);
      await book({
        status: 'CONFIRMED',
        start,
        hours: int(1, 6),
        paidAt: new Date(now.getTime() - int(1, 300) * 60_000),
      });
    }
    // Walk-ins currently inside (no booking, cash at exit).
    for (let k = 0; k < 5; k++) {
      const place = pick(paidPlaces);
      const c = pick(Object.keys(place.seed.slots));
      await prisma.parkingSession.create({
        data: {
          locationId: place.id,
          vehicleTypeId: typeId(c),
          isWalkIn: true,
          entryAt: new Date(now.getTime() - int(10, 180) * 60_000),
          plateNumber: `TN${int(1, 99).toString().padStart(2, '0')}${pick(['AA', 'BK', 'CX', 'DZ'])}${int(1000, 9999)}`,
          enteredById: place.ownerId === owners[0]!.owner!.id ? owners[0]!.id : owners[1]!.id,
        },
      });
      inside++;
    }

    console.log(
      [
        `Demo data created: ${owners.length} owners, ${places.length} places, ${drivers.length} drivers, ${made} bookings, ${inside} vehicles inside now.`,
        '',
        `Sign in with any of these (password: ${DEMO_PASSWORD}):`,
        ...OWNERS.map((o) => `  Parking owner  ${o.email}`),
        ...DRIVERS.map((d) => `  Driver         ${d.email}`),
      ].join('\n'),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
