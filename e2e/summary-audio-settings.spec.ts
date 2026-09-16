import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
let vite: ViteDevServer;
let base: string;
test.beforeEach(async ({ page }) => {
  await page.route('**/api/accessibility/track', r => r.fulfill({ json: { ok: true } }));
  page.on('pageerror', error => { console.error('UI runtime error:', error.message); });
  page.on('console', message => { if (message.type() === 'error') console.error('UI console:', message.text()); });
});
test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: process.cwd(), plugins: [react()],
    resolve: { alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') } },
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await vite.listen(); base = vite.resolvedUrls!.local[0];
});
test.afterAll(async () => { await vite?.close(); });
const defaults = { primaryProvider: 'humain', humainVoiceId: 'cabd361b-cb91-4eb6-8d35-c8660bf82e7a', elevenlabsVoiceId: 'MI88rOZjXbH22N8KHXUo' };
const catalog = {
  humainVoices: [
    { id: defaults.humainVoiceId, name: 'عبدالله', description: 'سعودي نجدي — رجل' },
    { id: '9bbc9620-a2ff-489b-b292-5007210f49ca', name: 'عبدالعزيز' },
    { id: '42e38a63-849a-481a-b5bf-3c1b7a985de3', name: 'نورة' },
    { id: '19965876-8cd6-4b8c-9af4-35cbec69ff1d', name: 'سارة' },
  ],
  elevenlabsVoices: [{ id: defaults.elevenlabsVoiceId, name: 'علي — راوي سعودي عميق' }],
  configured: { humain: true, elevenlabs: true },
};
test('choose, preview, save and reload the Saudi voice; responsive RTL', async ({ page }, testInfo) => {
  let settings = { ...defaults }; let saves = 0; let previewVoice = '';
  await page.route('**/api/csrf-token', r => r.fulfill({ json: { csrfToken: 'local-test-token' } }));
  await page.route('**/api/system/summary-audio-settings', async r => {
    if (r.request().method() === 'PUT') { settings = r.request().postDataJSON(); saves++; expect(r.request().headers()['x-csrf-token']).toBe('local-test-token'); }
    await r.fulfill({ json: { settings, ...catalog } });
  });
  await page.route('**/api/system/summary-audio-settings/preview', async r => {
    previewVoice = r.request().postDataJSON().voiceId;
    const wav = Buffer.alloc(44 + 4800); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(4800, 40);
    await r.fulfill({ contentType: 'audio/wav', body: wav });
  });
  await page.goto(`${base}e2e/fixtures/summary-audio.html`);
  await page.getByLabel('صوت HUMAIN', { exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await page.getByRole('option', { name: 'سارة', exact: true }).click();
  await page.getByRole('button', { name: 'استمع إلى عينة HUMAIN' }).click();
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
  expect(previewVoice).toBe(catalog.humainVoices[3].id); expect(saves).toBe(0);
  await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'حفظ إعدادات الصوت' }).click();
  await expect(page.getByText('تم حفظ صوت الموجز', { exact: true })).toBeVisible(); expect(saves).toBe(1);
  await page.reload(); await expect(page.getByLabel('صوت HUMAIN', { exact: true })).toContainText('سارة');
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'حفظ إعدادات الصوت' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});
test('missing key remains explicit and cannot generate a preview', async ({ page }) => {
  await page.route('**/api/system/summary-audio-settings', r => r.fulfill({ json: { settings: defaults, ...catalog, configured: { humain: false, elevenlabs: true } } }));
  await page.goto(`${base}e2e/fixtures/summary-audio.html`);
  await expect(page.getByRole('button', { name: 'استمع إلى عينة HUMAIN' })).toBeDisabled();
  await expect(page.getByText('المفتاح غير مضاف', { exact: true })).toBeVisible();
});
test('preview and save failures preserve the draft and report the failure', async ({ page }) => {
  await page.route('**/api/csrf-token', r => r.fulfill({ json: { csrfToken: 'test' } }));
  await page.route('**/api/system/summary-audio-settings', r => r.request().method() === 'PUT'
    ? r.fulfill({ status: 500, json: { message: 'تعذّر الحفظ' } })
    : r.fulfill({ json: { settings: defaults, ...catalog } }));
  await page.route('**/api/system/summary-audio-settings/preview', r => r.fulfill({ status: 503, json: { message: 'تعذّرت المعاينة' } }));
  await page.goto(`${base}e2e/fixtures/summary-audio.html`);
  await page.getByLabel('صوت HUMAIN', { exact: true }).click();
  await page.getByRole('option', { name: 'نورة', exact: true }).click();
  await page.getByRole('button', { name: 'استمع إلى عينة HUMAIN' }).click();
  await expect(page.getByText('تعذّرت معاينة الصوت المحدد', { exact: true })).toBeVisible();
  await expect(page.locator('audio')).toHaveCount(0);
  await page.getByRole('button', { name: 'حفظ إعدادات الصوت' }).click();
  await expect(page.getByText('تعذّر حفظ إعدادات الصوت', { exact: true })).toBeVisible();
  await expect(page.getByLabel('صوت HUMAIN', { exact: true })).toContainText('نورة');
});
test('HUMAIN credit follows the actual audio response and clears for fallback, navigation and failure', async ({ page }, testInfo) => {
  let requests = 0;
  await page.route('**/api/articles/*/summary-audio?**', async r => {
    requests++;
    const provider = new URL(r.request().url()).pathname.split('/')[3];
    if (provider === 'failed') return r.fulfill({ status: 503 });
    const wav = Buffer.alloc(44 + 4800); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(4800, 40);
    await r.fulfill({ contentType: 'audio/wav', headers: provider === 'unknown' ? {} : { 'X-TTS-Provider': provider }, body: wav });
  });
  await page.goto(`${base}e2e/fixtures/summary-audio.html#playback`);
  const credit = page.getByTestId('summary-audio-attribution');
  await expect(credit).toHaveCount(0);
  await page.getByRole('button', { name: 'استماع للموجز', exact: true }).click();
  await expect(credit).toHaveText('الصوت عبر HUMAIN');
  expect(requests).toBe(1);
  expect(await credit.evaluate(el => getComputedStyle(el).fontSize)).toBe('11px');
  expect(await credit.evaluate(el => getComputedStyle(el).color)).toBe('rgb(22, 101, 52)');
  await page.screenshot({ path: testInfo.outputPath('humain-attribution.png'), fullPage: true });
  for (const provider of ['elevenlabs', 'google', 'unknown', 'failed']) {
    await page.getByRole('button', { name: provider, exact: true }).click();
    await expect(credit).toHaveCount(0);
    await page.getByRole('button', { name: 'استماع للموجز', exact: true }).click();
    await expect(page.getByRole('button', { name: 'استماع للموجز', exact: true })).toBeEnabled();
    await expect(credit).toHaveCount(0);
  }
  expect(requests).toBe(5);
});
