import { API, bearer, createTestApp, createUser, login, type TestContext } from './helpers';

let ctx: TestContext;
let admin: string;
let vehicleOwner: string;
let parkingOwner: string;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = (await login(ctx, (await createUser(ctx, 'SUPER_ADMIN')).email)).accessToken;
  vehicleOwner = (await login(ctx, (await createUser(ctx, 'VEHICLE_OWNER')).email)).accessToken;
  parkingOwner = (await login(ctx, (await createUser(ctx, 'PARKING_OWNER')).email)).accessToken;
});
afterAll(() => ctx.close());

const http = () => ctx.http();
const asAdmin = {
  get: (p: string) => http().get(`${API}${p}`).set(bearer(admin)),
  post: (p: string, b: object) => http().post(`${API}${p}`).set(bearer(admin)).send(b),
  patch: (p: string, b: object) => http().patch(`${API}${p}`).set(bearer(admin)).send(b),
  del: (p: string) => http().delete(`${API}${p}`).set(bearer(admin)),
};

describe('access control', () => {
  const adminRoutes: [string, string][] = [
    ['get', '/admin/vehicle-types'],
    ['post', '/admin/vehicle-types'],
    ['get', '/admin/categories'],
    ['post', '/admin/categories'],
    ['get', '/admin/cancellation-policies'],
    ['post', '/admin/cancellation-policies'],
    ['get', '/admin/settings'],
    ['patch', '/admin/settings'],
  ];

  it.each(adminRoutes)('%s %s → 401 without a token', async (method, path) => {
    const res = await (http() as unknown as Record<string, (p: string) => import('supertest').Test>)[method]!(`${API}${path}`).send({});
    expect(res.status).toBe(401);
  });

  it.each(adminRoutes)('%s %s → 403 for vehicle and parking owners', async (method, path) => {
    for (const token of [vehicleOwner, parkingOwner]) {
      const req = (http() as unknown as Record<string, (p: string) => import('supertest').Test>)[method]!(`${API}${path}`);
      const res = await req.set(bearer(token)).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('public lists need no token', async () => {
    await http().get(`${API}/vehicle-types`).expect(200);
    await http().get(`${API}/categories`).expect(200);
  });
});

describe('vehicle types', () => {
  let evId: string;

  it('creates, normalising the code to upper case', async () => {
    const res = await asAdmin.post('/admin/vehicle-types', { code: ' ev_car ', name: 'Electric car', icon: 'car', sortOrder: 5 }).expect(201);
    expect(res.body).toMatchObject({ code: 'EV_CAR', name: 'Electric car', icon: 'car', sortOrder: 5, isActive: true });
    evId = res.body.id;
  });

  it('rejects a duplicate code with 409 DUPLICATE', async () => {
    const res = await asAdmin.post('/admin/vehicle-types', { code: 'EV_CAR', name: 'Again' }).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  it('rejects invalid input with field details', async () => {
    const res = await asAdmin.post('/admin/vehicle-types', { code: '1x', name: 'A', icon: 'Not An Icon!' }).expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['code', 'icon', 'name']);
  });

  it('updates without touching omitted fields, and ignores code changes', async () => {
    const res = await asAdmin.patch(`/admin/vehicle-types/${evId}`, { name: 'EV', code: 'HACK' }).expect(200);
    expect(res.body).toMatchObject({ code: 'EV_CAR', name: 'EV', icon: 'car', sortOrder: 5, isActive: true });
  });

  it('inactive types are hidden from the public list but kept in the admin list', async () => {
    await asAdmin.patch(`/admin/vehicle-types/${evId}`, { isActive: false }).expect(200);
    const pub = await http().get(`${API}/vehicle-types`).expect(200);
    expect(pub.body.map((t: { code: string }) => t.code)).not.toContain('EV_CAR');
    const all = await asAdmin.get('/admin/vehicle-types').expect(200);
    expect(all.body.map((t: { code: string }) => t.code)).toContain('EV_CAR');
  });

  it('public list is sorted by sortOrder then name', async () => {
    await asAdmin.post('/admin/vehicle-types', { code: 'ZZZ', name: 'Zed', sortOrder: 1 }).expect(201);
    await asAdmin.post('/admin/vehicle-types', { code: 'AAA', name: 'Ay', sortOrder: 2 }).expect(201);
    const pub = await http().get(`${API}/vehicle-types`).expect(200);
    expect(pub.body.map((t: { code: string }) => t.code)).toEqual(['ZZZ', 'AAA']);
  });

  it('deletes, then 404s', async () => {
    await asAdmin.del(`/admin/vehicle-types/${evId}`).expect(204);
    await asAdmin.patch(`/admin/vehicle-types/${evId}`, { name: 'Gone' }).expect(404);
    await asAdmin.del(`/admin/vehicle-types/${evId}`).expect(404);
  });

  it('rejects a malformed id with 400', async () => {
    await asAdmin.patch('/admin/vehicle-types/not-a-uuid', { name: 'X' }).expect(400);
  });
});

describe('categories', () => {
  it('full CRUD with duplicate-name protection', async () => {
    const created = await asAdmin.post('/admin/categories', { name: 'Temple', icon: '' }).expect(201);
    expect(created.body).toMatchObject({ name: 'Temple', icon: null, isActive: true });
    const dup = await asAdmin.post('/admin/categories', { name: 'Temple' }).expect(409);
    expect(dup.body.error.code).toBe('DUPLICATE');

    const updated = await asAdmin.patch(`/admin/categories/${created.body.id}`, { name: 'Temple / Church' }).expect(200);
    expect(updated.body.name).toBe('Temple / Church');
    const pub = await http().get(`${API}/categories`).expect(200);
    expect(pub.body.map((c: { name: string }) => c.name)).toContain('Temple / Church');

    await asAdmin.del(`/admin/categories/${created.body.id}`).expect(204);
    const after = await http().get(`${API}/categories`).expect(200);
    expect(after.body.map((c: { name: string }) => c.name)).not.toContain('Temple / Church');
  });
});

describe('cancellation policies', () => {
  let firstId: string;
  let secondId: string;

  it('the first policy becomes the default; rules are sorted by hours descending', async () => {
    const res = await asAdmin
      .post('/admin/cancellation-policies', {
        name: 'Flexible',
        rules: [
          { hoursBefore: 0, refundPct: 0 },
          { hoursBefore: 24, refundPct: 100 },
          { hoursBefore: 2, refundPct: 50 },
        ],
      })
      .expect(201);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.rules).toEqual([
      { hoursBefore: 24, refundPct: 100 },
      { hoursBefore: 2, refundPct: 50 },
      { hoursBefore: 0, refundPct: 0 },
    ]);
    firstId = res.body.id;
  });

  it.each([
    ['no 0-hour rule', [{ hoursBefore: 2, refundPct: 100 }]],
    ['duplicate hours', [{ hoursBefore: 0, refundPct: 0 }, { hoursBefore: 0, refundPct: 10 }]],
    ['refund rises near start', [{ hoursBefore: 5, refundPct: 10 }, { hoursBefore: 0, refundPct: 50 }]],
    ['refund over 100%', [{ hoursBefore: 0, refundPct: 101 }]],
    ['empty', []],
  ])('rejects rules: %s', async (_label, rules) => {
    const res = await asAdmin.post('/admin/cancellation-policies', { name: 'Bad', rules }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('making another policy the default moves the flag (exactly one default)', async () => {
    const res = await asAdmin
      .post('/admin/cancellation-policies', { name: 'Strict', rules: [{ hoursBefore: 0, refundPct: 0 }], isDefault: true })
      .expect(201);
    secondId = res.body.id;
    const list = await asAdmin.get('/admin/cancellation-policies').expect(200);
    const defaults = list.body.filter((p: { isDefault: boolean }) => p.isDefault);
    expect(defaults.map((p: { id: string }) => p.id)).toEqual([secondId]);
  });

  it('the default cannot be unset, deactivated or deleted', async () => {
    for (const body of [{ isDefault: false }, { isActive: false }]) {
      const res = await asAdmin.patch(`/admin/cancellation-policies/${secondId}`, body).expect(409);
      expect(res.body.error.code).toBe('DEFAULT_POLICY_LOCKED');
    }
    const del = await asAdmin.del(`/admin/cancellation-policies/${secondId}`).expect(409);
    expect(del.body.error.code).toBe('DEFAULT_POLICY_LOCKED');
  });

  it('a non-default policy can be edited and deleted', async () => {
    const res = await asAdmin
      .patch(`/admin/cancellation-policies/${firstId}`, { description: 'Easy refunds', isActive: false })
      .expect(200);
    expect(res.body).toMatchObject({ description: 'Easy refunds', isActive: false, isDefault: false });
    await asAdmin.del(`/admin/cancellation-policies/${firstId}`).expect(204);
  });
});

describe('platform settings', () => {
  it('returns defaults, partially updates, and records who changed them', async () => {
    const before = await asAdmin.get('/admin/settings').expect(200);
    expect(before.body).toMatchObject({ defaultCommissionPct: 10, holdMinutes: 10, entryGraceMinutes: 15, fewLeftThreshold: 3 });

    const res = await asAdmin.patch('/admin/settings', { defaultCommissionPct: 12.5, holdMinutes: 15 }).expect(200);
    expect(res.body).toMatchObject({ defaultCommissionPct: 12.5, holdMinutes: 15, entryGraceMinutes: 15, fewLeftThreshold: 3 });

    const row = await ctx.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(row.updatedById).not.toBeNull();
  });

  it('rejects out-of-range values', async () => {
    const res = await asAdmin.patch('/admin/settings', { defaultCommissionPct: 120, holdMinutes: 0, fewLeftThreshold: -1 }).expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['defaultCommissionPct', 'fewLeftThreshold', 'holdMinutes']);
    await asAdmin.patch('/admin/settings', { defaultCommissionPct: 10.555 }).expect(400);
  });
});
