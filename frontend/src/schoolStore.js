import { indexSchools } from "./longitudinal.js";

// Instância por UF. Cache de promessas evita requisições duplicadas e permite retry.
export function createSchoolStore(load) {
  const cache = new Map();
  return {
    get(year) {
      if (!cache.has(year)) {
        const pending = Promise.resolve()
          .then(() => load(year))
          .then((data) => {
            if (data.year !== year || !Array.isArray(data.schools))
              throw new Error(`Arquivo de escolas inválido para ${year}`);
            return indexSchools(data.schools);
          })
          .catch((error) => {
            cache.delete(year);
            throw error;
          });
        cache.set(year, pending);
      }
      return cache.get(year);
    },
  };
}
