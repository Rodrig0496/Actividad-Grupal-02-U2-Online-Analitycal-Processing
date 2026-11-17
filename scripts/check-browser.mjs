import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('DuckDB listo'), null, { timeout: 90_000 });
  const manifest = await page.evaluate(async () => {
    const response = await fetch(new URL('data/manifest.json', location.href));
    return response.json();
  });
  const readInteger = async selector => Number((await page.locator(selector).innerText()).replace(/\D/g, ''));
  assert.equal(await readInteger('#sale-lines'), manifest.rows);
  assert.equal(await readInteger('#units'), manifest.units);
  assert.equal(Number((await page.locator('#revenue').innerText()).replace(/[^\d.-]/g, '')), Number(manifest.revenue));
  assert.equal(await page.locator('#results tbody tr').count(), 24);
  const initialRevenue = await page.locator('#revenue').innerText();
  await page.locator('select[name=year]').selectOption('2025');
  await page.waitForFunction(() => !document.querySelector('#controls').disabled);
  assert.equal(await page.locator('#results tbody tr').count(), 12);
  assert.ok(await readInteger('#sale-lines') < manifest.rows);
  await page.locator('select[name=region]').selectOption('Sur');
  await page.waitForFunction(() => !document.querySelector('#controls').disabled);
  await page.locator('select[name=category]').selectOption('Tecnología');
  await page.waitForFunction(() => !document.querySelector('#controls').disabled);
  assert.ok((await page.locator('#detail-sql').textContent()).includes("region = 'Sur'"));
  await page.locator('select[name=dimension]').selectOption('city');
  await page.waitForFunction(() => !document.querySelector('#controls').disabled);
  assert.equal(await page.locator('#results tbody tr').count(), 2);
  await page.locator('#pivot-tab').click();
  await page.waitForFunction(() => !document.querySelector('#pivot-tab').disabled);
  assert.equal(await page.locator('#pivot-tab').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#operation tbody tr').count(), 1);
  assert.match(await page.locator('#operation tbody tr').innerText(), /Sur/);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'ventas-seleccion.csv');
  assert.equal(await download.failure(), null);
  await page.locator('#reset-filters').click();
  await page.waitForFunction(() => !document.querySelector('#controls').disabled);
  assert.equal(await readInteger('#sale-lines'), manifest.rows);
  assert.equal(await page.locator('#revenue').innerText(), initialRevenue);
  await page.locator('#rollup-tab').click();
  await page.waitForFunction(() => !document.querySelector('#rollup-tab').disabled);
  assert.equal(await page.locator('#operation tbody tr').count(), 11);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('OK DuckDB-Wasm, filtros, drill-down, roll-up, pivot, CSV, reset y ancho móvil');
} catch (error) {
  console.log('Estado de la aplicación:', await page.locator('#status').textContent());
  console.log('Consulta actual:', await page.locator('#detail-sql').textContent());
  console.log('Errores del navegador:', errors);
  await page.screenshot({ path: 'test-results/failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
