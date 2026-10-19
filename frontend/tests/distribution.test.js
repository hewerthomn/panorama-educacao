import test from "node:test";
import assert from "node:assert/strict";
import { distributionFor } from "../src/distribution.js";
const row = (
  rede,
  localizacao,
  yes,
  valid,
  schools = valid,
  municipio = "1",
  year = 2025,
) => ({
  rede,
  localizacao,
  year,
  municipio,
  schools,
  metrics: { water: [yes, valid] },
});
const options = { dimension: "rede", year: 2025, metric: "water" };

test("participação usa contagens, enquanto atendimento usa respostas válidas", () => {
  const data = {
    records: [row("3", "1", 8, 10), row("3", "2", 1, 10), row("2", "1", 1, 2)],
  };
  const result = distributionFor(data, options);
  const municipal = result.categories[0];
  assert.equal(result.total.yes, 10);
  assert.equal(municipal.yes, 9);
  assert.equal(municipal.share, 90);
  assert.equal(municipal.pct, 45);
  assert.equal(
    result.categories.reduce((sum, c) => sum + c.share, 0),
    100,
  );
});
test("cada donut ignora somente o filtro da própria dimensão", () => {
  const data = {
    records: [
      row("3", "1", 2, 4),
      row("3", "2", 1, 3),
      row("2", "1", 5, 5),
      row("4", "2", 3, 6),
      row("1", "2", 8, 8, 8, "2"),
      row("1", "2", 9, 9, 9, "1", 2020),
    ],
  };
  const byNetwork = distributionFor(data, {
    ...options,
    city: "1",
    rede: "3",
    area: "2",
  });
  assert.equal(byNetwork.total.yes, 4);
  assert.equal(byNetwork.categories.find((c) => c.id === "4").yes, 3);
  assert.equal(byNetwork.categories.find((c) => c.id === "1").yes, 0);
  const byLocation = distributionFor(data, {
    ...options,
    dimension: "localizacao",
    city: "1",
    rede: "3",
    area: "2",
  });
  assert.equal(byLocation.total.yes, 3);
  assert.deepEqual(
    byLocation.categories.map((c) => c.yes),
    [2, 1],
  );
});
test("categorias não classificadas participam do total sem perder escolas", () => {
  const result = distributionFor(
    {
      records: [
        row("3", "1", 1, 2),
        row("0", "0", 2, 3),
        row(null, null, 1, 1),
      ],
    },
    options,
  );
  const unknown = result.categories.find((c) => c.id === "unclassified");
  assert.equal(unknown.yes, 3);
  assert.equal(unknown.share, 75);
  assert.equal(
    result.categories.reduce((sum, c) => sum + c.schools, 0),
    result.total.schools,
  );
  assert.equal(
    result.categories.reduce((sum, c) => sum + c.yes, 0),
    result.total.yes,
  );
});
test("ausência, zero válido e categoria sem registros mantêm significados distintos", () => {
  const zero = distributionFor({ records: [row("3", "1", 0, 4)] }, options);
  assert.equal(zero.total.yes, 0);
  assert.equal(zero.total.valid, 4);
  assert.equal(zero.categories[0].pct, 0);
  assert.equal(zero.categories[0].share, null);
  const missing = distributionFor(
    { records: [{ ...row("3", "1", 0, 0, 5), metrics: {} }] },
    options,
  );
  assert.equal(missing.total.valid, 0);
  assert.equal(missing.categories[0].unknown, 5);
  assert.equal(missing.categories[0].pct, null);
  const empty = missing.categories.find((c) => c.id === "4");
  assert.equal(empty.schools, 0);
  assert.equal(empty.pct, null);
});
test("categorias zeradas têm participação zero se houver atendidas no total", () => {
  const result = distributionFor(
    { records: [row("3", "1", 3, 3), row("2", "1", 0, 2)] },
    options,
  );
  assert.equal(result.categories[1].share, 0);
  assert.equal(result.categories[1].pct, 0);
  assert.equal(result.categories[2].share, 0);
  assert.equal(result.categories[2].pct, null);
  assert.equal(result.categories[0].share, 100);
});
