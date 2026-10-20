// Contrato independente: notas oficiais 0–10, sem agregação de médias escolares.
export const idebScale = [
  { value: 0, label: "0", color: "#bc3c45" },
  { value: 2.5, label: "2,5", color: "#e59455" },
  { value: 5, label: "5", color: "#e8c45c" },
  { value: 7.5, label: "7,5", color: "#85b478" },
  { value: 10, label: "10", color: "#227454" },
];
export const idebNoData = "#92999f";
export const idebGradient = `linear-gradient(to right, ${idebScale.map((c) => `${c.color} ${c.value * 10}%`).join(",")})`;
export function idebColor(value) {
  if (!Number.isFinite(value) || value < 0 || value > 10) return idebNoData;
  const i = Math.min(3, Math.floor(value / 2.5));
  const a = idebScale[i],
    b = idebScale[i + 1],
    t = (value - a.value) / 2.5;
  const channels = (color) =>
    color
      .slice(1)
      .match(/../g)
      .map((x) => parseInt(x, 16));
  const ac = channels(a.color),
    bc = channels(b.color);
  return (
    "#" +
    ac
      .map((v, j) =>
        Math.round(v + (bc[j] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export const score = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 10,
      })
    : "N/D";
export const difference = (a, b) =>
  Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(10)) : null;
export const scoreDelta = (value) =>
  Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${score(value)} pontos`
    : "N/D";
export const statusLabel = (row) =>
  ({
    available: "Resultado disponível",
    not_published: "Resultado não divulgado",
    not_applicable: "Etapa não aplicável",
    missing: "Informação ausente",
  })[row?.status] || "Informação ausente na fonte";
export function networkMatches(actual, selected) {
  return (
    selected === "Total" ||
    actual === selected ||
    (selected === "Pública" &&
      ["Federal", "Estadual", "Municipal"].includes(actual))
  );
}
export function filterResults(
  rows,
  { year, stage, network, city = "all", school = null } = {},
) {
  return rows.filter(
    (r) =>
      (year == null || r.year === year) &&
      (!stage || r.stage === stage) &&
      (!network ||
        (r.level === "school"
          ? networkMatches(r.network, network)
          : r.network === network)) &&
      (city === "all" || r.municipality_id === city) &&
      (!school || r.school_id === school),
  );
}
export function historyFor(rows, years, identity) {
  const selected = filterResults(rows, identity);
  return years.map(
    (year) =>
      selected.find((r) => r.year === year) || {
        year,
        ideb: null,
        status: "missing",
      },
  );
}
export function previousAvailable(series, year) {
  return (
    series
      .filter((r) => r.year < year && Number.isFinite(r.ideb))
      .sort((a, b) => b.year - a.year)[0] || null
  );
}
export function comparison(series, year) {
  const current = series.find((r) => r.year === year);
  const previous = previousAvailable(series, year);
  return {
    current,
    previous,
    delta: difference(current?.ideb, previous?.ideb),
  };
}
export function rankResults(
  rows,
  years,
  { year, stage, network, city = "all", order = "highest" },
) {
  const histories = new Map();
  const comparable = rows.filter(
    (r) =>
      (stage == null || r.stage === stage) &&
      (city === "all" || r.municipality_id === city) &&
      (!network ||
        (r.level === "school"
          ? networkMatches(r.network, network)
          : r.network === network)),
  );
  const identity = (r) =>
    JSON.stringify([
      r.level,
      r.level === "school" ? r.school_id : r.municipality_id,
      r.stage,
      r.network,
    ]);
  for (const row of comparable) {
    const key = identity(row);
    let history = histories.get(key);
    if (!history) {
      history = { current: [], previous: null };
      histories.set(key, history);
    }
    if (row.year === year) history.current.push(row);
    else if (
      row.year < year &&
      Number.isFinite(row.ideb) &&
      (!history.previous || row.year > history.previous.year)
    ) {
      history.previous = row;
    }
  }
  return [...histories.values()]
    .flatMap(({ current, previous }) =>
      current
        .filter((row) => Number.isFinite(row.ideb))
        .map((row) => ({
          ...row,
          previous,
          delta: difference(row.ideb, previous?.ideb),
        })),
    )
    .filter((r) => !["gain", "loss"].includes(order) || r.delta !== null)
    .sort(
      (a, b) =>
        (order === "lowest"
          ? a.ideb - b.ideb
          : order === "gain"
            ? b.delta - a.delta
            : order === "loss"
              ? a.delta - b.delta
              : b.ideb - a.ideb) ||
        a.name.localeCompare(b.name, "pt-BR") ||
        (a.school_id || "").localeCompare(b.school_id || ""),
    );
}
export function joinInfrastructure(observation, census) {
  if (!census) return { status: "missing", school: null };
  if (census.year !== observation.year)
    return { status: "year_mismatch", school: null };
  const school = census.schools.find(
    (s) => String(s.id) === observation.school_id,
  );
  return {
    status: school ? "matched" : "school_not_found",
    school: school || null,
    year: observation.year,
    stage: observation.stage,
  };
}
export function createIdebStore(load) {
  const cache = new Map();
  return {
    get(uf, stage, level, meta) {
      const key = `${uf}/${stage}/${level}/${meta.path}`;
      if (!cache.has(key))
        cache.set(
          key,
          Promise.resolve()
            .then(() => load(`data/ideb/${uf}/${meta.path}`))
            .then((data) => {
              if (
                data.schema_version !== 1 ||
                data.uf !== uf ||
                data.stage !== stage ||
                data.level !== level ||
                !Array.isArray(data.records)
              )
                throw new Error(
                  "Arquivo Ideb incompatível. Regenere os dados.",
                );
              return data.records;
            })
            .catch((error) => {
              cache.delete(key);
              throw error;
            }),
        );
      return cache.get(key);
    },
  };
}
