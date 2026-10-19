export async function fetchJson(relative) {
  const url = `${import.meta.env.BASE_URL}${relative.replace(/^\/+/, "")}`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Falha ao carregar ${relative} (HTTP ${response.status})`);
  return await response.json();
}

export function subset(data, year, rede, area, municipio) {
  return (data?.records || []).filter(
    (row) =>
      (year === null || row.year === year) &&
      (rede === "all" || row.rede === rede) &&
      (area === "all" || row.localizacao === area) &&
      (municipio === "all" || row.municipio === municipio),
  );
}

export function compute(rows, metric) {
  let yes = 0,
    valid = 0,
    schools = 0,
    students = 0,
    studentSchools = 0;
  for (const row of rows) {
    const counts = row.metrics?.[metric] || [0, 0];
    yes += counts[0];
    valid += counts[1];
    schools += row.schools;
    students += row.matriculas || 0;
    studentSchools += row.matriculas_valid || 0;
  }
  return {
    yes,
    valid,
    schools,
    students,
    studentSchools,
    unknown: schools - valid,
    pct: valid > 0 ? (yes / valid) * 100 : null,
  };
}

// Fixed percentage anchors: identical meaning for every indicator, year and state.
export const mapScale = [
  { value: 0, label: "0%", color: "#b7443e" },
  { value: 25, label: "25%", color: "#d88e50" },
  { value: 50, label: "50%", color: "#e5c46b" },
  { value: 75, label: "75%", color: "#9eaf68" },
  { value: 100, label: "100%", color: "#327553" },
];
export const noDataColor = "#92999f";
export const mapGradient = `linear-gradient(to right, ${mapScale.map((s) => `${s.color} ${s.value}%`).join(", ")})`;
export function colorFor(value) {
  if (!Number.isFinite(value)) return noDataColor;
  const bounded = Math.min(100, Math.max(0, value));
  const index = Math.min(mapScale.length - 2, Math.floor(bounded / 25));
  const start = mapScale[index],
    end = mapScale[index + 1];
  const ratio = (bounded - start.value) / (end.value - start.value);
  const channels = [1, 3, 5].map((offset) => {
    const a = parseInt(start.color.slice(offset, offset + 2), 16);
    const b = parseInt(end.color.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * ratio)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function percent(value) {
  return value === null
    ? "N/D"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

export function exportCsv(filename, rows) {
  const columns = [
    "codigo_ibge",
    "municipio",
    "ano",
    "indicador",
    "escolas_com",
    "escolas_validas",
    "total_escolas",
    "percentual",
  ];
  const csv = [
    columns.join(";"),
    ...rows.map((row) =>
      columns.map((key) => String(row[key] ?? "").replace(/;/g, ",")).join(";"),
    ),
  ].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
