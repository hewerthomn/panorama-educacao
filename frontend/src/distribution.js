import { compute, subset } from "./data.js";

// Categorical colors are intentionally independent from the map's percentage scale.
export const distributionDimensions = {
  rede: [
    { id: "3", label: "Municipal", color: "#24556b" },
    { id: "2", label: "Estadual", color: "#8972a1" },
    { id: "1", label: "Federal", color: "#b57d36" },
    { id: "4", label: "Privada", color: "#528b92" },
  ],
  localizacao: [
    { id: "1", label: "Urbana", color: "#24556b" },
    { id: "2", label: "Rural", color: "#b57d36" },
  ],
};

export function distributionFor(
  data,
  { dimension, year, metric, city = "all", rede = "all", area = "all", mode = "schools" },
) {
  const definitions = distributionDimensions[dimension];
  if (!definitions)
    throw new Error(`Dimensão de distribuição inválida: ${dimension}`);
  // Compare every category of the chart dimension, preserving all other filters.
  const rows = subset(
    data,
    year,
    dimension === "rede" && mode === "schools" ? "all" : rede,
    dimension === "localizacao" && mode === "schools" ? "all" : area,
    city,
  );
  const groups = new Map(definitions.map((category) => [category.id, []]));
  for (const row of rows) {
    const id = String(row[dimension] ?? "");
    const key = groups.has(id) && id !== "unclassified" ? id : "unclassified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const total = compute(rows, metric, mode);
  const categories = [...definitions];
  if (groups.has("unclassified"))
    categories.push({
      id: "unclassified",
      label: "Não classificada",
      color: "#7d858b",
    });
  return {
    total,
    categories: categories.map((category) => {
      const categoryRows = groups.get(category.id) || [];
      const counts = compute(categoryRows, metric, mode);
      // Uma categoria vazia tem contagem zero se o total dispõe de matrículas.
      if (!categoryRows.length && total.enrollmentKnown && mode === "enrollments") counts.yes = 0;
      return {
        ...category,
        ...counts,
        share: total.yes > 0 && counts.yes !== null ? (counts.yes / total.yes) * 100 : null,
      };
    }),
  };
}
