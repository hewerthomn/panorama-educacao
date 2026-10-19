import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manifest, geo } from '../fixtures/infrastructure.js';

async function setup(page, data = manifest) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/data/index.json', route => route.fulfill({ json: { states: [{ uf: 'RO', name: 'Rondônia' }, { uf: 'AC', name: 'Acre' }] } }));
  await page.route('**/data/*/manifest.json', route => route.fulfill({ json: data }));
  await page.route('**/data/*/municipios.geojson', route => route.fulfill({ json: geo }));
  await page.route('**/*.tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/tests/e2e/fixtures/dashboard.html?uf=RO');
  await expect(page).toHaveTitle('Panorama da Educação');
  await expect(page.locator('h1')).toHaveText('Panorama da Educação');
  await expect(page.locator('.kpi.primary strong')).toHaveText('50,0%');
  return errors;
}
async function filters(page, isMobile, action) {
  if (isMobile) await page.getByRole('button', { name: 'Filtros', exact: true }).tap();
  await action();
  if (isMobile) await page.getByRole('button', { name: 'Fechar filtros', exact: true }).tap();
}
async function choose(page, name, query, option) {
  await page.getByRole('combobox', { name, exact: true }).fill(query);
  await page.getByRole('option', { name: option, exact: true }).click();
}
const colors = page => page.evaluate(() => window.mapLayer.getLayers().map(layer => layer.options.fillColor));
const charts = page => page.evaluate(() => window.chartSnapshots());

test('alternância atualiza KPIs, escala, mapa, donuts, ranking e histórico', async ({ page, isMobile }, testInfo) => {
  const errors = await setup(page);
  const schoolColors = await colors(page);
  await page.getByRole('button', { name: 'Matrículas', exact: true }).click();
  await expect(page.locator('.kpi.primary strong')).toHaveText('46,7%');
  await expect(page.locator('.kpi strong')).toHaveText(['46,7%', '140', '300', '30']);
  await expect(page.locator('.coverage-note')).toContainText('Escolas sem informação de matrícula: 1');
  await expect(page.locator('.map-legend strong')).toHaveText('Matrículas em escolas sem o recurso');
  expect(await colors(page)).not.toEqual(schoolColors);
  expect((await colors(page))[2]).toBe('#92999f');
  await expect(page.locator('.donut-total strong')).toHaveText(['140', '140']);
  const snapshots = await charts(page);
  const trend = snapshots.find(chart => chart.type === 'line');
  expect(trend.labels).toEqual([2024, 2025]);
  expect(trend.datasets.map(dataset => dataset.data)).toEqual([[20, 140 / 300 * 100], [20, 140]]);
  expect(trend.datasets.map(dataset => dataset.yAxisID)).toEqual(['y', 'total']);
  expect([trend.min, trend.max]).toEqual([0, 100]);
  expect(snapshots.filter(chart => chart.type === 'doughnut').map(chart => chart.datasets[0].data)).toEqual([[60, 0, null, 80], [60, 80]]);
  const ranking = page.locator('.below').first();
  await expect(ranking.locator('tbody tr').first()).toContainText('Município B');
  await expect(ranking.locator('tbody tr').first()).toContainText('80,0%');
  await expect(ranking.locator('tbody tr').first()).toContainText('100');
  await page.getByText('Consultar valores por ano', { exact: true }).click();
  await expect(page.locator('.series-details tbody')).toContainText('140 / 300');
  if (!isMobile) {
    await page.setViewportSize({ width: 1536, height: 1000 });
    const boxes = await page.locator('.complementary-charts > *').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    expect(new Set(boxes.map(box => Math.round(box.y))).size).toBe(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), `panorama-enrollments-${testInfo.project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Escolas', exact: true }).click();
  await expect(page.locator('.kpi.primary strong')).toHaveText('50,0%');
  expect(await colors(page)).toEqual(schoolColors);
  expect((await charts(page)).find(chart => chart.type === 'line').datasets).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('filtros e reprodução temporal recalculam as matrículas e cores', async ({ page, isMobile }) => {
  const errors = await setup(page);
  await page.getByRole('button', { name: 'Matrículas', exact: true }).click();
  await page.locator('#year-slider').fill('0');
  await expect(page.locator('.kpi.primary strong')).toHaveText('20,0%');
  const before = await colors(page);
  await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
  await expect(page.locator('.reference-year strong')).toHaveText('2025');
  await expect(page.locator('.kpi.primary strong')).toHaveText('46,7%');
  expect(await colors(page)).not.toEqual(before);
  await filters(page, isMobile, async () => {
    await choose(page, 'Município', 'Município A', 'Município A');
  });
  await expect(page.locator('.kpi.primary strong')).toHaveText('30,0%');
  await expect(page.locator('.kpi.primary small')).toContainText('+10,0 p.p. em relação a 2024');
  await filters(page, isMobile, async () => {
    await page.getByRole('combobox', { name: 'Rede de ensino', exact: true }).selectOption('3');
  });
  await expect(page.locator('.kpi strong')).toHaveText(['100,0%', '60', '60', '0']);
  await expect(page.locator('.donut-total strong')).toHaveText(['60', '60']);
  await filters(page, isMobile, async () => {
    await page.getByRole('combobox', { name: 'Localização', exact: true }).selectOption('2');
  });
  await expect(page.locator('.kpi.primary strong')).toHaveText('N/D');
  await filters(page, isMobile, async () => {
    await page.getByRole('combobox', { name: 'Localização', exact: true }).selectOption('1');
    await choose(page, 'Indicador', 'internet', 'Acesso à internet');
  });
  await expect(page.locator('.kpi.primary strong')).toHaveText('0,0%');
  await expect(page.locator('.kpi strong').nth(1)).toHaveText('0');
  await filters(page, isMobile, async () => {
    await choose(page, 'Estado', 'Acre', 'Acre (AC)');
  });
  await expect(page.locator('.territory')).toContainText('Todos os municípios');
  // A troca de UF restaura o primeiro indicador disponível e preserva a perspectiva.
  await expect(page.getByRole('button', { name: 'Matrículas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('manifesto antigo mantém Escolas e explica indisponibilidade de Matrículas', async ({ page }) => {
  const legacy = structuredClone(manifest);
  legacy.schema_version = 1;
  legacy.records.forEach(row => delete row.infrastructure);
  const errors = await setup(page, legacy);
  await page.getByRole('button', { name: 'Matrículas', exact: true }).click();
  await expect(page.locator('.kpi.primary strong')).toHaveText('N/D');
  await expect(page.locator('.message.warning')).toContainText('Regenere os dados');
  expect(await colors(page)).toEqual(['#92999f', '#92999f', '#92999f']);
  await expect(page.locator('.donut-total strong')).toHaveText(['N/D', 'N/D']);
  expect(errors).toEqual([]);
});
