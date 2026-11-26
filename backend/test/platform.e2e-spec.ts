import { createHmac } from 'node:crypto';
import { AvailabilityService } from '../src/shared/availability/availability.service';
import { PAYMENT_PROVIDER, RazorpayPaymentProvider } from '../src/shared/payments/payment-provider';
import { PaymentsService } from '../src/shared/payments/payments.service';
import { SchedulerService } from '../src/shared/scheduler/scheduler.service';
import {
  API,
  bearer,
  createTestApp,
  createUser,
  freshIp,
  login,
  type TestContext,
} from './helpers';

/**
 * End-to-end platform flow (plan M4–M12): owner onboarding → KYC approval → place setup → place approval →
 * search → quote → book (row lock + idempotency) → pay (mock webhook) → pass → gate entry/exit + overstay →
 * cancel + refund → scheduler → earnings, payouts, reports → disputes. Plus ownership and concurrency checks.
 */
let ctx: TestContext;
let admin: string;
let owner: string;
let otherOwner: string;
let customer: string;
let car: string;
let bike: string;
let category: string;
let locationId: string;
let slug: string;
let vehicleId: string;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const PDF = Buffer.from('%PDF-1.4\n%fake test document\n');

const as = (token: string) => ({
  get: (p: string) =>
    ctx.http().get(`${API}${p}`).set(bearer(token)).set('X-Forwarded-For', freshIp()),
  post: (p: string, b?: object, headers: Record<string, string> = {}) =>
    ctx
      .http()
      .post(`${API}${p}`)
      .set(bearer(token))
      .set('X-Forwarded-For', freshIp())
      .set(headers)
      .send(b),
  put: (p: string, b: object) => ctx.http().put(`${API}${p}`).set(bearer(token)).send(b),
  patch: (p: string, b: object) => ctx.http().patch(`${API}${p}`).set(bearer(token)).send(b),
  del: (p: string) => ctx.http().delete(`${API}${p}`).set(bearer(token)),
});
const pub = (p: string) => ctx.http().get(`${API}${p}`);
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
let keyN = 0;
const key = () => `test-key-${Date.now()}-${++keyN}`;

/** Book + pay (mock) → CONFIRMED booking id. */
async function bookAndPay(token: string, body: object) {
  const b = await as(token).post('/bookings', body, { 'Idempotency-Key': key() }).expect(201);
  const order = await as(token).post('/payments/order', { bookingId: b.body.id }).expect(201);
  await as(token).post('/payments/mock/pay', { orderId: order.body.orderId }).expect(200);
  return b.body.id as string;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = (await login(ctx, (await createUser(ctx, 'SUPER_ADMIN')).email)).accessToken;
  owner = (await login(ctx, (await createUser(ctx, 'PARKING_OWNER')).email)).accessToken;
  otherOwner = (await login(ctx, (await createUser(ctx, 'PARKING_OWNER')).email)).accessToken;
  customer = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
  car = (await ctx.prisma.vehicleType.create({ data: { code: 'CAR', name: 'Car' } })).id;
  bike = (await ctx.prisma.vehicleType.create({ data: { code: 'BIKE', name: 'Bike' } })).id;
  category = (await ctx.prisma.category.create({ data: { name: 'Mall' } })).id;
  await ctx.prisma.cancellationPolicy.create({
    data: {
      name: 'Standard',
      isDefault: true,
      rules: [
        { hoursBefore: 2, refundPct: 100 },
        { hoursBefore: 0, refundPct: 0 },
      ],
    },
  });
  vehicleId = (
    await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'TN09AB1234' })
      .expect(201)
  ).body.id;
});
afterAll(() => ctx.close());

