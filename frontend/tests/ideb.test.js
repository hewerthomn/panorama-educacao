import test from "node:test";
import assert from "node:assert/strict";
import {
  idebColor,
  idebScale,
  idebNoData,
  idebGradient,
  filterResults,
  historyFor,
  comparison,
  rankResults,
  joinInfrastructure,
  createIdebStore,
} from "../src/ideb.js";
const rows = [];
for (const [city, values] of [
  ["1100015", [5, null, 6.2]],
  ["1100023", [6, 6.1, 5.8]],
  ["1100031", [null, null, null]],
]) {
  for (const [i, year] of [2021, 2023, 2025].entries())
    rows.push({
      year,
      uf: "RO",
      level: "municipality",
      municipality_id: city,
      name: city,
      stage: "anos_iniciais",
      network: "Pública",
      ideb: values[i],
      status: values[i] === null ? "not_published" : "available",
    });
}
const options = { year: 2025, stage: "anos_iniciais", network: "Pública" };
test("escala absoluta 0–10 e cinza para ausências, sem percentuais", () => {
  assert.deepEqual(
    idebScale.map((r) => r.value),
    [0, 2.5, 5, 7.5, 10],
  );
  assert.equal(idebColor(0), "#bc3c45");
  assert.equal(idebColor(10), "#227454");
  for (const x of [null, undefined, NaN, -1, 11])
    assert.equal(idebColor(x), idebNoData);
  assert.equal(idebColor(5), "#e8c45c");
  assert.match(idebGradient, /100%/);
});
test("comparação usa edição anterior publicada da mesma etapa e rede", () => {
  const series = historyFor(rows, [2021, 2023, 2025], {
    city: "1100015",
    stage: "anos_iniciais",
    network: "Pública",
  });
  assert.deepEqual(
    series.map((r) => r.ideb),
    [5, null, 6.2],
  );
  const c = comparison(series, 2025);
  assert.equal(c.previous.year, 2021);
  assert.equal(c.delta, 1.2);
  assert.equal(comparison(series, 2023).delta, null);
  assert.deepEqual(
    filterResults(rows, { ...options, city: "1100015" }).map((r) => r.ideb),
    [6.2],
  );
  assert.equal(
    filterResults(rows, { ...options, stage: "ensino_medio" }).length,
    0,
  );
});
test("ranking exclui municípios sem nota e ordena notas e diferenças", () => {
  assert.deepEqual(
    rankResults(rows, [], { ...options, order: "highest" }).map((r) => r.name),
    ["1100015", "1100023"],
  );
  assert.deepEqual(
    rankResults(rows, [], { ...options, order: "lowest" }).map((r) => r.name),
    ["1100023", "1100015"],
  );
  assert.equal(
    rankResults(rows, [], { ...options, order: "gain" })[0].delta,
    1.2,
  );
  assert.equal(
    rankResults(rows, [], { ...options, order: "loss" })[0].delta,
    -0.3,
  );
});
test("histórico do ranking mantém identidade territorial, etapa e rede", () => {
  const observations = [
    { year: 2021, level: "school", school_id: "123", municipality_id: "123", stage: "ai", network: "Estadual", ideb: 4, name: "Escola" },
    { year: 2023, level: "school", school_id: "123", municipality_id: "123", stage: "ai", network: "Estadual", ideb: null, name: "Escola" },
    { year: 2025, level: "school", school_id: "123", municipality_id: "123", stage: "ai", network: "Estadual", ideb: 6, name: "Escola" },
    { year: 2023, level: "school", school_id: "123", municipality_id: "123", stage: "af", network: "Estadual", ideb: 3, name: "Escola" },
    { year: 2025, level: "school", school_id: "123", municipality_id: "123", stage: "af", network: "Estadual", ideb: 5, name: "Escola" },
    { year: 2021, level: "school", school_id: "123", municipality_id: "123", stage: "ai", network: "Municipal", ideb: 8, name: "Escola" },
    { year: 2025, level: "school", school_id: "123", municipality_id: "123", stage: "ai", network: "Municipal", ideb: 7, name: "Escola" },
    { year: 2021, level: "municipality", school_id: null, municipality_id: "123", stage: "ai", network: "Pública", ideb: 5, name: "Município" },
    { year: 2025, level: "municipality", school_id: null, municipality_id: "123", stage: "ai", network: "Pública", ideb: 6, name: "Município" },
    { year: 2025, level: "school", school_id: "999", municipality_id: "321", stage: "ai", network: "Estadual", ideb: 6, name: "Outra escola" },
  ];
  const ranked = rankResults(observations, [], {
    year: 2025, stage: "ai", network: "Pública", order: "highest",
  });
  const byId = Object.fromEntries(ranked.map((r) => [`${r.level}:${r.school_id || r.municipality_id}:${r.network}`, r]));
  assert.equal(byId["school:123:Estadual"].previous.year, 2021);
  assert.equal(byId["school:123:Estadual"].delta, 2);
  assert.equal(byId["school:123:Municipal"].delta, -1);
  assert.equal(byId["municipality:123:Pública"].delta, 1);
  assert.equal(byId["school:999:Estadual"].previous, null);
  assert.deepEqual(
    rankResults(observations, [], { year: 2025, stage: "ai", network: "Pública", order: "gain" }).map((r) => r.name),
    ["Escola", "Município", "Escola"],
  );
  assert.deepEqual(
    rankResults(observations, [], { year: 2025, stage: "ai", network: "Pública", order: "loss" }).map((r) => r.name),
    ["Escola", "Município", "Escola"],
  );
});
test("empates no ranking têm ordenação determinística por nome e código", () => {
  const tied = ["B", "A"].map((name) => ({
    year: 2025, level: "municipality", municipality_id: name,
    stage: "anos_iniciais", network: "Pública", ideb: 6, name,
  }));
  assert.deepEqual(rankResults(tied, [], {
    year: 2025, stage: "anos_iniciais", network: "Pública", order: "highest",
  }).map((r) => r.name), ["A", "B"]);
});
test("uma escola possui observações separadas por etapa, edição e rede", () => {
  const schools = rows
    .slice(0, 3)
    .map((r) => ({
      ...r,
      level: "school",
      school_id: "11000001",
      network: "Estadual",
    }));
  schools.push({ ...schools[2], stage: "anos_finais", ideb: 4.1 });
  assert.equal(
    filterResults(schools, { ...options, network: "Pública" }).length,
    1,
  );
  assert.equal(
    historyFor(schools, [2025], {
      school: "11000001",
      stage: "anos_finais",
      network: "Estadual",
    })[0].ideb,
    4.1,
  );
  assert.equal(
    filterResults(schools, { ...options, network: "Privada" }).length,
    0,
  );
  assert.equal(
    joinInfrastructure(schools[2], {
      year: 2025,
      schools: [{ id: "11000001" }],
    }).status,
    "matched",
  );
  assert.equal(
    joinInfrastructure(schools[2], { year: 2023, schools: [] }).status,
    "year_mismatch",
  );
  assert.equal(
    joinInfrastructure(schools[2], { year: 2025, schools: [] }).status,
    "school_not_found",
  );
  assert.equal(joinInfrastructure(schools[2], null).status, "missing");
});
test("cache assíncrono compartilha requisição e permite retry após falha", async () => {
  let calls = 0;
  const store = createIdebStore(async (path) => {
    calls++;
    assert.equal(path, "data/ideb/RO/file.json");
    if (calls === 1) throw Error("offline");
    return {
      schema_version: 1,
      uf: "RO",
      stage: "anos_iniciais",
      level: "school",
      records: [],
    };
  });
  const args = ["RO", "anos_iniciais", "school", { path: "file.json" }];
  const first = store.get(...args);
  assert.equal(first, store.get(...args));
  await assert.rejects(first, /offline/);
  assert.deepEqual(await store.get(...args), []);
  assert.equal(calls, 2);
});
test("cache rejeita payload de outra UF ou esquema", async () => {
  const store = createIdebStore(async () => ({
    schema_version: 0,
    uf: "AC",
    records: [],
  }));
  await assert.rejects(
    store.get("RO", "anos_iniciais", "school", { path: "x.json" }),
    /incompatível/,
  );
});
