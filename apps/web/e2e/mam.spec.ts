import { expect, request, test, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { E2E_OSM_PLACE, E2E_OSM_PLACE_ID_FILE, E2E_PLACES } from './global-setup';

const osmPlaceId = () => readFileSync(E2E_OSM_PLACE_ID_FILE, 'utf8').trim();

async function devLogin(page: Page, email: string) {
  // Same-origin call through the Next.js rewrite so cookies land on the web origin.
  const res = await page.request.post('/api/v1/auth/dev-login', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

async function useMyLocation(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Gunakan lokasiku/ }).click();
}

test.describe('Discovery', () => {
  test('default radius is 5 km, nearby list shows only places inside the radius', async ({ page }) => {
    await useMyLocation(page);
    await expect(page.getByRole('button', { name: '5 km' }).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: new RegExp(E2E_PLACES.near.name) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(E2E_PLACES.far.name) })).toHaveCount(0);
    // No Google key in E2E → discovery runs on OpenStreetMap + community data, without an error notice.
    await expect(page.getByRole('link', { name: new RegExp(E2E_OSM_PLACE.name) })).toBeVisible();
    await expect(page.getByText(/Google Maps belum dikonfigurasi/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' }).first()).toBeVisible();
  });

  test('user can change the radius and the far place appears at 10 km', async ({ page }) => {
    await useMyLocation(page);
    await page.getByRole('button', { name: '10 km' }).first().click();
    await expect(page.getByRole('link', { name: new RegExp(E2E_PLACES.far.name) })).toBeVisible();
  });

  test('user can switch between list and map views', async ({ page }) => {
    await useMyLocation(page);
    await page.getByRole('tab', { name: 'Peta' }).click();
    // OpenStreetMap (Leaflet) map with the required attribution.
    await expect(page.getByRole('application', { name: /Peta tempat makan/ })).toBeVisible();
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    await expect(page.locator('.mam-pin').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Daftar' }).click();
    await expect(page.getByRole('link', { name: new RegExp(E2E_PLACES.near.name) })).toBeVisible();
  });

  test('restaurant detail separates MAM! and Google data and links to Google Maps', async ({ page }) => {
    await page.goto(`/tempat/${E2E_PLACES.near.placeId}`);
    await expect(page.getByRole('heading', { name: E2E_PLACES.near.name })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rating komunitas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rating di Google Maps' })).toBeVisible();
    await expect(page.getByText('Rating Google dan rating MAM! dihitung terpisah')).toBeVisible();
    const mapsLink = page.getByRole('link', { name: /Buka di Google Maps/ });
    await expect(mapsLink).toHaveAttribute('href', new RegExp(`query_place_id=${E2E_PLACES.near.placeId}`));
  });

  test('OpenStreetMap place detail shows its data source and attribution instead of Google data', async ({ page }) => {
    await page.goto(`/tempat/${osmPlaceId()}`);
    await expect(page.getByRole('heading', { name: E2E_OSM_PLACE.name })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sumber data tempat' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rating di Google Maps' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /perbaiki di OpenStreetMap/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/node/424242');
    await expect(page.getByRole('link', { name: /Petunjuk arah/ })).toHaveAttribute('href', /destination=-6\.177,106\.8265/);
  });

  test('delivery platforms are never fabricated', async ({ page }) => {
    await devLogin(page, 'e2e-viewer@mam.test');
    await page.goto(`/tempat/${E2E_PLACES.near.placeId}`);
    const delivery = page.locator('section', { has: page.getByRole('heading', { name: /Pesan-antar/ }) });
    await expect(delivery.getByText('Data tidak tersedia')).toHaveCount(3);
    await expect(delivery.getByRole('link', { name: /Buka di/ })).toHaveCount(0);
  });
});

test.describe('Reviews', () => {
  test('anonymous users are sent to login when writing a review', async ({ page }) => {
    await page.goto(`/tempat/${E2E_PLACES.near.placeId}/ulas`);
    await expect(page).toHaveURL(/\/masuk\?next=/);
  });

  test('create → duplicate prevented (edit mode) → edit → delete', async ({ page }, info) => {
    await devLogin(page, `e2e-reviewer-${info.project.name}@mam.test`);
    await page.goto(`/tempat/${E2E_PLACES.near.placeId}/ulas`);
    await expect(page.getByRole('heading', { name: 'Tulis ulasan' })).toBeVisible();
    for (const label of ['Rasa', 'Harga', 'Porsi', 'Kebersihan', 'Layanan']) {
      await page.getByRole('radiogroup', { name: label }).getByRole('radio', { name: '4 dari 5' }).click();
    }
    await page.getByLabel('Ceritakan pengalamanmu').fill('Kuah soto gurih, daging empuk, dan pelayanannya cepat sekali.');
    await page.getByLabel(/Harga yang kamu bayar/).fill('30000');
    await page.getByRole('button', { name: 'Terbitkan ulasan' }).click();
    await expect(page).toHaveURL(new RegExp(`/tempat/${E2E_PLACES.near.placeId}$`));
    await expect(page.getByText('Kuah soto gurih, daging empuk')).toBeVisible();
    await expect(page.getByText(/dilaporkan pengulas/)).toBeVisible();

    // Going back to the form loads the existing review in edit mode instead of creating a duplicate.
    await page.goto(`/tempat/${E2E_PLACES.near.placeId}/ulas`);
    await expect(page.getByRole('heading', { name: 'Edit ulasanmu' })).toBeVisible();
    await page.getByLabel('Ceritakan pengalamanmu').fill('Datang lagi: sotonya tetap juara, tapi antrean makin panjang.');
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(page.getByText('Datang lagi: sotonya tetap juara')).toBeVisible();
    await expect(page.getByText('Kuah soto gurih, daging empuk')).toHaveCount(0);

    await page.goto(`/tempat/${E2E_PLACES.near.placeId}/ulas`);
    await page.getByRole('button', { name: 'Hapus ulasan' }).click();
    await page.getByRole('button', { name: 'Ya, hapus' }).click();
    await expect(page.getByText('Datang lagi: sotonya tetap juara')).toHaveCount(0);
  });
});

test.describe('Community & security', () => {
  test('user can save a favorite and create a collection', async ({ page }, info) => {
    await devLogin(page, `e2e-fav-${info.project.name}@mam.test`);
    await page.goto(`/tempat/${E2E_PLACES.near.placeId}`);
    await page.getByRole('button', { name: /Simpan/ }).first().click();
    await expect(page.getByRole('button', { name: /Favorit/ })).toBeVisible();
    await page.goto('/favorit');
    await expect(page.getByRole('link', { name: E2E_PLACES.near.name })).toBeVisible();
    await page.goto('/koleksi');
    await page.getByLabel('Nama koleksi baru').fill('Makan siang kantor');
    await page.getByRole('button', { name: 'Buat' }).click();
    await expect(page.getByText('📚 Makan siang kantor')).toBeVisible();
  });

  test('regular users cannot call admin endpoints', async ({ page }) => {
    await devLogin(page, 'e2e-plain@mam.test');
    const res = await page.request.get('/api/v1/admin/overview');
    expect(res.status()).toBe(403);
    const anonymous = await request.newContext({ baseURL: 'http://localhost:3100' });
    expect((await anonymous.get('/api/v1/admin/overview')).status()).toBe(401);
    await anonymous.dispose();
  });

  test('cookie-authenticated writes without CSRF token are rejected', async ({ page }) => {
    await devLogin(page, 'e2e-csrf@mam.test');
    const res = await page.request.patch('/api/v1/users/me', { data: { bio: 'tanpa csrf' } });
    expect(res.status()).toBe(403);
  });
});

test.describe('Community places', () => {
  test('a logged-in user can add a missing place by pinning it on the map', async ({ page }) => {
    await devLogin(page, 'e2e-adder@mam.test');
    await page.goto('/tambah-tempat');
    await expect(page.getByRole('heading', { name: 'Tambah tempat makan' })).toBeVisible();
    const placeName = `Pecel Lele E2E ${Date.now() % 100000}`;
    await page.getByLabel('Nama tempat *').fill(placeName);
    const map = page.getByRole('application', { name: /memilih lokasi/ });
    await expect(map).toBeVisible();
    await expect(map.locator('.leaflet-container, .leaflet-pane').first()).toBeAttached(); // Leaflet loaded (client-only)
    await map.click({ position: { x: 160, y: 120 } });
    await expect(page.getByText(/^📍 -?\d/)).toBeVisible();
    await page.getByRole('button', { name: 'Indonesia', exact: true }).click();
    const created = page.waitForResponse((r) => r.url().endsWith('/api/v1/places') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Simpan tempat' }).click();
    const res = await created;
    expect(res.status(), await res.text()).toBe(201);
    expect((await res.json()).status).toBe('PENDING');
    // Regular users' places wait for a moderator before they appear in discovery.
    await expect(page.getByRole('status').filter({ hasText: 'terkirim' })).toBeVisible();
    const mine = page.locator('section', { has: page.getByRole('heading', { name: 'Pengajuan tempatku' }) });
    await expect(mine.getByText(placeName)).toBeVisible();
    await expect(mine.getByText('Menunggu moderator').first()).toBeVisible();
  });

  test('anonymous users are sent to login when adding a place', async ({ page }) => {
    await page.goto('/tambah-tempat');
    await expect(page).toHaveURL(/\/masuk\?next=%2Ftambah-tempat/);
  });
});

test.describe('Accounts (email + password, no Google needed)', () => {
  test('a visitor can register, log out and log back in with email + password', async ({ page }) => {
    const email = `e2e-${Date.now()}@contoh.id`;
    await page.goto('/masuk');
    // Google is not configured → no dead Google button is shown.
    await expect(page.getByRole('link', { name: /Lanjutkan dengan Google/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Daftar' }).click();
    await page.locator('input[name=displayName]').fill('Pengguna E2E');
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill('pendek');
    await page.getByRole('button', { name: 'Buat akun' }).click();
    await expect(page.getByText('Kata sandi minimal 8 karakter')).toBeVisible();
    await page.locator('input[name=password]').fill('gudeg-enak-123');
    await page.getByRole('button', { name: 'Buat akun' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/profil');
    await expect(page.getByRole('heading', { level: 1, name: 'Pengguna E2E' })).toBeVisible();
    await page.getByRole('button', { name: /Pengaturan/ }).click();
    const loggedOut = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/logout'));
    await page.getByRole('button', { name: 'Keluar', exact: true }).first().click();
    expect((await loggedOut).status()).toBe(204);
    await page.waitForURL((u) => u.pathname === '/'); // logout returns to the home page
    await page.goto('/favorit');
    await expect(page).toHaveURL(/\/masuk\?next=/);

    await page.goto('/masuk');
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill('salah-sekali-1');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Email atau kata sandi salah.' })).toBeVisible();
    await page.locator('input[name=password]').fill('gudeg-enak-123');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/favorit');
    await expect(page).toHaveURL(/\/favorit$/);
  });

  test('registering an existing email shows a clear message', async ({ page }) => {
    await page.goto('/masuk?daftar');
    await page.locator('input[name=displayName]').fill('Budi Lagi');
    await page.locator('input[name=email]').fill('budi@mam.local');
    await page.locator('input[name=password]').fill('gudeg-enak-123');
    await page.getByRole('button', { name: 'Buat akun' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'sudah terdaftar' })).toBeVisible();
  });

  test('seeded demo account logs in with its password', async ({ page }) => {
    await page.goto('/masuk');
    await page.locator('input[name=email]').fill('sari@mam.local');
    await page.locator('input[name=password]').fill('mam12345');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Staff MFA', () => {
  test('a moderator logging in with a password must enter the e-mailed code', async ({ page }) => {
    await page.goto('/masuk');
    await page.locator('input[name=email]').fill('moderator@mam.local');
    await page.locator('input[name=password]').fill('mam12345');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page.getByText(/Kode 6 angka|kode 6 angka/)).toBeVisible();
    await expect(page).toHaveURL(/\/masuk/);
    // No SMTP in E2E → the development code is shown on screen.
    const code = (await page.getByTestId('dev-code').innerText()).trim();
    await page.locator('input[name=code]').fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Verifikasi' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Kode salah' })).toBeVisible();
    await page.locator('input[name=code]').fill(code);
    await page.getByRole('button', { name: 'Verifikasi' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Password reset & e-mail verification pages', () => {
  test('login links to "lupa kata sandi", which answers the same way for any e-mail', async ({ page }) => {
    await page.goto('/masuk');
    await page.getByRole('link', { name: 'Lupa kata sandi?' }).click();
    await expect(page).toHaveURL(/\/lupa-sandi$/);
    await page.locator('input[name=email]').fill('bukan-email');
    await page.getByRole('button', { name: 'Kirim tautan' }).click();
    await expect(page.getByRole('alert')).toHaveText('Masukkan email yang valid.');
    await page.locator('input[name=email]').fill('tidak-terdaftar@contoh.id');
    await page.getByRole('button', { name: 'Kirim tautan' }).click();
    await expect(page.getByRole('status')).toContainText('Kalau tidak-terdaftar@contoh.id terdaftar di MAM!');
  });

  test('invalid verification and reset links explain what to do', async ({ page }) => {
    await page.goto('/verifikasi-email?token=tautan-palsu-yang-tidak-pernah-dibuat-123');
    await expect(page.getByRole('heading', { name: 'Tautan tidak berlaku' })).toBeVisible();
    await page.goto('/atur-ulang-sandi?token=tautan-palsu-yang-tidak-pernah-dibuat-123');
    await page.locator('input[name=password]').fill('sandi-baru-123');
    await page.locator('input[name=confirm]').fill('sandi-baru-124');
    await page.getByRole('button', { name: 'Simpan kata sandi' }).click();
    await expect(page.getByRole('alert')).toContainText('tidak sama');
    await page.locator('input[name=confirm]').fill('sandi-baru-123');
    await page.getByRole('button', { name: 'Simpan kata sandi' }).click();
    await expect(page.getByRole('alert')).toContainText('kedaluwarsa');
    await expect(page.getByRole('link', { name: 'Minta tautan baru' })).toBeVisible();
  });

  test('a freshly registered user sees the verification banner', async ({ page }) => {
    await page.goto('/masuk?daftar');
    await page.locator('input[name=displayName]').fill('Belum Verifikasi');
    await page.locator('input[name=email]').fill(`belum-${Date.now()}@contoh.id`);
    await page.locator('input[name=password]').fill('gudeg-enak-123');
    await page.getByRole('button', { name: 'Buat akun' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('status').filter({ hasText: 'Verifikasi email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kirim ulang email' })).toBeVisible();
  });
});
