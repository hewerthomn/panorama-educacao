import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, subset, previousComparison, colorFor, gradientFor, noDataColor } from '../src/data.js';
import { distributionFor } from '../src/distribution.js';
import { records, manifest } from './fixtures/infrastructure.js';

const rows = subset(manifest, 2025, 'all', 'all', 'all');

test('duas perspectivas usam numeradores e denominadores diferentes', () => {
  const schools = compute(rows, 'water');
  const enrollments = compute(rows, 'water', 'enrollments');
  assert.equal(schools.yes, 2);
  assert.equal(schools.valid, 4);
  assert.equal(schools.pct, 50);
  assert.equal(enrollments.yes, 140);
  assert.equal(enrollments.valid, 300);
  assert.equal(enrollments.pct, 140 / 300 * 100);
  assert.equal(enrollments.unknown, 30);
  assert.equal(enrollments.missingEnrollmentSchools, 1);
  assert.equal(enrollments.schoolsUnknown, 2);
});

test('zero válido, matrícula desconhecida e indicador nulo não se confundem', () => {
  const unknown = compute([records[4]], 'water', 'enrollments');
  assert.equal(unknown.pct, null);
  assert.equal(unknown.yes, null);
  assert.equal(unknown.unknown, 30);
  assert.equal(unknown.missingEnrollmentSchools, 1);
  const zero = structuredClone(records[1]);
  zero.matriculas = 0;
  zero.infrastructure.water = [0, 1, 0, 0, 0, 0, 0, 0];
  assert.equal(compute([zero], 'water', 'enrollments').yes, 0);
  assert.equal(compute([zero], 'water', 'enrollments').pct, null);
  zero.matriculas_valid = 0;
  zero.infrastructure.water[7] = 1;
  assert.equal(compute([zero], 'water', 'enrollments').yes, null);
  const old = { ...records[1], infrastructure: undefined };
  assert.equal(compute([old], 'water', 'enrollments').pct, null);
  assert.equal(compute([old], 'water', 'enrollments').yes, null);
  assert.equal(compute([old], 'water').pct, 0);
});

test('percentuais resultam dos totais e todos os filtros são respeitados', () => {
  const distribution = distributionFor(manifest, { dimension: 'rede', year: 2025, metric: 'water', mode: 'enrollments' });
  assert.equal(distribution.total.yes, 140);
  const municipal = distribution.categories.find(c => c.id === '3');
  assert.equal(municipal.yes, 60);
  assert.equal(municipal.share, 60 / 140 * 100);
  assert.equal(municipal.pct, 100);
  const local = distributionFor(manifest, { dimension: 'localizacao', year: 2025, metric: 'water', mode: 'enrollments', rede: '4', area: '2', city: '1100023' });
  assert.equal(local.total.yes, 80);
  assert.equal(local.categories[1].share, 100);
  assert.equal(local.categories[1].pct, 80);
  assert.equal(local.categories[0].yes, 0);
});

test('histórico preserva anos, totais e recortes, sem comparar cobertura incompleta', () => {
  const series = manifest.years.map(year => ({ year, ...compute(subset(manifest, year, 'all', 'all', '1100015'), 'water', 'enrollments') }));
  assert.deepEqual(series.map(p => p.year), [2024, 2025]);
  assert.deepEqual(series.map(p => p.yes), [20, 60]);
  assert.deepEqual(series.map(p => p.pct), [20, 30]);
  assert.deepEqual(previousComparison(series, 2025, 'enrollments'), { year: 2024, delta: 10 });
  assert.equal(previousComparison([{ ...series[0], missingEnrollmentSchools: 1 }, series[1]], 2025, 'enrollments'), null);
  assert.equal(previousComparison([{ ...series[0], pct: null }, series[1]], 2025, 'enrollments'), null);
});

test('mapa de deficiência inverte só as cores, com escala fixa e N/D cinza', () => {
  assert.equal(colorFor(0, 'enrollments'), colorFor(100));
  assert.equal(colorFor(100, 'enrollments'), colorFor(0));
  assert.equal(colorFor(50, 'enrollments'), colorFor(50));
  assert.equal(colorFor(null, 'enrollments'), noDataColor);
  assert.ok(gradientFor('enrollments').startsWith('linear-gradient(to right, #327553 0%'));
});

test('matrículas conhecidas em escola não classificada não zeram as desconhecidas em escola sem recurso', () => {
  const mixed = { ...records[1], schools: 2, matriculas: 100, matriculas_valid: 1,
    metrics: { water: [0, 1] }, infrastructure: { water: [0, 1, 1, 0, null, 100, null, 1] } };
  const result = compute([mixed], 'water', 'enrollments');
  assert.equal(result.yes, null);
  assert.equal(result.valid, null);
  assert.equal(result.pct, null);
  assert.equal(result.unknown, 100);
  const partiallyKnown = compute([mixed, records[2]], 'water', 'enrollments');
  assert.equal(partiallyKnown.yes, 0);
  assert.equal(partiallyKnown.valid, 140);
  assert.equal(partiallyKnown.pct, 0);
  assert.equal(partiallyKnown.missingEnrollmentSchools, 1);
});
