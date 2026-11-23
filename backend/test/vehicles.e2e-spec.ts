import { MAX_VEHICLES_PER_USER, VEHICLE_QR_PREFIX } from '@qp/types';
import { API, bearer, createTestApp, createUser, login, type TestContext } from './helpers';

let ctx: TestContext;
let alice: string; // vehicle owner
let bob: string; // another vehicle owner
let parkingOwner: string;
let admin: string;
let car: string;
let bike: string;
let inactiveType: string;

beforeAll(async () => {
  ctx = await createTestApp();
  alice = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
  bob = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
  parkingOwner = (await login(ctx, (await createUser(ctx, 'PARKING_OWNER')).email)).accessToken;
  admin = (await login(ctx, (await createUser(ctx, 'SUPER_ADMIN')).email)).accessToken;
  // The test DB is truncated, so create the vehicle types this file needs.
  car = (await ctx.prisma.vehicleType.create({ data: { code: 'CAR', name: 'Car' } })).id;
  bike = (await ctx.prisma.vehicleType.create({ data: { code: 'BIKE', name: 'Bike' } })).id;
  inactiveType = (await ctx.prisma.vehicleType.create({ data: { code: 'OLD', name: 'Old', isActive: false } })).id;
});
afterAll(() => ctx.close());

const as = (token: string) => ({
  get: (p: string) => ctx.http().get(`${API}${p}`).set(bearer(token)),
  post: (p: string, b?: object) => ctx.http().post(`${API}${p}`).set(bearer(token)).send(b),
  patch: (p: string, b: object) => ctx.http().patch(`${API}${p}`).set(bearer(token)).send(b),
  del: (p: string) => ctx.http().delete(`${API}${p}`).set(bearer(token)),
});

describe('access control', () => {
  it('401 without a token', async () => {
    await ctx.http().get(`${API}/vehicles`).expect(401);
    await ctx.http().post(`${API}/vehicles`).send({}).expect(401);
  });

  it('403 for parking owners and admins', async () => {
    for (const token of [parkingOwner, admin]) {
      const res = await as(token).get('/vehicles').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      await as(token).post('/vehicles', { vehicleTypeId: car, plateNumber: 'TN09AB1234' }).expect(403);
    }
  });
});

