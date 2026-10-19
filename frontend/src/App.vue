<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  defineAsyncComponent,
} from "vue";
import SearchSelect from "./SearchSelect.vue";
import MapPanel from "./MapPanel.vue";
import TrendChart from "./TrendChart.vue";
import DistributionChart from "./DistributionChart.vue";
import { distributionFor } from "./distribution.js";
import {
  fetchJson,
  subset,
  compute,
  percent,
  colorFor,
  exportCsv,
  previousComparison,
} from "./data.js";

const IdebPanel = defineAsyncComponent(() => import("./IdebPanel.vue"));
const idebTerritory = ref(null);
const idebStates = ref([]);
const LongitudinalPanel = defineAsyncComponent(() => import("./LongitudinalPanel.vue"));

const stateOptions = ref([]);
const uf = ref("RO");
const manifest = ref(null);
const geo = ref(null);
const year = ref(null);
const metric = ref("agua_potavel");
const mode = ref("schools");
const analysisMode = ref(new URLSearchParams(location.search).get("analysis") === "ideb" ? "ideb" : "aggregate");
const enrollmentMode = computed(() => mode.value === "enrollments");
const measureLabel = computed(() => enrollmentMode.value ? "Matrículas em escolas sem o recurso" : "Escolas com o indicador");
const city = ref("all");
const rede = ref("all");
const area = ref("all");
const loading = ref(false);
const error = ref("");
const schools = ref([]);
const schoolsBusy = ref(false);
const filtersOpen = ref(false);
const playing = ref(false);
const sidebarCollapsed = ref(false);
const isMobile = ref(window.matchMedia("(max-width: 700px)").matches);
const sidebarEl = ref(null);
const filterTrigger = ref(null);
const desktopTrigger = ref(null);
const mobileQuery = window.matchMedia("(max-width: 700px)");
function mediaChanged(event) {
  isMobile.value = event.matches;
  filtersOpen.value = false;
}
async function openFilters() {
  filtersOpen.value = true;
  await nextTick();
  sidebarEl.value?.querySelector("button")?.focus();
}
async function closeFilters() {
  filtersOpen.value = false;
  await nextTick();
  filterTrigger.value?.focus();
}
function trapDrawer(event) {
  if (!isMobile.value || !filtersOpen.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeFilters();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = [
    ...sidebarEl.value.querySelectorAll(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
    ),
  ];
  const first = controls[0],
    last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
watch(filtersOpen, (value) => {
  document.body.style.overflow = value && isMobile.value ? "hidden" : "";
});
onMounted(() => mobileQuery.addEventListener("change", mediaChanged));
onBeforeUnmount(() => {
  mobileQuery.removeEventListener("change", mediaChanged);
  document.body.style.overflow = "";
});
const stateSelectOptions = computed(() =>
  [...new Map([...stateOptions.value, ...(analysisMode.value === "ideb" ? idebStates.value : [])].map(s => [s.uf, s])).values()].map((s) => ({
    value: s.uf,
    label: `${s.name} (${s.uf})`,
  })),
);
const citySelectOptions = computed(() => [
  { value: "all", label: "Todos os municípios" },
  ...municipalities.value.map((m) => ({ value: m.id, label: m.name })),
]);
const indicatorSelectOptions = computed(() =>
  indicators.value.map((i) => ({ value: i.key, label: i.label })),
);
const comparison = computed(() => {
  const change = previousComparison(trend.value, year.value, mode.value);
  if (!change) return null;
  return `${change.delta > 0 ? "+" : ""}${change.delta.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p. em relação a ${change.year}`;
});
const years = computed(() =>
  [...(manifest.value?.years || [])].sort((a, b) => a - b),
);
const yearIndex = computed(() => years.value.indexOf(year.value));
const filteredSchools = computed(() =>
  schools.value.filter(
    (s) =>
      (rede.value === "all" || String(s.rede) === rede.value) &&
      (area.value === "all" || String(s.localizacao) === area.value),
  ),
);
let timer;
function pause() {
  playing.value = false;
  clearInterval(timer);
}
function togglePlayback() {
  if (playing.value) return pause();
  if (yearIndex.value === years.value.length - 1) year.value = years.value[0];
  playing.value = true;
  timer = setInterval(() => {
    if (yearIndex.value >= years.value.length - 1) return pause();
    year.value = years.value[yearIndex.value + 1];
  }, 1600);
}
function setYear(event) {
  pause();
  year.value = years.value[Number(event.target.value)];
}
function resetFilters() {
  pause();
  city.value = "all";
  rede.value = "all";
  area.value = "all";
  year.value = years.value.at(-1);
}
function visibilityChanged() {
  if (document.hidden) pause();
}
onMounted(() =>
  document.addEventListener("visibilitychange", visibilityChanged),
);
onBeforeUnmount(() => {
  pause();
  document.removeEventListener("visibilitychange", visibilityChanged);
});
watch([metric, city, rede, area, mode, analysisMode], pause);

let loadId = 0;
let schoolLoadId = 0;

onMounted(async () => {
  try {
    const [census, ideb] = await Promise.allSettled([
      fetchJson("data/index.json"), fetchJson("data/ideb/index.json"),
    ]);
    idebStates.value = ideb.status === "fulfilled" ? ideb.value.states || [] : [];
    if (census.status === "rejected") error.value = census.reason.message;
    stateOptions.value = census.status === "fulfilled" ? census.value.states || [] : [];
    const available = analysisMode.value === "ideb" ? [...stateOptions.value, ...idebStates.value] : stateOptions.value;
    if (available.length) {
      const preferred = new URLSearchParams(location.search)
        .get("uf")
        ?.toUpperCase();
      uf.value = available.some((r) => r.uf === preferred)
        ? preferred
        : available.some((r) => r.uf === "RO")
          ? "RO"
          : available[0].uf;
      await loadUf();
    }
  } catch (e) {
    error.value = e.message;
  }
});

async function loadUf() {
  pause();
  ++schoolLoadId;
  schoolsBusy.value = false;
  const thisLoad = ++loadId;
  loading.value = true;
  error.value = "";
  manifest.value = null;
  geo.value = null;
  city.value = "all";
  schools.value = [];
  try {
    if (analysisMode.value === "ideb") {
      idebTerritory.value = null;
      const shapes = await fetchJson(`data/${uf.value}/municipios.geojson`).catch(() => null);
      if (loadId === thisLoad) {
        geo.value = shapes;
        const search = new URL(location.href);
        search.searchParams.set("uf", uf.value);
        history.replaceState({}, "", search);
      }
      return;
    }
    const info = await fetchJson(`data/${uf.value}/manifest.json`);
    let shapes = null;
    if (info.map_available)
      shapes = await fetchJson(`data/${uf.value}/municipios.geojson`);
    if (loadId !== thisLoad) return;
    manifest.value = info;
    geo.value = shapes;
    year.value = Math.max(...info.years);
    const metrics = info.indicators.filter((i) => i.available_years.length > 0);
    metric.value = metrics.some((i) => i.key === "agua_potavel")
      ? "agua_potavel"
      : metrics[0]?.key || "";
    const search = new URL(location.href);
    search.searchParams.set("uf", uf.value);
    history.replaceState({}, "", search);
  } catch (e) {
    if (loadId === thisLoad) error.value = e.message;
  } finally {
    if (loadId === thisLoad) loading.value = false;
  }
}
watch(analysisMode, mode => {
  const search = new URL(location.href);
  mode === "ideb" ? search.searchParams.set("analysis", "ideb") : search.searchParams.delete("analysis");
  history.replaceState({}, "", search);
  if ((mode !== "ideb" && !manifest.value) || (mode === "ideb" && !geo.value)) loadUf();
});
const municipalities = computed(() => (analysisMode.value === "ideb" ? idebTerritory.value : manifest.value)?.municipalities || []);
const indicators = computed(() => manifest.value?.indicators || []);
const selectedIndicator = computed(() =>
  indicators.value.find((i) => i.key === metric.value),
);
const selectedCity = computed(() =>
  municipalities.value.find((m) => m.id === city.value),
);
const rows = computed(() =>
  subset(manifest.value, year.value, rede.value, area.value, city.value),
);
const current = computed(() => compute(rows.value, metric.value, mode.value));
const missingYear = computed(
  () =>
    selectedIndicator.value &&
    !selectedIndicator.value.available_years.includes(year.value),
);
const byMunicipality = computed(() => {
  const result = {};
  for (const municipality of municipalities.value) {
    result[municipality.id] = compute(
      subset(
        manifest.value,
        year.value,
        rede.value,
        area.value,
        municipality.id,
      ),
      metric.value,
      mode.value,
    );
  }
  return result;
});
const trend = computed(() =>
  years.value.map((y) => ({
    year: y,
    ...compute(
      subset(manifest.value, y, rede.value, area.value, city.value),
      metric.value,
      mode.value,
    ),
  })),
);
const networkDistribution = computed(() =>
  distributionFor(manifest.value, {
    mode: mode.value,
    dimension: "rede",
    year: year.value,
    metric: metric.value,
    city: city.value,
    rede: rede.value,
    area: area.value,
  }),
);
const locationDistribution = computed(() =>
  distributionFor(manifest.value, {
    mode: mode.value,
    dimension: "localizacao",
    year: year.value,
    metric: metric.value,
    city: city.value,
    rede: rede.value,
    area: area.value,
  }),
);
const networkScope = computed(
  () =>
    `${enrollmentMode.value ? "Todos os filtros aplicados" : "Todas as redes"} · ${area.value === "all" ? "urbana e rural" : area.value === "1" ? "urbana" : "rural"}${!enrollmentMode.value && rede.value !== "all" ? ". O filtro de rede não se aplica a este gráfico." : ""}`,
);
const locationScope = computed(
  () =>
    `${enrollmentMode.value ? "Todos os filtros aplicados" : "Urbana e rural"} · ${{ all: "todas as redes", 1: "rede federal", 2: "rede estadual", 3: "rede municipal", 4: "rede privada" }[rede.value]}${!enrollmentMode.value && area.value !== "all" ? ". O filtro de localização não se aplica a este gráfico." : ""}`,
);
const ranking = computed(() =>
  municipalities.value
    .filter((m) => !enrollmentMode.value || city.value === "all" || city.value === m.id)
    .map((m) => ({ ...m, ...byMunicipality.value[m.id] }))
    .filter((m) => m.pct !== null && m.valid > 0)
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, "pt-BR")),
);

