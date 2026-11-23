import { expect, test } from '@playwright/test';

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test('home page offers search by vehicle type and place', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Park without the search' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Your vehicle' })).toBeVisible();
  await page.getByRole('radio', { name: 'Car' }).click();
  await expect(page.getByRole('radio', { name: 'Car' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('combobox', { name: 'Search parking name or a place' }).fill('zzzz-no-such-place');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?.*vehicleType=/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('unknown pages show the friendly 404', async ({ page }) => {
  const res = await page.goto('/p/this-place-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
});

test('robots.txt hides private areas and points at the sitemap', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /admin');
  expect(robots).toContain('sitemap.xml');
  expect((await request.get('/sitemap.xml')).ok()).toBe(true);
});

test('a new vehicle owner can register, add a vehicle and see its QR sticker', async ({ page }) => {
  test.skip(!!process.env.REQUIRE_VERIFIED, 'needs sign-in straight after registering (REQUIRE_EMAIL_VERIFICATION=false)');
  const id = unique();
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Browser Test');
  await page.getByLabel('Email').fill(`browser-${id}@example.com`);
  await page.getByLabel('Password').fill('Very-secret-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'Sign in now' }).click();
  await page.getByLabel('Email').fill(`browser-${id}@example.com`);
  await page.getByLabel('Password').fill('Very-secret-123');
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/vehicle-owner/, { timeout: 15_000 });

  await page.goto('/vehicle-owner/vehicles');
  await page.getByLabel('Vehicle type').selectOption({ label: 'Car' });
  const plate = `KA01PW${id.slice(-4)}`;
  await page.getByLabel('Number plate').fill(plate);
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText(plate.replace(/^(..)(..)(..)(....)$/, '$1 $2 $3 $4')).first()).toBeVisible();
});
