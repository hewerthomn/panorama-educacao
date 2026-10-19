<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
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
} from "./data.js";

const stateOptions = ref([]);
const uf = ref("RO");
const manifest = ref(null);
const geo = ref(null);
const year = ref(null);
const metric = ref("agua_potavel");
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
  stateOptions.value.map((s) => ({
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
  const previous = trend.value
    .filter((p) => p.year < year.value && p.pct !== null)
    .at(-1);
  if (!previous || current.value.pct === null) return null;
  const delta = current.value.pct - previous.pct;
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p. em relação a ${previous.year}`;
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
watch([metric, city, rede, area], pause);

let loadId = 0;
let schoolLoadId = 0;

onMounted(async () => {
  try {
    const index = await fetchJson("data/index.json");
    stateOptions.value = index.states || [];
    if (stateOptions.value.length) {
      const preferred = new URLSearchParams(location.search)
        .get("uf")
        ?.toUpperCase();
      uf.value = stateOptions.value.some((r) => r.uf === preferred)
        ? preferred
        : stateOptions.value.some((r) => r.uf === "RO")
          ? "RO"
          : stateOptions.value[0].uf;
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
const municipalities = computed(() => manifest.value?.municipalities || []);
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
const current = computed(() => compute(rows.value, metric.value));
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
    ),
  })),
);
const networkDistribution = computed(() =>
  distributionFor(manifest.value, {
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
    `Todas as redes · ${area.value === "all" ? "urbana e rural" : area.value === "1" ? "urbana" : "rural"}${rede.value !== "all" ? ". O filtro de rede não se aplica a este gráfico." : ""}`,
);
const locationScope = computed(
  () =>
    `Urbana e rural · ${{ all: "todas as redes", 1: "rede federal", 2: "rede estadual", 3: "rede municipal", 4: "rede privada" }[rede.value]}${area.value !== "all" ? ". O filtro de localização não se aplica a este gráfico." : ""}`,
);
const ranking = computed(() =>
  municipalities.value
    .map((m) => ({ ...m, ...byMunicipality.value[m.id] }))
    .filter((m) => m.pct !== null && m.valid > 0)
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, "pt-BR")),
);

watch([city, year, uf], async () => {
  const id = ++schoolLoadId;
  schools.value = [];
  schoolsBusy.value = false;
  if (
    !manifest.value?.schools_available ||
    city.value === "all" ||
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
        escolas_com: s.yes,
        escolas_validas: s.valid,
        total_escolas: s.schools,
        percentual: s.pct === null ? "" : s.pct.toFixed(2).replace(".", ","),
      };
    });
  exportCsv(`educacao_${uf.value}_${year.value}_${metric.value}.csv`, data);
}
function schoolAnswer(value) {
  return value === 1 ? "Sim" : value === 0 ? "Não" : "N/D";
}
function withSeparators(v) {
  return new Intl.NumberFormat("pt-BR").format(v);
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
          ><small>Observatório de infraestrutura escolar</small></span
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
        Censo Escolar <span> / </span> Análise territorial
      </div>
      <button class="button" @click="csvDownload" :disabled="!manifest">
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
            Explore as condições das escolas em cada território.
          </p>
          <div class="filters">
            <SearchSelect
              v-model="uf"
              :options="stateSelectOptions"
              label="Estado"
              placeholder="Pesquisar estado"
              :disabled="loading || !stateOptions.length"
              @change="loadUf"
            />
            <SearchSelect
              v-model="city"
              :options="citySelectOptions"
              label="Município"
              placeholder="Pesquisar município"
              clear-value="all"
              :disabled="!manifest"
            />
            <SearchSelect
              v-model="metric"
              :options="indicatorSelectOptions"
              label="Indicador"
              placeholder="Pesquisar indicador"
              :disabled="!manifest"
            />
            <label
              >Ano de referência<select
                v-model.number="year"
                @change="pause"
                :disabled="!manifest"
              >
                <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
              </select></label
            >
            <label
              >Rede de ensino<select v-model="rede">
                <option value="all">Todas as redes</option>
                <option value="1">Federal</option>
                <option value="2">Estadual</option>
                <option value="3">Municipal</option>
                <option value="4">Privada</option>
              </select></label
            >
            <label
              >Localização<select v-model="area">
                <option value="all">Urbana e rural</option>
                <option value="1">Urbana</option>
                <option value="2">Rural</option>
              </select></label
            >
          </div>
          <button
            class="reset-button"
            @click="resetFilters"
            :disabled="!manifest"
          >
            Redefinir recorte
          </button>
          <div class="source-note">
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
        <p v-if="loading" class="message" role="status">
          Carregando os indicadores…
        </p>
        <div v-if="error" class="message error" role="alert">
          {{ error }}
          <button class="button" @click="loadUf">Tentar novamente</button>
        </div>
        <p v-if="!loading && !error && !stateOptions.length" class="message">
          Ainda não há dados disponíveis. Consulte o README para gerar os dados
          do Censo Escolar.
        </p>
        <template v-if="manifest">
          <section class="intro">
            <div>
              <p class="territory">
                {{ manifest.state_name }}
                <span>/ {{ selectedCity?.name || "Todos os municípios" }}</span>
              </p>
              <h1>Panorama da Educação</h1>
              <p>Infraestrutura escolar no território e ao longo do tempo.</p>
            </div>
            <span class="reference-year"
              >Referência <strong>{{ year }}</strong></span
            >
          </section>
          <p v-if="missingYear" class="message warning">
            O campo <strong>{{ selectedIndicator?.field }}</strong> não está
            disponível em {{ year }}. O indicador é exibido como N/D, sem
            substituir por zero.
          </p>
          <section class="kpis" aria-label="Resumo do recorte">
            <div class="kpi primary">
              <span>{{ selectedIndicator?.label }}</span
              ><strong>{{ percent(current.pct) }}</strong
              ><small>{{
                comparison || "Das escolas com resposta válida"
              }}</small>
            </div>
            <div class="kpi">
              <span>Escolas com o indicador</span
              ><strong>{{
                current.valid ? withSeparators(current.yes) : "N/D"
              }}</strong
              ><small
                >De {{ withSeparators(current.valid) }} respostas válidas</small
              >
            </div>
            <div class="kpi">
              <span>Escolas ativas</span
              ><strong>{{ withSeparators(current.schools) }}</strong
              ><small>No recorte selecionado</small>
            </div>
            <div class="kpi">
              <span>Sem resposta válida</span
              ><strong>{{ withSeparators(current.unknown) }}</strong
              ><small>Ausência de dados, não valor zero</small>
            </div>
          </section>
          <section class="panel map-panel" aria-labelledby="map-heading">
            <div class="panel-head">
              <div>
                <h2 id="map-heading">Distribuição territorial</h2>
                <p>
                  {{ selectedIndicator?.label }} · percentual de escolas por
                  município
                </p>
              </div>
              <span class="map-scope">{{ uf }} / {{ year }}</span>
            </div>
            <MapPanel
              v-if="geo"
              :geo="geo"
              :stats="byMunicipality"
              :selected="city"
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
                  Cobertura do indicador · todos os filtros aplicados
                </p>
                <TrendChart :series="trend" :year="year" />
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
                          <th scope="col">Cobertura</th>
                          <th scope="col">Com indicador / válidas</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="point in trend" :key="point.year">
                          <th scope="row">{{ point.year }}</th>
                          <td>{{ percent(point.pct) }}</td>
                          <td>{{ point.yes }} / {{ point.valid }}</td>
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
                  Ordenação pelo percentual do indicador, apenas com respostas
                  válidas.
                </p>
              </div>
              <small>{{ ranking.length }} com dados</small>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Município</th>
                    <th scope="col">Escolas c/ indicador</th>
                    <th scope="col">Respostas válidas</th>
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
                    <td>{{ m.yes }}</td>
                    <td>{{ m.valid }}</td>
                    <td>
                      <span class="bar"
                        ><i
                          :style="{
                            width: m.pct + '%',
                            background: colorFor(m.pct),
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
          <footer>
            <span>Fonte: Censo Escolar — Inep · Cartografia: IBGE</span
            ><span
              >Dados gerados:
              {{
                new Date(manifest.generated_at).toLocaleDateString("pt-BR")
              }}</span
            >
            <p>
              Proporções calculadas sobre escolas com respostas 0 ou 1, sem
              ponderação por matrícula. Comparações entre anos exigem verificar
              as alterações dos dicionários oficiais.
            </p>
          </footer>
        </template>
      </main>
    </div>
  </div>
</template>
