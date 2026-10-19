// Coorte territorial: classificação inicial; entrantes usam a classificação final.
// Respostas estritamente numéricas 0/1. Nenhuma lacuna é inferida.
export const transitions = [
  { key: "improved", label: "Melhoraram", color: "--evolution-positive" },
  { key: "worsened", label: "Pioraram", color: "--evolution-negative" },
  {
    key: "retainedWith",
    label: "Permaneceram com o recurso",
    color: "--accent",
  },
  {
    key: "retainedWithout",
    label: "Permaneceram sem o recurso",
    color: "--evolution-amber",
  },
];
export const transitionLabels = {
  ...Object.fromEntries(transitions.map(({ key, label }) => [key, label])),
  invalid: "Sem comparação válida",
  left: "Saiu da base de escolas ativas",
  entered: "Entrou na base de escolas ativas",
};
export function validAnswer(value) {
  return value === 0 || value === 1;
}
export function classify(before, after) {
  if (!validAnswer(before) || !validAnswer(after)) return "invalid";
  if (before === 0) return after === 1 ? "improved" : "retainedWithout";
  return after === 0 ? "worsened" : "retainedWith";
}
export function indexSchools(schools) {
  const index = new Map();
  for (const school of schools) {
    const id = String(school.id ?? "").trim();
    if (!id || index.has(id))
      throw new Error(`Código Inep ausente ou duplicado: ${id}`);
    index.set(id, school);
  }
  return index;
}
export function inCohort(
  school,
  { city = "all", rede = "all", area = "all" } = {},
) {
  return (
    (city === "all" || String(school.municipio) === city) &&
    (rede === "all" || String(school.rede) === rede) &&
    (area === "all" || String(school.localizacao) === area)
  );
}
export function compareSchools(initial, final, metric, filters = {}) {
  const entries = [];
  for (const [id, before] of initial) {
    if (!inCohort(before, filters)) continue;
    const after = final.get(id) || null;
    entries.push({
      id,
      before,
      after,
      transition: after
        ? classify(before.indicators?.[metric], after.indicators?.[metric])
        : "left",
      changed: after
        ? ["name", "municipio", "rede", "localizacao"].filter(
            (key) => before[key] !== after[key],
          )
        : [],
    });
  }
  for (const [id, after] of final) {
    // A escola fora do recorte inicial não vira entrante por mudar de categoria.
    if (!initial.has(id) && inCohort(after, filters))
      entries.push({
        id,
        before: null,
        after,
        transition: "entered",
        changed: [],
      });
  }
  return entries;
}
function emptyTotals() {
  return {
    improved: 0,
    worsened: 0,
    retainedWith: 0,
    retainedWithout: 0,
    invalid: 0,
    left: 0,
    entered: 0,
    changed: 0,
  };
}
function rates(counts) {
  const comparable = transitions.reduce((sum, { key }) => sum + counts[key], 0);
  return {
    ...counts,
    comparable,
    improvementRate: comparable ? (counts.improved / comparable) * 100 : null,
    worseningRate: comparable ? (counts.worsened / comparable) * 100 : null,
    balance: comparable
      ? ((counts.improved - counts.worsened) / comparable) * 100
      : null,
  };
}
export function summarize(entries) {
  const total = emptyTotals();
  const groups = { municipio: {}, rede: {}, localizacao: {} };
  for (const entry of entries) {
    total[entry.transition]++;
    if (entry.changed.length) total.changed++;
    const school = entry.before || entry.after;
    for (const dimension of Object.keys(groups)) {
      const group = (groups[dimension][school[dimension]] ||= emptyTotals());
      group[entry.transition]++;
      if (entry.changed.length) group.changed++;
    }
  }
  return {
    total: rates(total),
    groups: Object.fromEntries(
      Object.entries(groups).map(([dimension, buckets]) => [
        dimension,
        Object.fromEntries(
          Object.entries(buckets).map(([key, counts]) => [key, rates(counts)]),
        ),
      ]),
    ),
  };
}
export function schoolHistory(id, years, annual, metric) {
  return years.map((year) => {
    const school = annual.get(year)?.get(String(id)) || null;
    const value = school?.indicators?.[metric];
    return { year, school, value: validAnswer(value) ? value : null };
  });
}
export function rankMunicipalities(
  municipalities,
  stats,
  order = "balancePositive",
) {
  const key = {
    improvement: "improvementRate",
    worsening: "worseningRate",
    balancePositive: "balance",
    balanceNegative: "balance",
  }[order];
  return municipalities
    .map((city) => ({ ...city, ...stats[city.id] }))
    .filter((city) => city.comparable > 0)
    .sort(
      (a, b) =>
        (order === "balanceNegative" ? a[key] - b[key] : b[key] - a[key]) ||
        b.comparable - a.comparable ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}
export const evolutionScale = [
  { value: -100, label: "−100", color: "#b7443e" },
  { value: -50, label: "−50", color: "#d39a97" },
  { value: 0, label: "0", color: "#edf0ed" },
  { value: 50, label: "+50", color: "#90b39d" },
  { value: 100, label: "+100", color: "#327553" },
];
export const evolutionGradient = `linear-gradient(to right, ${evolutionScale.map((s) => `${s.color} ${(s.value + 100) / 2}%`).join(", ")})`;
export function evolutionColor(value) {
  if (!Number.isFinite(value)) return "#92999f";
  const v = Math.max(-100, Math.min(100, value));
  const i = Math.min(3, Math.floor((v + 100) / 50));
  const a = evolutionScale[i],
    b = evolutionScale[i + 1],
    ratio = (v - a.value) / 50;
  return (
    "#" +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(a.color.slice(offset, offset + 2), 16) * (1 - ratio) +
            parseInt(b.color.slice(offset, offset + 2), 16) * ratio,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function points(value) {
  return Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
    : "N/D";
}
