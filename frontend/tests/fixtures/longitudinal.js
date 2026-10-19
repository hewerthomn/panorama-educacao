import { manifest as base, geo } from "./infrastructure.js";
export { geo };
export const school = (id, water, extra = {}) => ({
  id,
  name: `Escola ${id}`,
  municipio: "1100015",
  rede: "3",
  localizacao: "1",
  matriculas: 50,
  indicators: { water, internet: 1 },
  ...extra,
});
export const initial = [
  school("1", 0),
  school("2", 1),
  school("3", 0),
  school("4", 1, { municipio: "1100023", rede: "4", localizacao: "2" }),
  school("5", 0, { municipio: "1100031", rede: "1" }),
  school("6", 1),
  school("8", null),
];
export const final = [
  school("1", 1, {
    name: "Novo nome",
    municipio: "1100023",
    rede: "2",
    localizacao: "2",
  }),
  school("2", 0),
  school("3", 0),
  school("4", 1, { municipio: "1100023", rede: "4", localizacao: "2" }),
  school("5", null, { municipio: "1100031", rede: "1" }),
  school("7", 0, { municipio: "1100023", rede: "4", localizacao: "2" }),
  school("8", 1),
];
export const middle = [school("1", null), school("3", 1)];
export const annual = new Map([
  [2020, initial],
  [2022, middle],
  [2025, final],
]);
export const manifest = {
  ...base,
  years: [2020, 2022, 2025],
  schools_available: true,
  indicators: base.indicators.map((i) => ({
    ...i,
    available_years: [2020, 2022, 2025],
  })),
};
