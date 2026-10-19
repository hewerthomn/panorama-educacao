import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  final,
  annual,
  manifest,
  school,
} from "./fixtures/longitudinal.js";
import {
  classify,
  indexSchools,
  compareSchools,
  summarize,
  schoolHistory,
  rankMunicipalities,
  evolutionColor,
  points,
} from "../src/longitudinal.js";
import { createSchoolStore } from "../src/schoolStore.js";
const before = indexSchools(initial),
  after = indexSchools(final);
const entries = compareSchools(before, after, "water");
test("classifica todas as transições, nulos e valores inválidos sem coerção", () => {
  assert.equal(classify(0, 1), "improved");
  assert.equal(classify(1, 0), "worsened");
  assert.equal(classify(0, 0), "retainedWithout");
  assert.equal(classify(1, 1), "retainedWith");
  for (const value of [null, undefined, "0", "1", 2, -1, false])
    assert.equal(classify(value, 1), "invalid");
  assert.equal(entries.find((s) => s.id === "6").transition, "left");
  assert.equal(entries.find((s) => s.id === "7").transition, "entered");
});
test("código Inep vincula nomes e categorias alteradas; sem contagem duplicada", () => {
  const moved = entries.find((s) => s.id === "1");
  assert.equal(moved.transition, "improved");
  assert.deepEqual(moved.changed, ["name", "municipio", "rede", "localizacao"]);
  assert.equal(entries.length, 8);
  assert.throws(() => indexSchools([initial[0], initial[0]]), /duplicado/);
  assert.throws(() => indexSchools([school(null, 1)]), /ausente/);
});
test("taxas usam somente escolas válidas em ambos anos; totais aditivos por categoria", () => {
  const { total, groups } = summarize(entries);
  assert.deepEqual(total, {
    improved: 1,
    worsened: 1,
    retainedWith: 1,
    retainedWithout: 1,
    invalid: 2,
    left: 1,
    entered: 1,
    changed: 1,
    comparable: 4,
    improvementRate: 25,
    worseningRate: 25,
    balance: 0,
  });
  assert.equal(groups.municipio["1100015"].improved, 1);
  assert.equal(groups.municipio["1100023"].improved, 0);
  assert.equal(groups.rede["3"].improved, 1);
  assert.equal(groups.localizacao["1"].improved, 1);
  for (const buckets of Object.values(groups))
    assert.equal(
      Object.values(buckets).reduce((sum, g) => sum + g.comparable, 0),
      4,
    );
});
test("filtros seguem o ano inicial; mudança de categoria não vira entrada/saída", () => {
  const a = compareSchools(before, after, "water", {
    city: "1100015",
    rede: "3",
    area: "1",
  });
  assert.equal(summarize(a).total.comparable, 3);
  assert.equal(a.find((s) => s.id === "1").after.rede, "2");
  const b = compareSchools(before, after, "water", {
    city: "1100023",
    rede: "4",
    area: "2",
  });
  assert.deepEqual(
    b.map((s) => s.id),
    ["4", "7"],
  );
  assert.equal(summarize(b).total.entered, 1);
  assert.equal(
    summarize(compareSchools(before, after, "water", { rede: "2" })).total
      .entered,
    0,
  );
});
test("denominador zero é N/D; comparação genérica para qualquer indicador", () => {
  const missing = summarize(
    compareSchools(before, after, "water", { city: "1100031" }),
  ).total;
  assert.equal(missing.comparable, 0);
  assert.equal(missing.invalid, 1);
  assert.equal(missing.balance, null);
  assert.equal(missing.improvementRate, null);
  assert.equal(summarize([]).total.worseningRate, null);
  const internet = summarize(compareSchools(before, after, "internet")).total;
  assert.equal(internet.retainedWith, 6);
  assert.equal(internet.balance, 0);
});
test("períodos distintos, lacunas e histórico individual com metadados anuais reais", () => {
  const maps = new Map(
    [...annual].map(([y, schools]) => [y, indexSchools(schools)]),
  );
  const history = schoolHistory("1", manifest.years, maps, "water");
  assert.deepEqual(
    history.map((r) => r.value),
    [0, null, 1],
  );
  assert.equal(history.at(-1).school.name, "Novo nome");
  assert.equal(
    schoolHistory("6", manifest.years, maps, "water").at(-1).school,
    null,
  );
  assert.deepEqual(
    summarize(compareSchools(maps.get(2022), after, "water")).total.comparable,
    1,
  );
  assert.equal(
    summarize(compareSchools(maps.get(2022), after, "water")).total
      .retainedWithout,
    0,
  );
});
test("rankings excluem N/D e ordenam quatro perspectivas; escala fixa simétrica", () => {
  const stats = {
    a: { comparable: 10, improvementRate: 20, worseningRate: 0, balance: 20 },
    b: { comparable: 2, improvementRate: 0, worseningRate: 50, balance: -50 },
    c: { comparable: 0, balance: null },
  };
  const cities = ["a", "b", "c"].map((id) => ({ id, name: id }));
  for (const [order, id] of [
    ["improvement", "a"],
    ["worsening", "b"],
    ["balancePositive", "a"],
    ["balanceNegative", "b"],
  ])
    assert.equal(rankMunicipalities(cities, stats, order)[0].id, id);
  assert.equal(evolutionColor(-100), "#b7443e");
  assert.equal(evolutionColor(0), "#edf0ed");
  assert.equal(evolutionColor(100), "#327553");
  assert.equal(evolutionColor(null), "#92999f");
  assert.notEqual(evolutionColor(-1), evolutionColor(-100));
  assert.equal(points(25), "+25,0 p.p.");
});
test("cache deduplica requisições simultâneas e permite retry de erro", async () => {
  let calls = 0;
  const store = createSchoolStore(async (year) => {
    calls++;
    return { year, schools: initial };
  });
  const [a, b] = await Promise.all([store.get(2020), store.get(2020)]);
  assert.equal(a, b);
  assert.equal(calls, 1);
  let fails = true;
  const retry = createSchoolStore(async (year) => {
    if (fails) throw new Error("rede");
    return { year, schools: final };
  });
  await assert.rejects(retry.get(2025), /rede/);
  fails = false;
  assert.equal((await retry.get(2025)).size, final.length);
  await assert.rejects(
    createSchoolStore(async () => ({ year: 0, schools: [] })).get(2025),
    /inválido/,
  );
});
