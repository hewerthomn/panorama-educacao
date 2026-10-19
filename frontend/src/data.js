export async function fetchJson(relative) {
  const url = `${import.meta.env.BASE_URL}${relative.replace(/^\/+/, "")}`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Falha ao carregar ${relative} (HTTP ${response.status})`);
  return await response.json();
}

// Esquema v2: ordem de infrastructure_fields publicada pelo ETL.
export const infrastructureFields = [
  "schools_with", "schools_without", "schools_unknown",
  "enrollments_with", "enrollments_without", "enrollments_unknown",
  "enrollments_valid", "schools_missing_enrollments",
];

export function subset(data, year, rede, area, municipio) {
  return (data?.records || []).filter(
    (row) =>
      (year === null || row.year === year) &&
      (rede === "all" || row.rede === rede) &&
      (area === "all" || row.localizacao === area) &&
      (municipio === "all" || row.municipio === municipio),
  );
}

export function compute(rows = [], metric, mode = "schools") {
  let yes = 0,
    valid = 0,
    schools = 0,
    students = 0,
    studentSchools = 0;
  const infrastructure = {
    schools_with: 0, schools_without: 0, schools_unknown: 0,
    enrollments_with: 0, enrollments_without: 0, enrollments_unknown: 0,
    enrollments_valid: 0, schools_missing_enrollments: 0,
  };
  let enrollmentData = rows.length > 0;
  const known = new Set();
  for (const row of rows) {
    const counts = row.metrics?.[metric] || [0, 0];
    yes += counts[0];
    valid += counts[1];
    schools += row.schools;
    students += row.matriculas || 0;
    studentSchools += row.matriculas_valid || 0;
    const values = row.infrastructure?.[metric];
    const extra = Array.isArray(values)
      ? Object.fromEntries(infrastructureFields.map((key, index) => [key, values[index]]))
      : null;
    if (!extra || Object.keys(infrastructure).some((key) =>
      !Number.isFinite(extra[key]) && !(key.startsWith("enrollments_") && extra[key] === null))) {
      enrollmentData = false;
    } else {
      for (const key of Object.keys(infrastructure)) {
        if (extra[key] !== null) {
          infrastructure[key] += extra[key];
          if (key.startsWith("enrollments_") && (key === "enrollments_valid"
            ? extra.schools_with + extra.schools_without > 0
            : extra[`schools_${key.slice("enrollments_".length)}`] > 0)) known.add(key);
        }
      }
    }
  }
  const enrollmentMode = mode === "enrollments";
  const enrollmentKnown = enrollmentData && studentSchools > 0;
  const numerator = enrollmentMode ? (enrollmentKnown && valid > 0 &&
    (known.has("enrollments_valid") || infrastructure.schools_without === 0)
    ? infrastructure.enrollments_without : null) : yes;
  const denominator = enrollmentMode ? (enrollmentData && (known.has("enrollments_valid") || valid === 0)
    ? infrastructure.enrollments_valid : null) : valid;
  return {
    yes: numerator,
    valid: denominator,
    schools,
    students,
    studentSchools,
    unknown: enrollmentMode ? (enrollmentKnown && (known.has("enrollments_unknown") || infrastructure.schools_unknown === 0)
      ? infrastructure.enrollments_unknown : null) : schools - valid,
    schoolsUnknown: schools - valid,
    missingEnrollmentSchools: enrollmentData ? infrastructure.schools_missing_enrollments : null,
    enrollmentData,
    enrollmentKnown,
    mode,
    pct: denominator > 0 && numerator !== null ? (numerator / denominator) * 100 : null,
  };
}

export function previousComparison(series, year, mode = "schools") {
  const index = series.findIndex((point) => point.year === year);
  const current = series[index], previous = mode === "schools"
    ? series.filter((point) => point.year < year && point.pct !== null).at(-1)
    : series[index - 1];
  if (!previous || current.pct === null || previous.pct === null) return null;
  // Sem cobertura completa, mudanças na composição podem imitar uma evolução.
  if (mode === "enrollments" && [current, previous].some(
    (point) => point.missingEnrollmentSchools !== 0 || point.schoolsUnknown !== 0,
  )) return null;
  return { year: previous.year, delta: current.pct - previous.pct };
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
export function gradientFor(mode = "schools") {
  return mode === "enrollments"
    ? `linear-gradient(to right, ${mapScale.map((s, i) => `${mapScale[mapScale.length - 1 - i].color} ${s.value}%`).join(", ")})`
    : mapGradient;
}
export function colorFor(value, mode = "schools") {
  if (!Number.isFinite(value)) return noDataColor;
  const clamped = Math.min(100, Math.max(0, value));
  const bounded = mode === "enrollments" ? 100 - clamped : clamped;
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
  return !Number.isFinite(value)
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
    "perspectiva", "matriculas_sem_recurso", "matriculas_validas",
    "matriculas_sem_resposta_valida", "escolas_sem_matriculas",
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
