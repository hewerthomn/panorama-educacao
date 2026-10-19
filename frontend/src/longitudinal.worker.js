import { compareSchools, summarize, schoolHistory } from "./longitudinal.js";
import { createSchoolStore } from "./schoolStore.js";

let store,
  context,
  latestComparison = 0,
  comparison;
self.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    if (type === "init") {
      context = payload;
      store = createSchoolStore(async (year) => {
        const response = await fetch(
          `${context.base}data/${context.uf}/schools/${year}.json`,
        );
        if (!response.ok)
          throw new Error(
            `Não foi possível carregar escolas de ${year} (HTTP ${response.status}).`,
          );
        const result = await response.json();
        if (result.uf !== context.uf)
          throw new Error("Arquivo de escolas de outra UF.");
        return result;
      });
      return;
    }
    let result;
    if (type === "compare") {
      latestComparison = id;
      if (
        !(payload.end > payload.start) ||
        ![payload.start, payload.end].every((y) => context.years.includes(y))
      )
        throw new Error(
          "Escolha um ano final posterior ao inicial entre os anos disponíveis.",
        );
      const [initial, final] = await Promise.all([
        store.get(payload.start),
        store.get(payload.end),
      ]);
      if (id !== latestComparison) {
        self.postMessage({ id, result: null });
        return;
      }
      comparison = {
        id,
        entries: compareSchools(
          initial,
          final,
          payload.metric,
          payload.filters,
        ),
      };
      // Os dados completos permanecem no worker; só totais e páginas cruzam a thread.
      result = summarize(comparison.entries);
    } else if (type === "list") {
      if (payload.comparison !== comparison?.id) {
        self.postMessage({ id, result: null });
        return;
      }
      const query = (payload.query || "")
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      const entries = comparison.entries.filter((entry) => {
        const school = entry.before || entry.after;
        return (
          (payload.transition === "all" ||
            entry.transition === payload.transition) &&
          `${school.name} ${entry.after?.name || ""} ${entry.id}`
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .includes(query)
        );
      });
      result = {
        total: entries.length,
        entries: entries.slice(payload.offset, payload.offset + 50),
      };
    } else if (type === "history") {
      const annual = new Map();
      // Sequencial: evita baixar todos os anos em paralelo ao abrir o histórico.
      for (const year of context.years) annual.set(year, await store.get(year));
      result = schoolHistory(
        payload.school,
        context.years,
        annual,
        payload.metric,
      );
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
