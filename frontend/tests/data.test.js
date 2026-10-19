import test from "node:test";
import assert from "node:assert/strict";
import {
  compute,
  colorFor,
  mapScale,
  mapGradient,
  noDataColor,
  subset,
} from "../src/data.js";

test("a escala usa vermelho, âmbar e verde nos limites fixos de percentual", () => {
  assert.equal(colorFor(0), "#b7443e");
  assert.equal(colorFor(50), "#e5c46b");
  assert.equal(colorFor(100), "#327553");
  for (const stop of mapScale) {
    assert.equal(colorFor(stop.value), stop.color);
    assert.ok(mapGradient.includes(`${stop.color} ${stop.value}%`));
  }
});
test("interpola continuamente entre âncoras sem reescalar pelo recorte", () => {
  assert.equal(colorFor(12.5), "#c86947");
  assert.notEqual(colorFor(12), colorFor(13));
  assert.equal(colorFor(-1), colorFor(0));
  assert.equal(colorFor(101), colorFor(100));
});
test("ausências e valores inválidos usam cinza sem confundir zero válido", () => {
  for (const missing of [null, undefined, NaN, Infinity, -Infinity, "", "0"]) {
    assert.equal(colorFor(missing), noDataColor);
  }
  assert.notEqual(colorFor(0), noDataColor);
});
test("zero com respostas válidas é zero; ausência de respostas é N/D", () => {
  const zero = compute([{ schools: 5, metrics: { water: [0, 5] } }], "water");
  const missing = compute([{ schools: 5, metrics: {} }], "water");
  assert.equal(zero.pct, 0);
  assert.equal(zero.unknown, 0);
  assert.equal(missing.pct, null);
  assert.equal(missing.unknown, 5);
  assert.notEqual(colorFor(zero.pct), colorFor(missing.pct));
});
test("filtros combinados preservam a proporção de respostas válidas", () => {
  const records = [
    {
      year: 2020,
      municipio: "1",
      rede: "3",
      localizacao: "2",
      schools: 5,
      metrics: { water: [2, 4] },
    },
    {
      year: 2021,
      municipio: "1",
      rede: "3",
      localizacao: "2",
      schools: 8,
      metrics: { water: [2, 4] },
    },
    {
      year: 2021,
      municipio: "2",
      rede: "4",
      localizacao: "1",
      schools: 3,
      metrics: { water: [0, 3] },
    },
  ];
  const result = compute(subset({ records }, 2021, "3", "2", "1"), "water");
  assert.equal(result.schools, 8);
  assert.equal(result.pct, 50);
  assert.equal(result.unknown, 4);
  assert.equal(
    colorFor(result.pct),
    colorFor(compute([records[0]], "water").pct),
  );
});