describe('create + list', () => {
  let id: string;

  it('creates a vehicle, normalising the plate, and never exposes the QR token in the list', async () => {
    const res = await as(alice).post('/vehicles', { vehicleTypeId: car, plateNumber: ' tn 09 ab-1234 ' }).expect(201);
    expect(res.body).toMatchObject({ plateNumber: 'TN09AB1234', vehicleType: { id: car, code: 'CAR', name: 'Car' }, photoUrl: null });
    expect(res.body).not.toHaveProperty('qrToken');
    id = res.body.id;

    const row = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(row.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const list = await as(alice).get('/vehicles').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('qrToken');
  });

  it('rejects a duplicate plate for the same user (in any formatting) with 409', async () => {
    const res = await as(alice).post('/vehicles', { vehicleTypeId: bike, plateNumber: 'TN-09-AB-1234' }).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  it('allows the same plate for a different user', async () => {
    await as(bob).post('/vehicles', { vehicleTypeId: car, plateNumber: 'TN09AB1234' }).expect(201);
  });

  it.each([
    ['bad plate', { vehicleTypeId: car, plateNumber: 'X1' }, 'plateNumber'],
    ['plate with symbols', { vehicleTypeId: car, plateNumber: 'TN09@1234' }, 'plateNumber'],
    ['missing type', { plateNumber: 'TN01AA0001' }, 'vehicleTypeId'],
    ['type not a uuid', { vehicleTypeId: 'car', plateNumber: 'TN01AA0001' }, 'vehicleTypeId'],
  ])('400 for %s', async (_label, body, path) => {
    const res = await as(alice).post('/vehicles', body).expect(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
  });

  it('400 VEHICLE_TYPE_INVALID for an inactive or unknown type', async () => {
    for (const vehicleTypeId of [inactiveType, '00000000-0000-4000-8000-000000000000']) {
      const res = await as(alice).post('/vehicles', { vehicleTypeId, plateNumber: 'KA01AB0001' }).expect(400);
      expect(res.body.error.code).toBe('VEHICLE_TYPE_INVALID');
    }
  });

  it('lists only the caller’s own vehicles', async () => {
    const a = await as(alice).get('/vehicles').expect(200);
    const b = await as(bob).get('/vehicles').expect(200);
    expect(a.body.map((v: { id: string }) => v.id)).toEqual([id]);
    expect(b.body.map((v: { id: string }) => v.id)).not.toContain(id);
  });
});

describe('ownership: another user’s vehicle is 404 on every route', () => {
  let alicesCar: string;
  beforeAll(async () => {
    alicesCar = (await as(alice).post('/vehicles', { vehicleTypeId: car, plateNumber: 'MH12CD3456' }).expect(201)).body.id;
  });

  it.each([
    ['GET', (id: string) => as(bob).get(`/vehicles/${id}`)],
    ['PATCH', (id: string) => as(bob).patch(`/vehicles/${id}`, { plateNumber: 'HACKED1' })],
    ['DELETE', (id: string) => as(bob).del(`/vehicles/${id}`)],
    ['GET qr', (id: string) => as(bob).get(`/vehicles/${id}/qr`)],
    ['POST qr/rotate', (id: string) => as(bob).post(`/vehicles/${id}/qr/rotate`)],
  ])('%s', async (_label, call) => {
    const res = await call(alicesCar).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('…and Alice’s vehicle is untouched', async () => {
    const res = await as(alice).get(`/vehicles/${alicesCar}`).expect(200);
    expect(res.body.plateNumber).toBe('MH12CD3456');
  });
});

describe('update, QR, rotate, delete', () => {
  let id: string;
  beforeAll(async () => {
    id = (await as(alice).post('/vehicles', { vehicleTypeId: car, plateNumber: 'DL3CAB1234' }).expect(201)).body.id;
  });

  it('updates type and plate', async () => {
    const res = await as(alice).patch(`/vehicles/${id}`, { vehicleTypeId: bike, plateNumber: 'dl 3c ab 9999' }).expect(200);
    expect(res.body).toMatchObject({ plateNumber: 'DL3CAB9999', vehicleType: { code: 'BIKE' } });
  });

  it('update to a plate the user already has → 409', async () => {
    await as(alice).patch(`/vehicles/${id}`, { plateNumber: 'TN09AB1234' }).expect(409);
  });

  it('returns a QR with the vehicle token and an SVG; rotating changes it', async () => {
    const qr = await as(alice).get(`/vehicles/${id}/qr`).expect(200);
    const row = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(qr.body.payload).toBe(`${VEHICLE_QR_PREFIX}${row.qrToken}`);
    expect(qr.body.svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(qr.body).toMatchObject({ vehicleId: id, plateNumber: 'DL3CAB9999', vehicleTypeName: 'Bike' });

    const rotated = await as(alice).post(`/vehicles/${id}/qr/rotate`).expect(200);
    expect(rotated.body.payload).not.toBe(qr.body.payload);
    const after = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(rotated.body.payload).toBe(`${VEHICLE_QR_PREFIX}${after.qrToken}`);
  });

  it('soft-deletes: gone from the API, row kept, plate can be added again', async () => {
    await as(alice).del(`/vehicles/${id}`).expect(204);
    await as(alice).get(`/vehicles/${id}`).expect(404);
    await as(alice).get(`/vehicles/${id}/qr`).expect(404);
    await as(alice).del(`/vehicles/${id}`).expect(404);
    const list = await as(alice).get('/vehicles').expect(200);
    expect(list.body.map((v: { id: string }) => v.id)).not.toContain(id);

    const row = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();

    await as(alice).post('/vehicles', { vehicleTypeId: car, plateNumber: 'DL3CAB9999' }).expect(201);
  });

  it('a vehicle type used by a vehicle cannot be deleted by the admin (409 IN_USE)', async () => {
    const res = await as(admin).del(`/admin/vehicle-types/${car}`).expect(409);
    expect(res.body.error.code).toBe('IN_USE');
  });

  it('400 for a malformed id', async () => {
    await as(alice).get('/vehicles/not-a-uuid').expect(400);
  });
});

describe('limit', () => {
  it(`allows at most ${MAX_VEHICLES_PER_USER} live vehicles`, async () => {
    const carol = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
    for (let i = 0; i < MAX_VEHICLES_PER_USER; i++) {
      await as(carol).post('/vehicles', { vehicleTypeId: car, plateNumber: `KA01ZZ${String(i).padStart(4, '0')}` }).expect(201);
    }
    const res = await as(carol).post('/vehicles', { vehicleTypeId: car, plateNumber: 'KA01ZZ9999' }).expect(409);
    expect(res.body.error.code).toBe('VEHICLE_LIMIT');
  });
});
