// Totais fictícios por escola/grupo, sem dados individuais.
const row = (year, municipio, rede, localizacao, counts, missing = 0) => {
  const [withSchools, withoutSchools, unknownSchools, withEnrollments, withoutEnrollments, unknownEnrollments] = counts;
  const schools = withSchools + withoutSchools + unknownSchools;
  const known = schools - missing;
  const allEnrollments = withEnrollments + withoutEnrollments + unknownEnrollments;
  return {
    year, municipio, rede, localizacao, schools,
    matriculas: allEnrollments, matriculas_valid: known,
    metrics: { water: [withSchools, withSchools + withoutSchools], internet: [schools, schools] },
    infrastructure: {
      water: [...counts, withEnrollments + withoutEnrollments, missing],
      internet: [schools, 0, 0, allEnrollments, 0, 0, allEnrollments, missing],
    },
  };
};
export const records = [
  row(2024, '1100015', '3', '1', [1, 1, 0, 80, 20, 0]),
  row(2025, '1100015', '3', '1', [0, 1, 0, 0, 60, 0]),
  row(2025, '1100015', '2', '2', [1, 0, 0, 140, 0, 0]),
  row(2025, '1100023', '4', '2', [1, 1, 0, 20, 80, 0]),
  row(2025, '1100031', '1', '1', [0, 0, 2, 0, 0, 30], 1),
];
export const manifest = {
  schema_version: 2, uf: 'RO', state_name: 'Rondônia', years: [2024, 2025], generated_at: '2026-10-19T12:00:00Z',
  map_available: true, schools_available: false,
  indicators: [
    { key: 'water', label: 'Água potável', field: 'IN_AGUA_POTAVEL', available_years: [2024, 2025] },
    { key: 'internet', label: 'Acesso à internet', field: 'IN_INTERNET', available_years: [2024, 2025] },
  ],
  municipalities: [
    { id: '1100015', name: 'Município A' },
    { id: '1100023', name: 'Município B' },
    { id: '1100031', name: 'Município C' },
  ], records,
};
export const geo = {
  type: 'FeatureCollection',
  features: manifest.municipalities.map((m, i) => ({
    type: 'Feature', properties: { ...m },
    geometry: { type: 'Polygon', coordinates: [[[-63+i, -9], [-62.2+i, -9], [-62.2+i, -8], [-63+i, -8], [-63+i, -9]]] },
  })),
};