watch([city, year, uf, analysisMode], async () => {
  const id = ++schoolLoadId;
  schools.value = [];
  schoolsBusy.value = false;
  if (
    !manifest.value?.schools_available ||
    city.value === "all" ||
    analysisMode.value !== "aggregate" ||
    year.value === null
  )
    return;
  schoolsBusy.value = true;
  try {
    const result = await fetchJson(
      `data/${uf.value}/schools/${year.value}.json`,
    );
    if (id === schoolLoadId)
      schools.value = result.schools.filter((s) => s.municipio === city.value);
  } catch (e) {
    if (id === schoolLoadId) error.value = e.message;
  } finally {
    if (id === schoolLoadId) schoolsBusy.value = false;
  }
});

function selectCity(code) {
  city.value = city.value === code ? "all" : code;
}
function csvDownload() {
  const names = Object.fromEntries(
    municipalities.value.map((m) => [m.id, m.name]),
  );
  const data = municipalities.value
    .filter((m) => city.value === "all" || city.value === m.id)
    .map((m) => {
      const s = byMunicipality.value[m.id];
      return {
        codigo_ibge: m.id,
        municipio: names[m.id],
        ano: year.value,
        indicador: metric.value,
        escolas_com: compute(subset(manifest.value, year.value, rede.value, area.value, m.id), metric.value).yes,
        escolas_validas: compute(subset(manifest.value, year.value, rede.value, area.value, m.id), metric.value).valid,
        perspectiva: mode.value,
        matriculas_sem_recurso: enrollmentMode.value ? s.yes : "",
        matriculas_validas: enrollmentMode.value ? s.valid : "",
        matriculas_sem_resposta_valida: enrollmentMode.value ? s.unknown : "",
        escolas_sem_matriculas: s.missingEnrollmentSchools,
        total_escolas: s.schools,
        percentual: s.pct === null ? "" : s.pct.toFixed(2).replace(".", ","),
      };
    });
  exportCsv(`educacao_${uf.value}_${year.value}_${metric.value}_${mode.value}.csv`, data);
}
function schoolAnswer(value) {
  return value === 1 ? "Sim" : value === 0 ? "Não" : "N/D";
}
function withSeparators(v) {
  return v === null || v === undefined ? "N/D" : new Intl.NumberFormat("pt-BR").format(v);
}
</script>