describe('M4 owner onboarding + KYC', () => {
  it('owner endpoints need a profile; customers get 403', async () => {
    expect((await as(owner).get('/owner/profile').expect(200)).body).toEqual({});
    const r = await as(owner).post('/owner/locations', { name: 'X' }).expect(400); // validation first
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    await as(customer).get('/owner/profile').expect(403);
  });

  it('saves the profile with normalised PAN/IFSC and validates formats', async () => {
    const bad = await as(owner)
      .put('/owner/profile', { businessName: 'A', phone: '123', address: 'x', panNumber: 'BAD' })
      .expect(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'address',
      'businessName',
      'panNumber',
      'phone',
    ]);
    const res = await as(owner)
      .put('/owner/profile', {
        businessName: 'City Parking Co',
        phone: '98765 43210',
        address: '12 Anna Salai, Chennai',
        panNumber: 'abcde1234f',
        bankAccountName: 'City Parking Co',
        bankAccountNumber: '123456789012',
        bankIfsc: 'sbin0001234',
      })
      .expect(200);
    expect(res.body).toMatchObject({
      panNumber: 'ABCDE1234F',
      bankIfsc: 'SBIN0001234',
      phone: '9876543210',
      kycStatus: 'NOT_SUBMITTED',
    });
  });

  it('submit requires the PAN and Aadhaar documents', async () => {
    const r = await as(owner).post('/owner/kyc/submit').expect(400);
    expect(r.body.error.code).toBe('KYC_INCOMPLETE');
    expect(r.body.error.details.map((d: { path: string }) => d.path)).toEqual([
      'documents.PAN',
      'documents.AADHAAR',
    ]);
  });

  it('rejects files that are not really images/PDFs', async () => {
    const r = await ctx
      .http()
      .post(`${API}/owner/kyc/documents`)
      .set(bearer(owner))
      .field('docType', 'PAN')
      .attach('file', Buffer.from('<html>'), 'pan.png')
      .expect(400);
    expect(r.body.error.code).toBe('FILE_INVALID');
  });

  it('uploads documents to private storage and submits', async () => {
    await ctx
      .http()
      .post(`${API}/owner/kyc/documents`)
      .set(bearer(owner))
      .field('docType', 'PAN')
      .attach('file', PNG, 'pan.png')
      .expect(201);
    const up = await ctx
      .http()
      .post(`${API}/owner/kyc/documents`)
      .set(bearer(owner))
      .field('docType', 'AADHAAR')
      .attach('file', PDF, 'aadhaar.pdf')
      .expect(201);
    expect(up.body.documents).toHaveLength(2);
    const s = await as(owner).post('/owner/kyc/submit').expect(200);
    expect(s.body.kycStatus).toBe('PENDING');
    // Locked while under review
    await as(owner)
      .put('/owner/profile', {
        businessName: 'Changed',
        phone: '9876543210',
        address: '12 Anna Salai, Chennai',
      })
      .expect(409);
  });

  it('admin sees the pending owner, can download a document, and approves', async () => {
    const ap = await as(admin).get('/admin/approvals').expect(200);
    expect(ap.body.owners).toHaveLength(1);
    const o = ap.body.owners[0];
    expect(o.bankAccountNumber).toBe('••••9012');
    const doc = await as(admin)
      .get(`/admin/owners/${o.id}/documents/${o.documents[0].id}`)
      .expect(200);
    expect(doc.headers['content-type']).toMatch(/image\/png|application\/pdf/);
    await as(owner).get(`/admin/owners/${o.id}/documents/${o.documents[0].id}`).expect(403);
    await as(admin).post(`/admin/owners/${o.id}/approve`).expect(200);
    await as(admin).post(`/admin/owners/${o.id}/approve`).expect(409);
    expect((await as(owner).get('/owner/profile').expect(200)).body.kycStatus).toBe('APPROVED');
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'kyc.approve', entityId: o.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe('M5 places, capacity, pricing, approval', () => {
  it('creates a draft place with default hours and policy', async () => {
    const r = await as(owner)
      .post('/owner/locations', {
        categoryId: category,
        name: 'Phoenix Mall Parking',
        address: '142 Velachery Main Rd',
        city: 'Chennai',
        pincode: '600042',
        lat: 12.9915,
        lng: 80.2167,
        is24x7: true,
        amenities: ['CCTV', 'Covered'],
      })
      .expect(201);
    expect(r.body).toMatchObject({
      status: 'DRAFT',
      city: 'Chennai',
      cancellationPolicy: { name: 'Standard' },
    });
    expect(r.body.openingHours).toHaveLength(7);
    expect(r.body.slug).toMatch(/^phoenix-mall-parking-chennai-[0-9a-f]{6}$/);
    locationId = r.body.id;
    slug = r.body.slug;
  });

  it('another owner cannot see or edit it (404)', async () => {
    await as(otherOwner)
      .put('/owner/profile', {
        businessName: 'Other Co',
        phone: '9876543211',
        address: 'Somewhere 123',
      })
      .expect(200);
    await as(otherOwner).get(`/owner/locations/${locationId}`).expect(404);
    await as(otherOwner).patch(`/owner/locations/${locationId}`, { name: 'Hijacked' }).expect(404);
    await as(otherOwner).put(`/owner/locations/${locationId}/capacity`, { items: [] }).expect(404);
  });

  it('submit fails until capacity and prices exist', async () => {
    const r = await as(owner).post(`/owner/locations/${locationId}/submit`).expect(400);
    expect(r.body.error.code).toBe('LOCATION_INCOMPLETE');
  });

  it('validates capacity (online ≤ total) and sets capacity + pricing', async () => {
    await as(owner)
      .put(`/owner/locations/${locationId}/capacity`, {
        items: [{ vehicleTypeId: car, totalSlots: 2, onlineSlots: 5 }],
      })
      .expect(400);
    const cap = await as(owner)
      .put(`/owner/locations/${locationId}/capacity`, {
        items: [
          { vehicleTypeId: car, totalSlots: 4, onlineSlots: 2, overstayPerHourPaise: 5000 },
          { vehicleTypeId: bike, totalSlots: 10, onlineSlots: 10 },
        ],
      })
      .expect(200);
    expect(cap.body.capacities).toHaveLength(2);
    const pr = await as(owner)
      .put(`/owner/locations/${locationId}/pricing`, {
        items: [
          { vehicleTypeId: car, planType: 'HOURLY', pricePaise: 4000 },
          { vehicleTypeId: car, planType: 'DAILY', pricePaise: 30000 },
          { vehicleTypeId: car, planType: 'MONTHLY', pricePaise: 300000 },
          { vehicleTypeId: bike, planType: 'HOURLY', pricePaise: 1000 },
        ],
      })
      .expect(200);
    expect(pr.body.prices).toHaveLength(4);
  });

  it('uploads a public photo served from /files', async () => {
    const r = await ctx
      .http()
      .post(`${API}/owner/locations/${locationId}/photos`)
      .set(bearer(owner))
      .attach('file', PNG, 'p.png')
      .expect(201);
    expect(r.body.photos).toHaveLength(1);
    const url: string = r.body.photos[0].url;
    expect(url).toMatch(/^\/api\/v1\/files\/places\//);
    await ctx
      .http()
      .get(url)
      .expect(200)
      .expect('Content-Type', /image\/png/);
  });

  it('not searchable until approved; submit → admin approve → ACTIVE', async () => {
    await pub(`/parkings/${slug}`).expect(404);
    await as(owner).post(`/owner/locations/${locationId}/submit`).expect(200);
    await as(owner)
      .patch(`/owner/locations/${locationId}`, { name: 'Edit during review' })
      .expect(409);
    const ap = await as(admin).get('/admin/approvals').expect(200);
    expect(ap.body.locations.map((l: { id: string }) => l.id)).toEqual([locationId]);
    await as(admin).post(`/admin/locations/${locationId}/approve`).expect(200);
    const page = await pub(`/parkings/${slug}`).expect(200);
    expect(page.body).toMatchObject({ status: 'ACTIVE', name: 'Phoenix Mall Parking' });
  });

  it('owner without approved KYC cannot submit places', async () => {
    const l = await as(otherOwner)
      .post('/owner/locations', {
        categoryId: category,
        name: 'Other Lot',
        address: 'Some road 1',
        city: 'Madurai',
        lat: 9.9,
        lng: 78.1,
      })
      .expect(201);
    const r = await as(otherOwner).post(`/owner/locations/${l.body.id}/submit`).expect(403);
    expect(r.body.error.code).toBe('KYC_NOT_APPROVED');
  });
});

describe('M6 search + availability', () => {
  it('finds the place near a point, not far away', async () => {
    const near = await pub(`/parkings/search?lat=12.99&lng=80.22&radiusKm=5`).expect(200);
    expect(near.body.items.map((i: { id: string }) => i.id)).toEqual([locationId]);
    // Cheapest across all types when no vehicle type is given (bike hourly ₹10); car only when filtered.
    expect(near.body.items[0]).toMatchObject({
      fromPaise: 1000,
      fromPlan: 'HOURLY',
      category: 'Mall',
    });
    const cars = await pub(
      `/parkings/search?lat=12.99&lng=80.22&radiusKm=5&vehicleType=${car}`,
    ).expect(200);
    expect(cars.body.items[0]).toMatchObject({ fromPaise: 4000, free: null });
    expect(near.body.items[0].distanceKm).toBeLessThan(2);
    const far = await pub(`/parkings/search?lat=28.61&lng=77.2&radiusKm=10`).expect(200);
    expect(far.body.items).toHaveLength(0);
  });

  it('text and city search', async () => {
    expect((await pub('/parkings/search?q=phoenix').expect(200)).body.total).toBe(1);
    expect((await pub('/parkings/search?city=chennai').expect(200)).body.total).toBe(1);
    expect((await pub('/parkings/search?city=delhi').expect(200)).body.total).toBe(0);
  });

  it('quote prices the plan and reports free slots', async () => {
    const q = await ctx
      .http()
      .post(`${API}/parkings/quote`)
      .send({
        locationId,
        vehicleTypeId: car,
        planType: 'HOURLY',
        startAt: inMinutes(60),
        quantity: 3,
      })
      .expect(200);
    expect(q.body).toMatchObject({ amountPaise: 12000, unitPaise: 4000, free: 2, quantity: 3 });
    const bad = await ctx
      .http()
      .post(`${API}/parkings/quote`)
      .send({ locationId, vehicleTypeId: car, planType: 'WEEKLY', startAt: inMinutes(60) })
      .expect(400);
    expect(bad.body.error.code).toBe('PLAN_NOT_AVAILABLE');
    const past = await ctx
      .http()
      .post(`${API}/parkings/quote`)
      .send({ locationId, vehicleTypeId: car, planType: 'HOURLY', startAt: inMinutes(-60) })
      .expect(400);
    expect(past.body.error.code).toBe('START_IN_PAST');
  });

  it('calendar returns every day of the month', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const c = await pub(
      `/parkings/${locationId}/calendar?month=${month}&vehicleType=${car}`,
    ).expect(200);
    expect(c.body.days.length).toBeGreaterThanOrEqual(28);
    expect(c.body.days[0]).toHaveProperty('state');
  });
});

describe('M7 + M8 booking, payment, pass', () => {
  let bookingId: string;

  it('requires an Idempotency-Key and the customer role', async () => {
    await as(customer)
      .post('/bookings', { locationId, vehicleId, planType: 'HOURLY', startAt: inMinutes(30) })
      .expect(400);
    await as(owner)
      .post(
        '/bookings',
        { locationId, vehicleId, planType: 'HOURLY', startAt: inMinutes(30) },
        { 'Idempotency-Key': key() },
      )
      .expect(403);
  });

  it('holds a slot; the same key returns the same booking', async () => {
    const k = key();
    const body = { locationId, vehicleId, planType: 'HOURLY', startAt: inMinutes(0), quantity: 2 };
    const a = await as(customer).post('/bookings', body, { 'Idempotency-Key': k }).expect(201);
    const b = await as(customer).post('/bookings', body, { 'Idempotency-Key': k }).expect(200);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body).toMatchObject({ status: 'PENDING_PAYMENT', amountPaise: 8000 });
    expect(a.body.code).toMatch(/^QP[A-Z2-9]{6}$/);
    bookingId = a.body.id;
    const row = await ctx.prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.commissionPaise).toBe(800); // 10% default
  });

  it('pass is not available before payment; another customer cannot pay it', async () => {
    await as(customer).get(`/bookings/${bookingId}/pass`).expect(409);
    const other = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
    await as(other).post('/payments/order', { bookingId }).expect(404);
    await as(other).get(`/bookings/${bookingId}`).expect(404);
  });

  it('mock payment confirms the booking exactly once (replay is a no-op)', async () => {
    const order = await as(customer).post('/payments/order', { bookingId }).expect(201);
    expect(order.body).toMatchObject({ provider: 'mock', amountPaise: 8000, currency: 'INR' });
    await as(customer).post('/payments/mock/pay', { orderId: order.body.orderId }).expect(200);
    await as(customer).post('/payments/mock/pay', { orderId: order.body.orderId }).expect(200);
    const b = await as(customer).get(`/bookings/${bookingId}`).expect(200);
    expect(b.body.status).toBe('CONFIRMED');
    expect(await ctx.prisma.payment.count({ where: { bookingId, status: 'PAID' } })).toBe(1);
    expect(await ctx.prisma.webhookEvent.count()).toBe(1);
    await ctx.mail.waitFor(
      (
        await ctx.prisma.booking.findUniqueOrThrow({
          where: { id: bookingId },
          include: { user: true },
        })
      ).user.email,
      /Booking confirmed/,
    );
  });

  it('serves a signed pass (JSON + PDF)', async () => {
    const p = await as(customer).get(`/bookings/${bookingId}/pass`).expect(200);
    expect(p.body.payload).toMatch(new RegExp(`^qpb:${bookingId}\\.[A-Za-z0-9_-]{22}$`));
    expect(p.body.svg).toContain('<svg');
    const pdf = await as(customer)
      .get(`/bookings/${bookingId}/pass.pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('lists the booking under upcoming', async () => {
    const l = await as(customer).get('/bookings?tab=upcoming').expect(200);
    expect(l.body.map((b: { id: string }) => b.id)).toContain(bookingId);
  });
});

describe('M10 gate access', () => {
  let bookingId: string;
  let passToken: string;

  beforeAll(async () => {
    const v = await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA01MN0001' })
      .expect(201);
    bookingId = await bookAndPay(customer, {
      locationId,
      vehicleId: v.body.id,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    passToken = (await as(customer).get(`/bookings/${bookingId}/pass`).expect(200)).body.payload;
  });

  it('rejects forged passes and other owners', async () => {
    const forged = passToken.slice(0, -3) + 'abc';
    const r = await as(owner)
      .post('/access/scan', { token: forged, locationId, direction: 'ENTRY' })
      .expect(400);
    expect(r.body.error.code).toBe('QR_INVALID');
    await as(otherOwner)
      .post('/access/scan', { token: passToken, locationId, direction: 'ENTRY' })
      .expect(404);
  });

  it('entry → ACTIVE; a second entry is refused', async () => {
    const r = await as(owner)
      .post('/access/scan', { token: passToken, locationId, direction: 'ENTRY' })
      .expect(200);
    expect(r.body).toMatchObject({ action: 'ENTRY', plateNumber: 'KA01MN0001', isWalkIn: false });
    expect((await as(customer).get(`/bookings/${bookingId}`)).body.status).toBe('ACTIVE');
    const again = await as(owner)
      .post('/access/scan', { token: passToken, locationId, direction: 'ENTRY' })
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_INSIDE');
    const open = await as(owner).get(`/access/sessions?locationId=${locationId}`).expect(200);
    expect(open.body.map((s: { plateNumber: string }) => s.plateNumber)).toContain('KA01MN0001');
  });

  it('exit after overstay asks for payment, then completes the booking', async () => {
    // Pretend the booking ended ~119 min ago (grace 5 min) → overstay within 2 started hours → 2 × ₹50
    await ctx.prisma.booking.update({
      where: { id: bookingId },
      data: {
        startAt: new Date(Date.now() - 3 * 3_600_000),
        endAt: new Date(Date.now() - 119 * 60_000),
      },
    });
    const r = await as(owner)
      .post('/access/scan', { token: passToken, locationId, direction: 'EXIT' })
      .expect(200);
    expect(r.body.amountDuePaise).toBe(10000);
    expect(r.body.overstayMinutes).toBeGreaterThanOrEqual(119);
    expect(r.body.charges).toMatchObject({
      kind: 'OVERSTAY',
      graceMinutes: 5,
      hours: 2,
      ratePerHourPaise: 5000,
      amountPaise: 10000,
    });
    expect(r.body.booking).toMatchObject({ id: bookingId });
    // The "inside now" list shows what check-out would charge right now.
    const inside = await as(owner)
      .get(`/access/sessions?locationId=${locationId}&open=true`)
      .expect(200);
    expect(inside.body.find((x: { id: string }) => x.id === r.body.sessionId)).toMatchObject({
      dueNowPaise: 10000,
    });
    await as(owner).post(`/access/sessions/${r.body.sessionId}/exit`, {}).expect(400);
    const done = await as(owner)
      .post(`/access/sessions/${r.body.sessionId}/exit`, { paymentMethod: 'CASH' })
      .expect(200);
    expect(done.body.action).toBe('EXIT');
    expect((await as(customer).get(`/bookings/${bookingId}`)).body.status).toBe('COMPLETED');
    const s = await ctx.prisma.parkingSession.findUniqueOrThrow({
      where: { id: r.body.sessionId },
    });
    expect(s).toMatchObject({ overstayAmountPaise: 10000, paymentMethod: 'CASH' });
  });

  it('overstay sent online: driver is notified, pays, and the vehicle is checked out', async () => {
    const v = await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA05GH0005' })
      .expect(201);
    const id = await bookAndPay(customer, {
      locationId,
      vehicleId: v.body.id,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    const code = (await as(customer).get(`/bookings/${id}`).expect(200)).body.code as string;
    await as(owner).post('/access/scan', { token: code, locationId, direction: 'ENTRY' }).expect(200);
    await ctx.prisma.booking.update({
      where: { id },
      data: { startAt: new Date(Date.now() - 3 * 3_600_000), endAt: new Date(Date.now() - 50 * 60_000) },
    });
    const out = await as(owner)
      .post('/access/scan', { token: code, locationId, direction: 'EXIT' })
      .expect(200);
    expect(out.body).toMatchObject({ amountDuePaise: 5000, canPayOnline: true, onlineRequest: null });
    const sessionId = out.body.sessionId as string;
    const paidBefore = (await as(customer).get(`/bookings/${id}`).expect(200)).body;

    // Gate chooses "Online": the driver gets a notification with the amount.
    const sent = await as(owner).post(`/access/sessions/${sessionId}/request-online`, {}).expect(200);
    expect(sent.body.onlineRequest).toMatchObject({ amountPaise: 5000 });
    const inside = await as(owner).get(`/access/sessions?locationId=${locationId}`).expect(200);
    expect(inside.body.find((x: { id: string }) => x.id === sessionId)).toMatchObject({
      onlineRequestPaise: 5000,
    });
    const list = await as(customer).get('/notifications').expect(200);
    const n = list.body.items.find((x: { type: string }) => x.type === 'GATE_CHARGE_DUE');
    expect(n).toMatchObject({ amountPaise: 5000, read: false });
    expect(list.body.unread).toBeGreaterThanOrEqual(1);
    const paymentId = n.paymentId as string;
    expect(n.link).toBe(`/vehicle-owner/pay/${paymentId}`);

    // Only that driver can see it.
    await as(otherOwner).get(`/payments/gate/${paymentId}`).expect(403);
    const charge = await as(customer).get(`/payments/gate/${paymentId}`).expect(200);
    expect(charge.body).toMatchObject({ status: 'PENDING', amountPaise: 5000, plateNumber: 'KA05GH0005' });

    // Driver pays → session closed by itself, booking completed, "paid" notification.
    await as(customer)
      .post('/payments/mock/pay', { orderId: charge.body.order.orderId, outcome: 'success' })
      .expect(200);
    const s = await ctx.prisma.parkingSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s.exitAt).not.toBeNull();
    expect(s).toMatchObject({ overstayAmountPaise: 5000, paymentMethod: 'RAZORPAY' });
    expect((await as(customer).get(`/bookings/${id}`)).body.status).toBe('COMPLETED');
    expect((await as(customer).get(`/payments/gate/${paymentId}`)).body.status).toBe('PAID');
    const after = await as(customer).get('/notifications').expect(200);
    expect(after.body.items[0]).toMatchObject({ type: 'GATE_CHARGE_PAID', paymentId });
    expect(after.body.items.find((x: { id: string }) => x.id === n.id).read).toBe(true);
    // The overstay payment is gate money, not booking money (cancellation refunds etc. ignore it).
    const b = (await as(customer).get(`/bookings/${id}`).expect(200)).body;
    expect(b.amountPaise).toBe(paidBefore.amountPaise);
  });

  it('cash at the gate cancels a pending online request; a late online payment is refunded', async () => {
    const v = await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA06JK0006' })
      .expect(201);
    const id = await bookAndPay(customer, {
      locationId,
      vehicleId: v.body.id,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    const code = (await as(customer).get(`/bookings/${id}`).expect(200)).body.code as string;
    await as(owner).post('/access/scan', { token: code, locationId, direction: 'ENTRY' }).expect(200);
    await ctx.prisma.booking.update({
      where: { id },
      data: { startAt: new Date(Date.now() - 3 * 3_600_000), endAt: new Date(Date.now() - 50 * 60_000) },
    });
    const out = await as(owner)
      .post('/access/scan', { token: code, locationId, direction: 'EXIT' })
      .expect(200);
    const sent = await as(owner)
      .post(`/access/sessions/${out.body.sessionId}/request-online`, {})
      .expect(200);
    const paymentId = sent.body.onlineRequest.paymentId as string;
    const order = (await as(customer).get(`/payments/gate/${paymentId}`).expect(200)).body.order;
    await as(owner)
      .post(`/access/sessions/${out.body.sessionId}/exit`, { paymentMethod: 'CASH' })
      .expect(200);
    expect((await as(customer).get(`/payments/gate/${paymentId}`)).body.status).toBe('CANCELLED');
    // The driver pays anyway (stale screen): the money goes back automatically.
    await as(customer)
      .post('/payments/mock/pay', { orderId: order.orderId, outcome: 'success' })
      .expect(200);
    const refunds = await ctx.prisma.refund.findMany({ where: { paymentId } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amountPaise: 5000, status: 'PROCESSED' });
    const s = await ctx.prisma.parkingSession.findUniqueOrThrow({
      where: { id: out.body.sessionId },
    });
    expect(s.paymentMethod).toBe('CASH');
  });

  it('sticker without a booking suggests a walk-in; walk-in + typed-plate exit with charge', async () => {
    const v = await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'MH12XY9999' })
      .expect(201);
    const row = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: v.body.id } });
    const r = await as(owner)
      .post('/access/scan', { token: `qpv:${row.qrToken}`, locationId, direction: 'ENTRY' })
      .expect(404);
    expect(r.body.error).toMatchObject({
      code: 'NO_BOOKING',
      details: { plateNumber: 'MH12XY9999', vehicleTypeId: car },
    });
    const w = await as(owner)
      .post('/access/walk-in', { locationId, vehicleTypeId: car, plateNumber: 'mh 12 xy 9999' })
      .expect(201);
    expect(w.body.isWalkIn).toBe(true);
    const out = await as(owner)
      .post('/access/scan', { token: 'MH12XY9999', locationId, direction: 'EXIT' })
      .expect(200);
    expect(out.body.amountDuePaise).toBe(4000); // 1 started hour × hourly price
    expect(out.body.charges).toMatchObject({
      kind: 'WALK_IN',
      hours: 1,
      ratePerHourPaise: 4000,
      amountPaise: 4000,
    });
    await as(owner)
      .post(`/access/sessions/${out.body.sessionId}/exit`, { paymentMethod: 'UPI' })
      .expect(200);
    const notInside = await as(owner)
      .post('/access/scan', { token: 'MH12XY9999', locationId, direction: 'EXIT' })
      .expect(404);
    expect(notInside.body.error.code).toBe('NOT_INSIDE');
  });

  it('accepts a typed booking code for entry and exit', async () => {
    const v = await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA02CD0002' })
      .expect(201);
    const id = await bookAndPay(customer, {
      locationId,
      vehicleId: v.body.id,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    const code = (await as(customer).get(`/bookings/${id}`).expect(200)).body.code as string;
    const typed = ` ${code.toLowerCase().slice(0, 4)}-${code.toLowerCase().slice(4)} `; // staff typing "qpab-12cd"
    await as(otherOwner)
      .post('/access/scan', { token: code, locationId, direction: 'ENTRY' })
      .expect(404);
    const r = await as(owner)
      .post('/access/scan', { token: typed, locationId, direction: 'ENTRY' })
      .expect(200);
    expect(r.body).toMatchObject({ action: 'ENTRY', plateNumber: 'KA02CD0002', booking: { code } });
    const out = await as(owner)
      .post('/access/scan', { token: code, locationId, direction: 'EXIT' })
      .expect(200);
    expect(out.body).toMatchObject({ action: 'EXIT', amountDuePaise: 0 });
  });

  it('accepts a typed number plate for entry; unknown plates suggest a walk-in', async () => {
    const v = await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA03EF0003' })
      .expect(201);
    await bookAndPay(customer, {
      locationId,
      vehicleId: v.body.id,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    const r = await as(owner)
      .post('/access/scan', { token: 'ka 03 ef 0003', locationId, direction: 'ENTRY' })
      .expect(200);
    expect(r.body).toMatchObject({ action: 'ENTRY', plateNumber: 'KA03EF0003', isWalkIn: false });
    await as(owner)
      .post('/access/scan', { token: 'KA03EF0003', locationId, direction: 'EXIT' })
      .expect(200);

    const unknown = await as(owner)
      .post('/access/scan', { token: 'DL01ZZ4321', locationId, direction: 'ENTRY' })
      .expect(404);
    expect(unknown.body.error).toMatchObject({
      code: 'NO_BOOKING',
      details: { plateNumber: 'DL01ZZ4321', vehicleTypeId: null },
    });
    const junk = await as(owner)
      .post('/access/scan', { token: 'hello world!', locationId, direction: 'ENTRY' })
      .expect(400);
    expect(junk.body.error.code).toBe('QR_INVALID');
  });
});

describe('M7 concurrency: 2 online slots, 20 parallel requests → exactly 2 bookings', () => {
  it('never overbooks', async () => {
    const start = inMinutes(24 * 60 * 3); // a quiet window 3 days ahead
    const crowd = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
    const vehicles: string[] = [];
    for (let i = 0; i < 20; i++) {
      vehicles.push(
        (
          await as(crowd)
            .post('/vehicles', {
              vehicleTypeId: car,
              plateNumber: `TN22CC${String(i).padStart(4, '0')}`,
            })
            .expect(201)
        ).body.id,
      );
    }
    const results = await Promise.all(
      vehicles.map((v) =>
        as(crowd).post(
          '/bookings',
          { locationId, vehicleId: v, planType: 'HOURLY', startAt: start, quantity: 1 },
          { 'Idempotency-Key': key() },
        ),
      ),
    );
    const created = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(2);
    expect(refused).toHaveLength(18);
    expect(refused.every((r) => r.body.error.code === 'SLOT_UNAVAILABLE')).toBe(true);
    const q = await ctx
      .http()
      .post(`${API}/parkings/quote`)
      .send({ locationId, vehicleTypeId: car, planType: 'HOURLY', startAt: start })
      .expect(200);
    expect(q.body.free).toBe(0);
  });
});

describe('cancel + refund, scheduler', () => {
  it('cancelling ≥ 2h before start refunds 100% per the policy', async () => {
    const id = await bookAndPay(customer, {
      locationId,
      vehicleId,
      planType: 'DAILY',
      startAt: inMinutes(5 * 60),
      quantity: 1,
    });
    const r = await as(customer)
      .post(`/bookings/${id}/cancel`, { reason: 'Plans changed' })
      .expect(200);
    expect(r.body).toMatchObject({ status: 'CANCELLED', refundedPaise: 30000 });
    await as(customer).post(`/bookings/${id}/cancel`, {}).expect(409);
  });

  it('expired holds are released by the scheduler; a late payment is auto-refunded', async () => {
    const b = await as(customer)
      .post(
        '/bookings',
        { locationId, vehicleId, planType: 'HOURLY', startAt: inMinutes(48 * 60) },
        { 'Idempotency-Key': key() },
      )
      .expect(201);
    const order = await as(customer).post('/payments/order', { bookingId: b.body.id }).expect(201);
    await ctx.prisma.booking.update({
      where: { id: b.body.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    const summary = await ctx.app.get(SchedulerService).tick();
    expect(summary.expiredHolds).toBeGreaterThanOrEqual(1);
    expect((await as(customer).get(`/bookings/${b.body.id}`)).body.status).toBe('EXPIRED');
    await as(customer).post('/payments/order', { bookingId: b.body.id }).expect(409);
    await as(customer).post('/payments/mock/pay', { orderId: order.body.orderId }).expect(200);
    const after = await as(customer).get(`/bookings/${b.body.id}`).expect(200);
    expect(after.body).toMatchObject({ status: 'EXPIRED', refundedPaise: 4000 });
  });

  it('extension creates a follow-on booking that needs payment', async () => {
    const id = await bookAndPay(customer, {
      locationId,
      vehicleId,
      planType: 'HOURLY',
      startAt: inMinutes(10 * 60),
      quantity: 1,
    });
    const ext = await as(customer).post(`/bookings/${id}/extend`, { quantity: 2 }).expect(201);
    const orig = await as(customer).get(`/bookings/${id}`).expect(200);
    expect(ext.body).toMatchObject({
      status: 'PENDING_PAYMENT',
      extendedFromId: id,
      startAt: orig.body.endAt,
      amountPaise: 8000,
    });
  });

  it('a paid extension is not expired as a no-show while the car is inside, and counts at exit', async () => {
    const v = await as(customer)
      .post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA04GH0004' })
      .expect(201);
    const id = await bookAndPay(customer, {
      locationId,
      vehicleId: v.body.id,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    await as(owner)
      .post('/access/scan', { token: 'KA04GH0004', locationId, direction: 'ENTRY' })
      .expect(200);
    const ext = await as(customer).post(`/bookings/${id}/extend`, { quantity: 1 }).expect(201);
    const order = await as(customer)
      .post('/payments/order', { bookingId: ext.body.id })
      .expect(201);
    await as(customer).post('/payments/mock/pay', { orderId: order.body.orderId }).expect(200);
    // Move time: first hour ended 65 min ago, the extension ended 3 min ago (inside the 5 min exit grace).
    const now = Date.now();
    await ctx.prisma.booking.update({
      where: { id },
      data: { startAt: new Date(now - 125 * 60_000), endAt: new Date(now - 65 * 60_000) },
    });
    await ctx.prisma.booking.update({
      where: { id: ext.body.id },
      data: { startAt: new Date(now - 65 * 60_000), endAt: new Date(now - 3 * 60_000) },
    });
    await ctx.app.get(SchedulerService).tick();
    expect((await as(customer).get(`/bookings/${ext.body.id}`)).body.status).toBe('CONFIRMED');
    const out = await as(owner)
      .post('/access/scan', { token: 'KA04GH0004', locationId, direction: 'EXIT' })
      .expect(200);
    expect(out.body).toMatchObject({ action: 'EXIT', amountDuePaise: 0 });
    expect((await as(customer).get(`/bookings/${ext.body.id}`)).body.status).toBe('COMPLETED');
  });

  it('limits unpaid holds per customer', async () => {
    const c = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
    const v = (
      await as(c).post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA05JK0005' }).expect(201)
    ).body.id;
    for (let i = 0; i < 3; i++) {
      await as(c)
        .post(
          '/bookings',
          { locationId, vehicleId: v, planType: 'HOURLY', startAt: inMinutes((60 + i * 2) * 60) },
          { 'Idempotency-Key': key() },
        )
        .expect(201);
    }
    const r = await as(c)
      .post(
        '/bookings',
        { locationId, vehicleId: v, planType: 'HOURLY', startAt: inMinutes(70 * 60) },
        { 'Idempotency-Key': key() },
      )
      .expect(409);
    expect(r.body.error.message).toMatch(/unpaid/);
  });
});

describe('M11 owner dashboard + earnings, M12 admin', () => {
  it('owner bookings never expose customer email', async () => {
    const r = await as(owner).get('/owner/bookings').expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body)).not.toMatch(/@example\.com/);
    expect(r.body[0]).toHaveProperty('customerName');
  });

  it('earnings reconcile with payments and refunds', async () => {
    const e = await as(owner)
      .get(`/owner/earnings?from=${new Date(Date.now() - 86_400_000).toISOString()}`)
      .expect(200);
    // Booking money only: overstay paid online is gate money (counted in overstayPaise).
    const paid = await ctx.prisma.payment.aggregate({
      where: { status: 'PAID', purpose: { not: 'GATE_CHARGE' }, booking: { locationId } },
      _sum: { amountPaise: true },
    });
    const refunded = await ctx.prisma.refund.aggregate({
      where: {
        status: 'PROCESSED',
        payment: { purpose: { not: 'GATE_CHARGE' } },
        booking: { locationId },
      },
      _sum: { amountPaise: true },
    });
    expect(e.body.grossPaise).toBe(paid._sum.amountPaise);
    expect(e.body.refundPaise).toBe(refunded._sum.amountPaise);
    expect(e.body.netPaise).toBe(e.body.grossPaise - e.body.refundPaise - e.body.commissionPaise);
    // ₹100 cash (M10) + ₹50 paid online + ₹50 cash after an online request was cancelled.
    expect(e.body.overstayPaise).toBe(20000);
    expect(e.body.walkInPaise).toBe(4000);
    const d = await as(owner).get('/owner/dashboard').expect(200);
    expect(d.body.daily).toHaveLength(30);
    expect(d.body.locations[0]).toMatchObject({ id: locationId, capacity: 14 });
  });

  it('admin report totals match the owner earnings', async () => {
    const e = await as(owner).get('/owner/earnings?from=2000-01-01T00:00:00Z').expect(200);
    const r = await as(admin).get('/admin/reports?groupBy=city').expect(200);
    expect(r.body.rows).toEqual([
      expect.objectContaining({
        key: 'Chennai',
        grossPaise: e.body.grossPaise,
        refundPaise: e.body.refundPaise,
      }),
    ]);
    for (const g of ['category', 'month'])
      await as(admin).get(`/admin/reports?groupBy=${g}`).expect(200);
  });

  it('payout for a period, no overlaps, mark paid', async () => {
    const ownerRow = await ctx.prisma.owner.findFirstOrThrow({
      where: { businessName: 'City Parking Co' },
    });
    const body = {
      ownerId: ownerRow.id,
      periodFrom: '2000-01-01T00:00:00Z',
      periodTo: new Date(Date.now() + 60_000).toISOString(),
    };
    const p = await as(admin).post('/admin/payouts', body).expect(201);
    const e = await as(owner).get('/owner/earnings?from=2000-01-01T00:00:00Z').expect(200);
    expect(p.body.netPaise).toBe(e.body.netPaise);
    await as(admin).post('/admin/payouts', body).expect(409);
    const paid = await as(admin)
      .post(`/admin/payouts/${p.body.id}/paid`, { reference: 'UTR123456' })
      .expect(200);
    expect(paid.body.status).toBe('PAID');
    expect((await as(owner).get('/owner/payouts').expect(200)).body).toHaveLength(1);
  });

  it('disputes: customer raises, admin resolves with a refund', async () => {
    const id = await bookAndPay(customer, {
      locationId,
      vehicleId,
      planType: 'HOURLY',
      startAt: inMinutes(20 * 60),
      quantity: 1,
    });
    const d = await as(customer)
      .post(`/bookings/${id}/disputes`, { reason: 'Gate staff refused entry with a valid pass' })
      .expect(201);
    await as(customer)
      .post(`/bookings/${id}/disputes`, { reason: 'Second one for the same booking' })
      .expect(409);
    const list = await as(admin).get('/admin/disputes?status=OPEN').expect(200);
    expect(list.body.map((x: { id: string }) => x.id)).toContain(d.body.id);
    const res = await as(admin)
      .post(`/admin/disputes/${d.body.id}/resolve`, {
        status: 'RESOLVED',
        resolution: 'Refunded half as goodwill',
        refundPaise: 2000,
      })
      .expect(200);
    expect(res.body.refundedPaise).toBe(2000);
    await as(admin)
      .post(`/admin/disputes/${d.body.id}/resolve`, { status: 'REJECTED', resolution: 'Again' })
      .expect(409);
  });

  it('admin suspends a user: their token stops working immediately', async () => {
    const u = await createUser(ctx, 'VEHICLE_OWNER');
    const t = (await login(ctx, u.email)).accessToken;
    await as(t).get('/vehicles').expect(200);
    await as(admin).patch(`/admin/users/${u.id}/status`, { status: 'SUSPENDED' }).expect(200);
    await as(t).get('/vehicles').expect(403);
    const users = await as(admin).get('/admin/users?status=SUSPENDED').expect(200);
    expect(users.body.items.map((x: { id: string }) => x.id)).toContain(u.id);
  });

  it('suspending a place hides it from search', async () => {
    await as(admin)
      .post(`/admin/locations/${locationId}/suspend`, { reason: 'Safety complaint' })
      .expect(200);
    await pub(`/parkings/${slug}`).expect(404);
    await as(admin).post(`/admin/locations/${locationId}/reinstate`).expect(200);
    await pub(`/parkings/${slug}`).expect(200);
    const logs = await as(admin).get('/admin/audit-logs').expect(200);
    expect(logs.body.items.map((l: { action: string }) => l.action)).toEqual(
      expect.arrayContaining(['location.suspend', 'location.reinstate', 'payout.paid']),
    );
    await as(admin).get('/admin/overview').expect(200);
    await as(admin).get('/admin/bookings?q=QP').expect(200);
    await as(admin).get('/admin/payments').expect(200);
  });

  it('every admin ops route is 403 for owners', async () => {
    for (const p of [
      '/admin/approvals',
      '/admin/users',
      '/admin/bookings',
      '/admin/payouts',
      '/admin/reports',
      '/admin/audit-logs',
      '/admin/disputes',
    ]) {
      await as(owner).get(p).expect(403);
    }
  });
});

describe('Razorpay webhook signature (unit)', () => {
  const rp = new RazorpayPaymentProvider('rzp_test_x', 'secret', 'whsec');
  const body = Buffer.from(
    JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 5000 } } },
    }),
  );

  it('accepts a correct HMAC and parses the event', () => {
    const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(rp.parseWebhook(body, sig, 'evt_1')).toEqual({
      eventId: 'evt_1',
      type: 'paid',
      orderId: 'order_1',
      paymentId: 'pay_1',
      amountPaise: 5000,
    });
  });

  it('rejects a wrong or missing signature', () => {
    expect(() => rp.parseWebhook(body, 'deadbeef', 'evt_1')).toThrow();
    expect(() => rp.parseWebhook(body, undefined, 'evt_1')).toThrow();
  });
});

describe('go-live hardening', () => {
  /** A bookable car place (2 online of 3 slots, ₹40/h, ₹50/h overstay) made ACTIVE directly. */
  async function newPlace(token: string, name: string) {
    const r = await as(token)
      .post('/owner/locations', {
        categoryId: category,
        name,
        address: '1 Test Road, Adyar',
        city: 'Chennai',
        lat: 13.0,
        lng: 80.25,
        is24x7: true,
      })
      .expect(201);
    await as(token)
      .put(`/owner/locations/${r.body.id}/capacity`, {
        items: [{ vehicleTypeId: car, totalSlots: 3, onlineSlots: 2, overstayPerHourPaise: 5000 }],
      })
      .expect(200);
    await as(token)
      .put(`/owner/locations/${r.body.id}/pricing`, {
        items: [{ vehicleTypeId: car, planType: 'HOURLY', pricePaise: 4000 }],
      })
      .expect(200);
    await ctx.prisma.parkingLocation.update({
      where: { id: r.body.id },
      data: { status: 'ACTIVE', approvedAt: new Date() },
    });
    return r.body.id as string;
  }
  async function newCustomerVehicle(plate: string) {
    const c = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
    const v = (
      await as(c).post('/vehicles', { vehicleTypeId: car, plateNumber: plate }).expect(201)
    ).body.id as string;
    return { c, v };
  }
  const provider = () =>
    ctx.app.get<{ refund: (id: string, amount: number) => Promise<{ refundId: string }> }>(
      PAYMENT_PROVIDER,
    );

  it('suspending a place cancels upcoming bookings with a full refund and leaves active ones', async () => {
    const place = await newPlace(owner, 'Suspend Test Parking');
    const a = await newCustomerVehicle('TN10SU0001');
    const b = await newCustomerVehicle('TN10SU0002');
    const upcoming = await bookAndPay(a.c, {
      locationId: place,
      vehicleId: a.v,
      planType: 'HOURLY',
      startAt: inMinutes(24 * 60),
      quantity: 2,
    });
    const inside = await bookAndPay(b.c, {
      locationId: place,
      vehicleId: b.v,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    await as(owner)
      .post('/access/scan', { token: 'TN10SU0002', locationId: place, direction: 'ENTRY' })
      .expect(200);

    const r = await as(admin)
      .post(`/admin/locations/${place}/suspend`, { reason: 'Safety check' })
      .expect(200);
    expect(r.body).toMatchObject({ ok: true, cancelled: 1, refundedPaise: 8000, activeLeft: 1 });
    expect((await as(a.c).get(`/bookings/${upcoming}`)).body).toMatchObject({
      status: 'CANCELLED',
      refundedPaise: 8000,
    });
    expect((await as(b.c).get(`/bookings/${inside}`)).body.status).toBe('ACTIVE');
    await pub(`/parkings/by-id/${place}`).expect(404);
  });

  it('suspending a parking owner suspends their places and refunds upcoming bookings', async () => {
    const place = await newPlace(otherOwner, 'Owner Suspend Parking');
    const a = await newCustomerVehicle('TN10SU0003');
    const id = await bookAndPay(a.c, {
      locationId: place,
      vehicleId: a.v,
      planType: 'HOURLY',
      startAt: inMinutes(48 * 60),
      quantity: 1,
    });
    const ownerRow = await ctx.prisma.owner.findFirstOrThrow({
      where: { locations: { some: { id: place } } },
      select: { userId: true },
    });
    const r = await as(admin)
      .patch(`/admin/users/${ownerRow.userId}/status`, { status: 'SUSPENDED' })
      .expect(200);
    expect(r.body).toMatchObject({
      ok: true,
      placesSuspended: 1,
      cancelled: 1,
      refundedPaise: 4000,
    });
    expect(
      (await ctx.prisma.parkingLocation.findUniqueOrThrow({ where: { id: place } })).status,
    ).toBe('SUSPENDED');
    expect((await as(a.c).get(`/bookings/${id}`)).body.status).toBe('CANCELLED');

    // Reactivating the owner reinstates those places and clears the admin note.
    const back = await as(admin)
      .patch(`/admin/users/${ownerRow.userId}/status`, { status: 'ACTIVE' })
      .expect(200);
    expect(back.body).toMatchObject({ ok: true, placesReinstated: 1 });
    expect(
      await ctx.prisma.parkingLocation.findUniqueOrThrow({ where: { id: place } }),
    ).toMatchObject({ status: 'ACTIVE', rejectionReason: null });
  });

  it('campus layout: sub-places with floors sum into the place, floor bookings respect both floor and place limits', async () => {
    const place = await newPlace(owner, 'Campus Parking');
    const layout = await as(owner)
      .put(`/owner/locations/${place}/layout`, {
        areas: [
          {
            name: 'Tech Park Parking',
            zones: [
              {
                name: 'B1',
                level: -1,
                tags: ['Near lift'],
                capacities: [{ vehicleTypeId: car, totalSlots: 2, onlineSlots: 1 }],
              },
              {
                name: 'B2',
                level: -2,
                capacities: [{ vehicleTypeId: car, totalSlots: 2, onlineSlots: 1 }],
              },
            ],
          },
          {
            name: 'APJ Parking',
            lat: 13.01,
            lng: 80.26,
            zones: [
              {
                name: 'Ground',
                capacities: [{ vehicleTypeId: car, totalSlots: 1, onlineSlots: 1 }],
              },
            ],
          },
        ],
      })
      .expect(200);
    expect(layout.body.capacities[0]).toMatchObject({
      vehicleTypeId: car,
      totalSlots: 5,
      onlineSlots: 3,
      overstayPerHourPaise: 5000,
    });
    expect(layout.body.areas.map((a: { name: string }) => a.name)).toEqual([
      'Tech Park Parking',
      'APJ Parking',
    ]);
    const [b1, b2] = layout.body.areas[0].zones.map((z: { id: string }) => z.id) as [
      string,
      string,
    ];
    const ground = layout.body.areas[1].zones[0].id as string;

    const startAt = inMinutes(48 * 60);
    const book = (who: { c: string; v: string }, zoneId?: string) => ({
      locationId: place,
      vehicleId: who.v,
      planType: 'HOURLY',
      startAt,
      quantity: 1,
      ...(zoneId ? { zoneId } : {}),
    });
    const [a, b, c, d] = (await Promise.all(
      ['TN11CP0001', 'TN11CP0002', 'TN11CP0003', 'TN11CP0004'].map(newCustomerVehicle),
    )) as [
      { c: string; v: string },
      { c: string; v: string },
      { c: string; v: string },
      { c: string; v: string },
    ];

    const first = await bookAndPay(a.c, book(a, b1));
    expect((await as(a.c).get(`/bookings/${first}`)).body.zone).toEqual({
      id: b1,
      name: 'B1',
      areaName: 'Tech Park Parking',
    });
    // B1 is full, so B1 is refused even though the place still has room; any floor still works.
    const refused = await as(b.c)
      .post('/bookings', book(b, b1), { 'Idempotency-Key': key() })
      .expect(409);
    expect(refused.body.error.code).toBe('SLOT_UNAVAILABLE');
    const end = new Date(new Date(startAt).getTime() + 3_600_000).toISOString();
    const avail = await pub(
      `/parkings/${place}/availability?vehicleType=${car}&start=${startAt}&end=${end}`,
    ).expect(200);
    expect(avail.body.free).toBe(2);
    expect(
      Object.fromEntries(
        avail.body.zones.map((z: { zoneId: string; free: number }) => [z.zoneId, z.free]),
      ),
    ).toEqual({ [b1]: 0, [b2]: 1, [ground]: 1 });

    await bookAndPay(b.c, book(b));
    await bookAndPay(c.c, book(c));
    // Place total (3 online) is now used up, so B2 is refused too although no one booked B2 itself.
    await as(d.c).post('/bookings', book(d, b2), { 'Idempotency-Key': key() }).expect(409);

    // A floor with upcoming bookings can't be removed.
    const keepB2Only = {
      areas: [
        {
          id: layout.body.areas[0].id,
          name: 'Tech Park Parking',
          zones: [
            {
              id: b2,
              name: 'B2',
              level: -2,
              capacities: [{ vehicleTypeId: car, totalSlots: 2, onlineSlots: 1 }],
            },
          ],
        },
      ],
    };
    const blocked = await as(owner).put(`/owner/locations/${place}/layout`, keepB2Only).expect(409);
    expect(blocked.body.error.message).toContain('B1');
  });

  it('no-show: an hourly booking not checked in 30 min after the start is released and its slot freed', async () => {
    const place = await newPlace(owner, 'No Show Parking'); // 2 online car slots
    const [a, b, c] = (await Promise.all(
      ['TN11NS0001', 'TN11NS0002', 'TN11NS0003'].map(newCustomerVehicle),
    )) as [{ c: string; v: string }, { c: string; v: string }, { c: string; v: string }];
    const book = (who: { c: string; v: string }) =>
      bookAndPay(who.c, {
        locationId: place,
        vehicleId: who.v,
        planType: 'HOURLY',
        startAt: inMinutes(1),
        quantity: 3,
      });
    const noShow = await book(a);
    const arrived = await book(b);
    await as(owner)
      .post('/access/scan', { token: 'TN11NS0002', locationId: place, direction: 'ENTRY' })
      .expect(200);
    // Full now: C can't book.
    await as(c.c)
      .post(
        '/bookings',
        {
          locationId: place,
          vehicleId: c.v,
          planType: 'HOURLY',
          startAt: inMinutes(1),
          quantity: 1,
        },
        { 'Idempotency-Key': key() },
      )
      .expect(409);
    // The detail page tells A when to check in by.
    expect((await as(a.c).get(`/bookings/${noShow}`)).body.checkInBy).toBeTruthy();

    // 20 min after the start: still inside the 30 min window, nothing is released.
    const move = (id: string, minAgo: number) =>
      ctx.prisma.booking.update({
        where: { id },
        data: {
          startAt: new Date(Date.now() - minAgo * 60_000),
          endAt: new Date(Date.now() + (180 - minAgo) * 60_000),
        },
      });
    await move(noShow, 20);
    await move(arrived, 20);
    await ctx.app.get(SchedulerService).tick();
    expect((await as(a.c).get(`/bookings/${noShow}`)).body.status).toBe('CONFIRMED');

    // 31 min after the start: A never came → released; B is inside → kept.
    await move(noShow, 31);
    await move(arrived, 31);
    const summary = await ctx.app.get(SchedulerService).tick();
    expect(summary.released).toBe(1);
    const gone = (await as(a.c).get(`/bookings/${noShow}`)).body;
    expect(gone).toMatchObject({ status: 'EXPIRED' });
    expect(gone.cancelReason).toContain('No-show');
    expect((await as(b.c).get(`/bookings/${arrived}`)).body.status).toBe('ACTIVE');
    // The freed slot can be booked again.
    await bookAndPay(c.c, {
      locationId: place,
      vehicleId: c.v,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
  });

  it('overstay: free for 5 minutes after the booking ends, then charged per started hour', async () => {
    const place = await newPlace(owner, 'Grace Test Parking');
    const run = async (plate: string, endedMinAgo: number) => {
      const a = await newCustomerVehicle(plate);
      const id = await bookAndPay(a.c, {
        locationId: place,
        vehicleId: a.v,
        planType: 'HOURLY',
        startAt: inMinutes(1),
        quantity: 1,
      });
      await as(owner)
        .post('/access/scan', { token: plate, locationId: place, direction: 'ENTRY' })
        .expect(200);
      await ctx.prisma.booking.update({
        where: { id },
        data: {
          startAt: new Date(Date.now() - 2 * 3_600_000),
          endAt: new Date(Date.now() - endedMinAgo * 60_000),
        },
      });
      return (
        await as(owner)
          .post('/access/scan', { token: plate, locationId: place, direction: 'EXIT' })
          .expect(200)
      ).body;
    };
    // 4 min late: inside the grace → leaves straight away, nothing to pay.
    expect(await run('TN11GR0001', 4)).toMatchObject({ amountDuePaise: 0, charges: null });
    // 7 min late: grace over → 1 started hour at ₹50.
    const late = await run('TN11GR0002', 7);
    expect(late).toMatchObject({
      amountDuePaise: 5000,
      charges: { kind: 'OVERSTAY', hours: 1, amountPaise: 5000 },
    });
    expect(late.message).toContain('Late by');
    // 65 min late: 2 started hours.
    expect((await run('TN11GR0003', 65)).charges).toMatchObject({ hours: 2, amountPaise: 10000 });
  });

  it('named slots: counts come from the slots, customers pick or get a free slot, taken slots are refused', async () => {
    const place = await newPlace(owner, 'Slot Number Parking');
    const slots = ['P01', 'P02', 'P03'].map((label) => ({ label, vehicleTypeId: car }));
    const layout = await as(owner)
      .put(`/owner/locations/${place}/layout`, {
        areas: [
          {
            name: 'Main parking',
            zones: [
              {
                name: 'B1',
                level: -1,
                capacities: [],
                slots: [...slots, { label: 'P04', vehicleTypeId: car, isOnline: false }],
              },
            ],
          },
        ],
      })
      .expect(200);
    const zone = layout.body.areas[0].zones[0];
    // 4 named slots, 1 kept for walk-ins → total 4, online 3.
    expect(zone.capacities[0]).toMatchObject({ totalSlots: 4, onlineSlots: 3 });
    expect(zone.slots.map((x: { label: string }) => x.label)).toEqual(['P01', 'P02', 'P03', 'P04']);
    const id = (label: string) =>
      zone.slots.find((x: { label: string }) => x.label === label).id as string;

    const startAt = inMinutes(72 * 60);
    const end = new Date(new Date(startAt).getTime() + 3_600_000).toISOString();
    const [a, b, c] = (await Promise.all(
      ['TN11SL0001', 'TN11SL0002', 'TN11SL0003'].map(newCustomerVehicle),
    )) as { c: string; v: string }[] as [
      { c: string; v: string },
      { c: string; v: string },
      { c: string; v: string },
    ];
    const book = (who: { v: string }, extra: object) => ({
      locationId: place,
      vehicleId: who.v,
      planType: 'HOURLY',
      startAt,
      quantity: 1,
      ...extra,
    });

    // A picks P02; B asks for P02 too and is refused; B picks "any free slot" on B1 and gets P01.
    const first = await bookAndPay(a.c, book(a, { slotId: id('P02') }));
    expect((await as(a.c).get(`/bookings/${first}`)).body.slot).toEqual({
      id: id('P02'),
      label: 'P02',
    });
    const taken = await as(b.c)
      .post('/bookings', book(b, { slotId: id('P02') }), { 'Idempotency-Key': key() })
      .expect(409);
    expect(taken.body.error.message).toContain('P02');
    const quoteTaken = await ctx
      .http()
      .post(`${API}/parkings/quote`)
      .send({ ...book(b, { slotId: id('P02') }), vehicleTypeId: car })
      .expect(200);
    expect(quoteTaken.body.free).toBe(0);
    const second = await bookAndPay(b.c, book(b, { zoneId: zone.id }));
    expect((await as(b.c).get(`/bookings/${second}`)).body.slot.label).toBe('P01');
    // The walk-in slot can't be booked online, and the public slot list hides it.
    await as(c.c)
      .post('/bookings', book(c, { slotId: id('P04') }), { 'Idempotency-Key': key() })
      .expect(400);
    const list = await pub(
      `/parkings/${place}/slots?vehicleType=${car}&zone=${zone.id}&start=${startAt}&end=${end}`,
    ).expect(200);
    expect(list.body.slots).toEqual([
      { id: id('P01'), label: 'P01', free: false },
      { id: id('P02'), label: 'P02', free: false },
      { id: id('P03'), label: 'P03', free: true },
    ]);

    // Renaming slots keeps their bookings; removing a booked slot is refused.
    const renamed = zone.slots.map(
      (x: { id: string; label: string; vehicleTypeId: string; isOnline: boolean }) => ({
        ...x,
        label: x.label.replace('P', 'B1-'),
      }),
    );
    const again = await as(owner)
      .put(`/owner/locations/${place}/layout`, {
        areas: [
          {
            id: layout.body.areas[0].id,
            name: 'Main parking',
            zones: [{ id: zone.id, name: 'B1', level: -1, capacities: [], slots: renamed }],
          },
        ],
      })
      .expect(200);
    expect(again.body.areas[0].zones[0].slots.map((x: { label: string }) => x.label)).toEqual([
      'B1-01',
      'B1-02',
      'B1-03',
      'B1-04',
    ]);
    expect((await as(a.c).get(`/bookings/${first}`)).body.slot.label).toBe('B1-02');
    const withoutP02 = renamed.filter((x: { id: string }) => x.id !== id('P02'));
    const refused = await as(owner)
      .put(`/owner/locations/${place}/layout`, {
        areas: [
          {
            id: layout.body.areas[0].id,
            name: 'Main parking',
            zones: [{ id: zone.id, name: 'B1', level: -1, capacities: [], slots: withoutP02 }],
          },
        ],
      })
      .expect(409);
    expect(refused.body.error.message).toContain('B1-02');
  });

  it('free parking: no prices, bookings confirm without payment; switching back to paid needs real prices', async () => {
    const place = await newPlace(owner, 'Free Campus Parking');
    const made = await as(owner).patch(`/owner/locations/${place}`, { isFree: true }).expect(200);
    expect(made.body.isFree).toBe(true);
    // Prices sent for a free place are stored as 0: plans only say what can be booked.
    const priced = await as(owner)
      .put(`/owner/locations/${place}/pricing`, {
        items: [
          { vehicleTypeId: car, planType: 'HOURLY', pricePaise: 0 },
          { vehicleTypeId: car, planType: 'DAILY', pricePaise: 9900 },
        ],
      })
      .expect(200);
    expect(priced.body.prices.map((p: { pricePaise: number }) => p.pricePaise)).toEqual([0, 0]);

    const a = await newCustomerVehicle('TN10FR0001');
    const body = {
      locationId: place,
      vehicleId: a.v,
      planType: 'HOURLY',
      startAt: inMinutes(24 * 60),
      quantity: 2,
    };
    const quote = await ctx
      .http()
      .post(`${API}/parkings/quote`)
      .send({ ...body, vehicleTypeId: car })
      .expect(200);
    expect(quote.body).toMatchObject({ unitPaise: 0, amountPaise: 0 });
    const created = await as(a.c).post('/bookings', body, { 'Idempotency-Key': key() }).expect(201);
    expect(created.body).toMatchObject({
      status: 'CONFIRMED',
      amountPaise: 0,
      holdExpiresAt: null,
    });
    const search = await pub(`/parkings/search?q=${encodeURIComponent('Free Campus')}`).expect(200);
    expect(search.body.items.find((i: { id: string }) => i.id === place)).toMatchObject({
      isFree: true,
      fromPaise: 0,
    });
    // Cancelling a free booking refunds nothing and needs no payment.
    await as(a.c).post(`/bookings/${created.body.id}/cancel`, {}).expect(200);

    // Back to paid: the ₹0 plans can't be booked until the owner sets prices, and ₹0 prices are refused.
    await as(owner).patch(`/owner/locations/${place}`, { isFree: false }).expect(200);
    const stale = await ctx
      .http()
      .post(`${API}/parkings/quote`)
      .send({ ...body, vehicleTypeId: car })
      .expect(400);
    expect(stale.body.error.code).toBe('PLAN_NOT_AVAILABLE');
    await as(owner)
      .put(`/owner/locations/${place}/pricing`, {
        items: [{ vehicleTypeId: car, planType: 'HOURLY', pricePaise: 0 }],
      })
      .expect(400);
  });

  it('a failed refund is retried by the scheduler, and parallel refunds never exceed the payment', async () => {
    const place = await newPlace(owner, 'Refund Retry Parking');
    const a = await newCustomerVehicle('TN10RF0001');
    const id = await bookAndPay(a.c, {
      locationId: place,
      vehicleId: a.v,
      planType: 'HOURLY',
      startAt: inMinutes(24 * 60),
      quantity: 1,
    });
    const spy = jest
      .spyOn(provider(), 'refund')
      .mockRejectedValueOnce(new Error('gateway timeout'));
    await as(a.c).post(`/bookings/${id}/cancel`, {}).expect(200);
    const failed = await ctx.prisma.refund.findFirstOrThrow({ where: { bookingId: id } });
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 1, lastError: 'gateway timeout' });

    // Too soon for a retry (5 min backoff), then due.
    expect(await ctx.app.get(PaymentsService).retryFailedRefunds(new Date())).toBe(0);
    expect(
      await ctx.app.get(PaymentsService).retryFailedRefunds(new Date(Date.now() + 6 * 60_000)),
    ).toBe(1);
    expect(await ctx.prisma.refund.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({
      status: 'PROCESSED',
      attempts: 2,
      lastError: null,
    });
    spy.mockRestore();

    // Admin refunds race each other on another booking: total never exceeds what was paid.
    const id2 = await bookAndPay(a.c, {
      locationId: place,
      vehicleId: a.v,
      planType: 'HOURLY',
      startAt: inMinutes(30 * 60),
      quantity: 1,
    });
    await Promise.all(
      [1, 2, 3].map(() =>
        as(admin).post('/admin/refunds', { bookingId: id2, amountPaise: 3000, reason: 'Goodwill' }),
      ),
    );
    const sum = await ctx.prisma.refund.aggregate({
      where: { bookingId: id2, status: 'PROCESSED' },
      _sum: { amountPaise: true },
    });
    expect(sum._sum.amountPaise).toBe(4000);
  });

  it('a payment for the wrong amount is not confirmed and is refunded in full', async () => {
    const place = await newPlace(owner, 'Mismatch Parking');
    const a = await newCustomerVehicle('TN10MM0001');
    const b = await as(a.c)
      .post(
        '/bookings',
        { locationId: place, vehicleId: a.v, planType: 'HOURLY', startAt: inMinutes(24 * 60) },
        { 'Idempotency-Key': key() },
      )
      .expect(201);
    const order = await as(a.c).post('/payments/order', { bookingId: b.body.id }).expect(201);
    await ctx.app.get(PaymentsService).process(
      {
        eventId: `evt_mm_${b.body.id}`,
        type: 'paid',
        orderId: order.body.orderId,
        paymentId: 'pay_mm_1',
        amountPaise: 100,
      },
      {},
    );
    expect((await as(a.c).get(`/bookings/${b.body.id}`)).body).toMatchObject({
      status: 'EXPIRED',
      refundedPaise: 100,
    });
  });

  it('cars inside without a covering booking reduce near-term availability only', async () => {
    const place = await newPlace(owner, 'Overstay Parking');
    const a = await newCustomerVehicle('TN10OV0001');
    const id = await bookAndPay(a.c, {
      locationId: place,
      vehicleId: a.v,
      planType: 'HOURLY',
      startAt: inMinutes(1),
      quantity: 1,
    });
    await as(owner)
      .post('/access/scan', { token: 'TN10OV0001', locationId: place, direction: 'ENTRY' })
      .expect(200);
    await ctx.prisma.booking.update({
      where: { id },
      data: {
        startAt: new Date(Date.now() - 3 * 3_600_000),
        endAt: new Date(Date.now() - 30 * 60_000),
      },
    });
    const avail = ctx.app.get(AvailabilityService);
    const soon = await avail.free(
      place,
      car,
      new Date(Date.now() + 10 * 60_000),
      new Date(Date.now() + 70 * 60_000),
    );
    const later = await avail.free(
      place,
      car,
      new Date(Date.now() + 5 * 3_600_000),
      new Date(Date.now() + 6 * 3_600_000),
    );
    expect({ soon, later }).toEqual({ soon: 1, later: 2 });
  });
});