<template>
  <div class="observatory" @keydown="trapDrawer">
    <a class="skip-link" href="#analysis">Ir para a análise</a>
    <header class="masthead" :inert="isMobile && filtersOpen">
      <a class="brand" href="./" aria-label="Panorama da Educação, início">
        <svg class="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
          <path
            d="M3 30V17h7v13M14 30V6h7v24M25 30V12h7v18"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          />
          <path d="M2 34h32" stroke="currentColor" stroke-width="2" />
        </svg>
        <span
          ><strong>Panorama da Educação</strong
          ><small>Infraestrutura e desempenho educacional</small></span
        >
      </a>
      <button
        ref="desktopTrigger"
        class="button desktop-filter-trigger"
        @click="sidebarCollapsed = !sidebarCollapsed"
        :aria-expanded="!sidebarCollapsed"
        aria-controls="filter-sidebar"
      >
        {{ sidebarCollapsed ? "Mostrar filtros" : "Recolher filtros" }}
      </button>
      <button
        ref="filterTrigger"
        class="button mobile-filter-trigger"
        @click="openFilters"
        :aria-expanded="filtersOpen"
        aria-controls="filter-sidebar"
      >
        Filtros
      </button>
      <div class="header-context">
        {{ analysisMode === "ideb" ? "Ideb" : "Censo Escolar" }} <span> / </span> Análise territorial
      </div>
      <button v-if="analysisMode === 'aggregate'" class="button" @click="csvDownload" :disabled="!manifest">
        Exportar CSV <span aria-hidden="true">↓</span>
      </button>
    </header>
    <div class="workspace" :class="{ 'is-collapsed': sidebarCollapsed }">
      <div
        v-if="isMobile && filtersOpen"
        class="drawer-backdrop"
        @click="closeFilters"
      ></div>
      <aside
        id="filter-sidebar"
        ref="sidebarEl"
        class="sidebar"
        v-show="isMobile ? filtersOpen : !sidebarCollapsed"
        :class="{ 'drawer-open': filtersOpen }"
        :role="isMobile ? 'dialog' : undefined"
        :aria-modal="isMobile ? true : undefined"
        aria-label="Filtros da análise"
      >
        <div class="sidebar-heading">
          <h2>Recorte da análise</h2>
          <button class="filter-toggle button" @click="closeFilters">
            Fechar filtros
          </button>
        </div>
        <div
          id="filter-fields"
          class="filter-content"
          :class="{ 'is-open': filtersOpen }"
        >
          <p class="sidebar-intro">
            {{ analysisMode === "ideb" ? "Explore notas oficiais por edição e etapa." : "Explore as condições das escolas em cada território." }}
          </p>
          <div class="filters">
            <SearchSelect
              v-model="uf"
              :options="stateSelectOptions"
              label="Estado"
              placeholder="Pesquisar estado"
              :disabled="loading || !stateSelectOptions.length"
              @change="loadUf"
            />
            <SearchSelect
              v-model="city"
              :options="citySelectOptions"
              label="Município"
              placeholder="Pesquisar município"
              clear-value="all"
              :disabled="analysisMode === 'ideb' ? !idebTerritory : !manifest"
            />
            <div v-if="analysisMode === 'ideb'" id="ideb-filters"></div>
            <SearchSelect
              v-if="analysisMode !== 'ideb'"
              v-model="metric"
              :options="indicatorSelectOptions"
              label="Indicador"
              placeholder="Pesquisar indicador"
              :disabled="!manifest"
            />
            <label v-if="analysisMode === 'aggregate'"
              >Ano de referência<select
                v-model.number="year"
                @change="pause"
                :disabled="!manifest"
              >
                <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
              </select></label
            >
            <label v-if="analysisMode !== 'ideb'"
              >Rede de ensino<select v-model="rede">
                <option value="all">Todas as redes</option>
                <option value="1">Federal</option>
                <option value="2">Estadual</option>
                <option value="3">Municipal</option>
                <option value="4">Privada</option>
              </select></label
            >
            <label v-if="analysisMode !== 'ideb'"
              >Localização<select v-model="area">
                <option value="all">Urbana e rural</option>
                <option value="1">Urbana</option>
                <option value="2">Rural</option>
              </select></label
            >
          </div>
          <button
            v-if="analysisMode !== 'ideb'"
            class="reset-button"
            @click="resetFilters"
            :disabled="!manifest"
          >
            Redefinir recorte
          </button>
          <div v-if="analysisMode !== 'ideb'" class="source-note">
            <h3>Sobre os dados</h3>
            <p>
              Escolas em atividade. Os percentuais consideram apenas respostas
              válidas ao indicador.
            </p>
            <a
              href="https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar"
              target="_blank"
              rel="noopener"
              >Consultar Censo Escolar ↗</a
            >
          </div>
        </div>
      </aside>
      <main
        id="analysis"
        class="content"
        tabindex="-1"
        :aria-busy="loading"
        :inert="isMobile && filtersOpen"
      >
        <p v-if="loading && analysisMode !== 'ideb'" class="message" role="status">
          Carregando os indicadores…
        </p>
        <div v-if="error && analysisMode !== 'ideb'" class="message error" role="alert">
          {{ error }}
          <button class="button" @click="loadUf">Tentar novamente</button>
        </div>
        <p v-if="analysisMode !== 'ideb' && !loading && !error && !stateOptions.length" class="message">
          Ainda não há dados disponíveis. Consulte o README para gerar os dados
          do Censo Escolar.
        </p>
          <div class="analysis-mode-control perspective-control" role="group" aria-label="Tipo de análise">
            <button :aria-pressed="analysisMode === 'aggregate'" @click="analysisMode = 'aggregate'">Panorama por ano</button>
            <button :aria-pressed="analysisMode === 'longitudinal'" @click="analysisMode = 'longitudinal'">Evolução das escolas</button>
            <button :aria-pressed="analysisMode === 'ideb'" @click="analysisMode = 'ideb'">Desempenho educacional</button>
          </div>
        <template v-if="manifest || analysisMode === 'ideb'">
          <section class="intro">
            <div>
              <p class="territory">
                {{ (analysisMode === "ideb" ? idebTerritory?.state_name : manifest?.state_name) || uf }}
                <span>/ {{ selectedCity?.name || "Todos os municípios" }}</span>
              </p>
              <h1>Panorama da Educação</h1>
              <p>{{ analysisMode === "ideb" ? "Notas oficiais do Ideb no território e entre edições." : "Infraestrutura escolar no território e ao longo do tempo." }}</p>
            </div>
            <span v-if="analysisMode === 'aggregate'" class="reference-year"
              >Referência <strong>{{ year }}</strong></span
            >
          </section>
          <LongitudinalPanel v-if="analysisMode === 'longitudinal'" :key="uf" :manifest="manifest" :uf="uf" :geo="geo" :metric="metric" :city="city" :rede="rede" :area="area" @select="selectCity" />
          <IdebPanel v-else-if="analysisMode === 'ideb'" :key="uf" :uf="uf" :city="city" :geo="geo"
            @select="city = $event" @territory="idebTerritory = $event" />
          <template v-else>
          <div class="perspective-row">
            <h2>{{ selectedIndicator?.label }}</h2>
            <div class="perspective-control" role="group" aria-label="Perspectiva do indicador">
              <button type="button" :aria-pressed="!enrollmentMode" @click="mode = 'schools'">Escolas</button>
              <button type="button" :aria-pressed="enrollmentMode" @click="mode = 'enrollments'">Matrículas</button>
            </div>
          </div>
          <p v-if="enrollmentMode" class="perspective-note">
            Matrículas vinculadas a escolas que declararam não possuir o recurso.
            A declaração descreve a unidade escolar; não mede o acesso individual dos estudantes.
          </p>
          <p v-if="enrollmentMode && !current.schools" class="message">
            Nenhuma escola neste recorte.
          </p>
          <p v-else-if="enrollmentMode && !current.enrollmentData" class="message warning">
            Agregados de matrículas indisponíveis neste recorte. Regenere os dados desta UF com o esquema atual.
          </p>
          <p v-else-if="enrollmentMode && !current.enrollmentKnown" class="message warning">
            Quantidade de matrículas indisponível neste recorte/ano. Valores desconhecidos não são considerados zero.
          </p>
          <p v-if="missingYear" class="message warning">
            O campo <strong>{{ selectedIndicator?.field }}</strong> não está
            disponível em {{ year }}. O indicador é exibido como N/D, sem
            substituir por zero.
          </p>
          <section class="kpis" aria-label="Resumo do recorte">
            <div class="kpi primary">
              <span>{{ enrollmentMode ? "Matrículas em escolas sem o recurso (%)" : selectedIndicator?.label }}</span>
              <strong>{{ percent(current.pct) }}</strong>
              <small>{{ comparison || (enrollmentMode ? "Entre matrículas conhecidas com resposta válida" : "Das escolas com resposta válida") }}</small>
            </div>
            <div class="kpi">
              <span>{{ measureLabel }}</span>
              <strong>{{ enrollmentMode || current.valid ? withSeparators(current.yes) : "N/D" }}</strong>
              <small>{{ enrollmentMode ? "Total conhecido nessa condição" : `De ${withSeparators(current.valid)} respostas válidas` }}</small>
            </div>
            <div class="kpi">
              <span>{{ enrollmentMode ? "Matrículas consideradas no cálculo" : "Escolas ativas" }}</span>
              <strong>{{ withSeparators(enrollmentMode ? (current.enrollmentKnown ? current.valid : null) : current.schools) }}</strong>
              <small>{{ enrollmentMode ? "Matrículas conhecidas e indicador com resposta 0 ou 1" : "No recorte selecionado" }}</small>
            </div>
            <div class="kpi">
              <span>{{ enrollmentMode ? "Matrículas sem classificação" : "Sem resposta válida" }}</span>
              <strong>{{ withSeparators(current.unknown) }}</strong>
              <small>{{ enrollmentMode ? "Total conhecido em escolas sem resposta válida" : "Ausência de dados, não valor zero" }}</small>
            </div>
          </section>
          <p v-if="enrollmentMode" class="coverage-note">
            Cobertura: {{ withSeparators(current.studentSchools) }} de {{ withSeparators(current.schools) }} escolas com matrículas informadas.
            Escolas sem informação de matrícula: {{ withSeparators(current.missingEnrollmentSchools) }} (quantidade de matrículas desconhecida).
            Escolas sem resposta válida ao indicador: {{ withSeparators(current.schoolsUnknown) }}.
            Percentual N/D quando o denominador é zero. A comparação em p.p. exige cobertura completa nos dois anos consecutivos disponíveis.
          </p>
          <section class="panel map-panel" aria-labelledby="map-heading">
            <div class="panel-head">
              <div>
                <h2 id="map-heading">Distribuição territorial</h2>
                <p>
                  {{ selectedIndicator?.label }} · {{ enrollmentMode ? "percentual de matrículas em escolas sem o recurso" : "percentual de escolas com o recurso" }} por município
                </p>
              </div>
              <span class="map-scope">{{ uf }} / {{ year }}</span>
            </div>
            <MapPanel
              v-if="geo"
              :geo="geo"
              :stats="byMunicipality"
              :selected="city"
              :mode="mode"
              @select="selectCity"
            />
            <div v-else class="map-missing">
              A malha municipal não está disponível para este estado. Os
              indicadores e a série histórica podem ser consultados abaixo.
            </div>
            <div class="timeline" @keydown.esc="pause">
              <button
                class="play-button"
                @click="togglePlayback"
                :disabled="years.length < 2"
                :aria-pressed="playing"
              >
                <span aria-hidden="true">{{ playing ? "Ⅱ" : "▷" }}</span
                >{{ playing ? "Pausar" : "Reproduzir" }}
              </button>
              <div class="timeline-track">
                <label for="year-slider"
                  >Evolução por ano <strong>{{ year }}</strong></label
                ><input
                  id="year-slider"
                  type="range"
                  min="0"
                  :max="years.length - 1"
                  :value="yearIndex"
                  :aria-valuetext="String(year)"
                  :disabled="years.length < 2"
                  @input="setYear"
                />
                <div class="year-ticks" aria-hidden="true">
                  <span>{{ years[0] }}</span
                  ><span>Escala de cores fixa entre anos</span
                  ><span>{{ years.at(-1) }}</span>
                </div>
              </div>
            </div>
          </section>
          <section
            class="panel analysis-block"
            aria-labelledby="history-heading"
          >
            <div class="panel-head">
              <div>
                <h2 id="history-heading">Evolução histórica</h2>
                <p>
                  {{ selectedCity?.name || manifest.state_name }} ·
                  {{ selectedIndicator?.label }} · distribuições de {{ year }}
                </p>
              </div>
            </div>
            <div class="complementary-charts">
              <DistributionChart
                :distribution="networkDistribution"
                title="Distribuição por rede"
                :scope="networkScope"
              />
              <div class="historical-chart">
                <h3>Série anual</h3>
                <p class="historical-scope">
                  {{ enrollmentMode ? "Matrículas em escolas sem o recurso · % e total" : "Cobertura do indicador" }} · todos os filtros aplicados
                </p>
                <TrendChart :series="trend" :year="year" :mode="mode" />
                <details class="series-details">
                  <summary>Consultar valores por ano</summary>
                  <div class="table-wrap">
                    <table>
                      <caption class="sr-only">
                        Série histórica do indicador selecionado
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Ano</th>
                          <th scope="col">{{ enrollmentMode ? "Sem recurso (%)" : "Cobertura" }}</th>
                          <th scope="col">{{ enrollmentMode ? "Matrículas sem recurso / válidas" : "Com indicador / válidas" }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="point in trend" :key="point.year">
                          <th scope="row">{{ point.year }}</th>
                          <td>{{ percent(point.pct) }}</td>
                          <td>{{ withSeparators(point.yes) }} / {{ withSeparators(point.enrollmentKnown || !enrollmentMode ? point.valid : null) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
                <p class="chart-note">
                  N/D indica ausência de respostas válidas. Lacunas não são
                  interpoladas.
                </p>
              </div>
              <DistributionChart
                :distribution="locationDistribution"
                title="Distribuição por localização"
                :scope="locationScope"
              />
            </div>
          </section>
          <section class="panel below">
            <div class="panel-head">
              <div>
                <h2>Municípios em destaque</h2>
                <p>
                  {{ enrollmentMode ? "Maiores percentuais de matrículas em escolas sem o recurso, entre matrículas válidas." : "Ordenação pelo percentual do indicador, apenas com respostas válidas." }}
                </p>
              </div>
              <small>{{ ranking.length }} com dados</small>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Município</th>
                    <th scope="col">{{ enrollmentMode ? "Matrículas sem recurso" : "Escolas c/ indicador" }}</th>
                    <th scope="col">{{ enrollmentMode ? "Matrículas válidas" : "Respostas válidas" }}</th>
                    <th scope="col">Percentual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="m in ranking.slice(0, 15)"
                    :key="m.id"
                    :class="{ chosen: city === m.id }"
                  >
                    <th scope="row">
                      <button
                        class="city-link"
                        @click="selectCity(m.id)"
                        :aria-pressed="city === m.id"
                      >
                        {{ m.name }}
                      </button>
                    </th>
                    <td>{{ withSeparators(m.yes) }}</td>
                    <td>{{ withSeparators(m.valid) }}</td>
                    <td>
                      <span class="bar"
                        ><i
                          :style="{
                            width: m.pct + '%',
                            background: colorFor(m.pct, mode),
                          }"
                        ></i></span
                      >{{ percent(m.pct) }}
                    </td>
                  </tr>
                  <tr v-if="!ranking.length">
                    <td colspan="4">
                      Não há respostas válidas para este recorte.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section
            v-if="city !== 'all' && manifest.schools_available"
            class="panel below"
          >
            <div class="panel-head">
              <div>
                <h2>Escolas de {{ selectedCity?.name || city }}</h2>
                <p>
                  Detalhes das escolas ativas · {{ year }} · indicador
                  selecionado
                </p>
              </div>
              <small>{{
                schoolsBusy
                  ? "Carregando..."
                  : `${filteredSchools.length} escolas`
              }}</small>
            </div>
            <div class="table-wrap schools-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Escola</th>
                    <th scope="col">Código Inep</th>
                    <th scope="col">Rede</th>
                    <th scope="col">Área</th>
                    <th scope="col">Indicador</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!schoolsBusy && !filteredSchools.length">
                    <td colspan="5">Nenhuma escola para este recorte.</td>
                  </tr>
                  <tr v-for="s in filteredSchools" :key="s.id">
                    <td>{{ s.name }}</td>
                    <td>{{ s.id }}</td>
                    <td>
                      {{
                        {
                          "1": "Federal",
                          "2": "Estadual",
                          "3": "Municipal",
                          "4": "Privada",
                        }[s.rede] || "N/D"
                      }}
                    </td>
                    <td>
                      {{
                        { "1": "Urbana", "2": "Rural" }[s.localizacao] || "N/D"
                      }}
                    </td>
                    <td>{{ schoolAnswer(s.indicators[metric]) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          </template>
          <footer v-if="analysisMode !== 'ideb'">
            <span>Fonte: Censo Escolar — Inep · Cartografia: IBGE</span
            ><span
              >Dados gerados:
              {{
                new Date(manifest.generated_at).toLocaleDateString("pt-BR")
              }}</span
            >
            <p>
              {{ analysisMode === 'longitudinal' ? "Evolução das mesmas escolas pelo código Inep, com respostas 0 ou 1 nos dois anos e classificação do ano inicial." : enrollmentMode ? "Proporções entre matrículas conhecidas em escolas com respostas 0 ou 1." : "Proporções calculadas sobre escolas com respostas 0 ou 1, sem ponderação por matrícula." }} Comparações entre anos exigem verificar
              as alterações dos dicionários oficiais.
            </p>
            <div class="footer-project-links">
              <a
                href="https://github.com/hewerthomn/panorama-educacao"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"
                  />
                </svg>
                <span
                  >Código-fonte no GitHub<span class="sr-only">
                    (abre em nova aba)</span
                  ></span
                >
              </a>
              <a
                href="https://github.com/hewerthomn/panorama-educacao/issues/new"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.3"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="8" cy="8" r="6.2" />
                  <path d="M8 4.5v4" stroke-linecap="round" />
                  <circle
                    cx="8"
                    cy="11.2"
                    r=".7"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
                <span
                  >Reportar problema ou sugerir melhoria<span class="sr-only">
                    (abre em nova aba)</span
                  ></span
                >
              </a>
            </div>
          </footer>
        </template>
      </main>
    </div>
  </div>
</template>
