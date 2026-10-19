<script setup>
import {
  ref,
  computed,
  watch,
  onBeforeUnmount,
  onMounted,
  nextTick,
} from "vue";
import { fetchJson } from "./data.js";
import MapPanel from "./MapPanel.vue";
import IdebChart from "./IdebChart.vue";
import {
  createIdebStore,
  filterResults,
  historyFor,
  comparison,
  difference,
  rankResults,
  statusLabel,
  score,
  scoreDelta,
  joinInfrastructure,
} from "./ideb.js";
const props = defineProps({ uf: String, city: String, geo: Object });
const emit = defineEmits(["select", "territory"]);
const info = ref(null),
  stage = ref("anos_iniciais"),
  year = ref(null),
  network = ref("Pública");
const states = ref([]),
  municipalities = ref([]),
  schools = ref([]);
const busy = ref(false),
  error = ref(""),
  order = ref("highest"),
  query = ref(""),
  limit = ref(30),
  schoolId = ref("");
const join = ref(null),
  joinBusy = ref(false),
  joinError = ref("");
const playing = ref(false);
const schoolHistoryHeading = ref(null);
let schoolTrigger;
async function openSchool(id, event) {
  schoolTrigger = event.currentTarget;
  schoolId.value = id;
  await nextTick();
  schoolHistoryHeading.value?.focus();
}
async function closeSchool() {
  schoolId.value = "";
  await nextTick();
  if (schoolTrigger?.isConnected) schoolTrigger.focus();
}
const store = createIdebStore(fetchJson);
let requestId = 0,
  joinRequest = 0,
  timer;
const years = computed(() =>
  [...(info.value?.years || [])].sort((a, b) => a - b),
);
const scope = computed(() =>
  props.city === "all"
    ? info.value?.state_name
    : info.value?.municipalities.find((m) => m.id === props.city)?.name ||
      props.city,
);
const territoryRows = computed(() =>
  props.city === "all" ? states.value : municipalities.value,
);
const networks = computed(() =>
  [
    ...new Set(
      filterResults(territoryRows.value, {
        year: year.value,
        stage: stage.value,
        city: props.city,
      }).map((r) => r.network),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR")),
);
const series = computed(() =>
  historyFor(territoryRows.value, years.value, {
    stage: stage.value,
    city: props.city,
    network: network.value,
  }),
);
const change = computed(() => comparison(series.value, year.value));
const period = computed(() => {
  const valid = series.value.filter((r) => r.ideb !== null);
  return valid.length >= 2
    ? {
        start: valid[0],
        end: valid.at(-1),
        delta: difference(valid.at(-1).ideb, valid[0].ideb),
      }
    : null;
});
const mapStats = computed(() =>
  Object.fromEntries(
    (info.value?.municipalities || []).map((m) => {
      const s = historyFor(municipalities.value, years.value, {
        stage: stage.value,
        city: m.id,
        network: network.value,
      });
      const c = comparison(s, year.value);
      return [
        m.id,
        {
          ...c.current,
          year: year.value,
          previous: c.previous,
          delta: c.delta,
        },
      ];
    }),
  ),
);
const ranked = computed(() =>
  rankResults(municipalities.value, years.value, {
    year: year.value,
    stage: stage.value,
    network: network.value,
    city: props.city,
    order: order.value,
  }),
);
const schoolRows = computed(() =>
  filterResults(schools.value, {
    year: year.value,
    stage: stage.value,
    city: props.city,
    network: network.value,
  }),
);
const published = computed(
  () => schoolRows.value.filter((r) => r.status === "available").length,
);
const schoolRanking = computed(() => {
  const options = {
    year: year.value,
    stage: stage.value,
    city: props.city,
    network: network.value,
    order: order.value,
  };
  const numeric = rankResults(schools.value, years.value, options);
  const unranked = schoolRows.value
    .filter((r) => r.ideb === null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const search = normalize(query.value.trim());
  return [...numeric, ...unranked].filter((r) =>
    normalize(`${r.name} ${r.school_id}`).includes(search),
  );
});
const schoolSeries = computed(() =>
  historyFor(schools.value, years.value, {
    stage: stage.value,
    school: schoolId.value,
    network: network.value,
  }),
);
const selectedSchool = computed(() =>
  schoolSeries.value.find((r) => r.school_id),
);
function pause() {
  playing.value = false;
  clearInterval(timer);
}
function play() {
  if (playing.value) return pause();
  if (year.value === years.value.at(-1)) year.value = years.value[0];
  playing.value = true;
  timer = setInterval(() => {
    const index = years.value.indexOf(year.value);
    if (index >= years.value.length - 1) return pause();
    year.value = years.value[index + 1];
  }, 1600);
}
function setEdition(event) {
  pause();
  year.value = years.value[Number(event.target.value)];
}
function visibility() {
  if (document.hidden) pause();
}
onMounted(() => document.addEventListener("visibilitychange", visibility));
onBeforeUnmount(() => {
  requestId++;
  joinRequest++;
  pause();
  document.removeEventListener("visibilitychange", visibility);
});
async function loadManifest() {
  const id = ++requestId;
  pause();
  busy.value = true;
  error.value = "";
  info.value = null;
  states.value = [];
  municipalities.value = [];
  schools.value = [];
  schoolId.value = "";
  try {
    const index = await fetchJson("data/ideb/index.json");
    if (id !== requestId) return;
    if (!index.states.some((s) => s.uf === props.uf)) {
      error.value = `Ideb ainda não processado para ${props.uf}. Gere esta UF com o importador independente.`;
      return;
    }
    const manifest = await fetchJson(`data/ideb/${props.uf}/manifest.json`);
    if (id !== requestId) return;
    if (manifest.schema_version !== 1)
      throw new Error("Manifesto Ideb incompatível. Regenere os dados.");
    info.value = manifest;
    emit("territory", manifest);
    year.value = years.value.at(-1);
    await loadStage();
  } catch (e) {
    if (id === requestId) error.value = e.message;
  } finally {
    if (id === requestId) busy.value = false;
  }
}
async function loadStage() {
  if (!info.value) return;
  const id = ++requestId;
  pause();
  busy.value = true;
  error.value = "";
  states.value = [];
  municipalities.value = [];
  schools.value = [];
  try {
    const meta = info.value.files[stage.value];
    const data = await Promise.all(
      ["state", "municipality", "school"].map((level) =>
        store.get(props.uf, stage.value, level, meta[level]),
      ),
    );
    if (id !== requestId) return;
    [states.value, municipalities.value, schools.value] = data;
  } catch (e) {
    if (id === requestId) error.value = e.message;
  } finally {
    if (id === requestId) busy.value = false;
  }
}
watch(() => props.uf, loadManifest, { immediate: true });
watch(stage, loadStage);
watch(networks, (available) => {
  if (available.length && !available.includes(network.value))
    network.value = available.includes("Pública") ? "Pública" : available[0];
});
watch([stage, network, () => props.city], () => {
  pause();
  limit.value = 30;
});
watch([query, order, year], () => {
  limit.value = 30;
});
watch([schoolId, year, stage], () => {
  joinRequest++;
  join.value = null;
  joinBusy.value = false;
  joinError.value = "";
});
async function checkCensus() {
  const current = schoolSeries.value.find(
    (r) => r.year === year.value && r.school_id,
  );
  if (!current) return;
  const id = ++joinRequest;
  joinBusy.value = true;
  joinError.value = "";
  try {
    const census = await fetchJson(
      `data/${props.uf}/schools/${year.value}.json`,
    );
    if (id === joinRequest) join.value = joinInfrastructure(current, census);
  } catch (e) {
    if (id === joinRequest)
      joinError.value = `Censo indisponível para esta edição: ${e.message}`;
  } finally {
    if (id === joinRequest) joinBusy.value = false;
  }
}
</script>
<template>
  <div class="ideb-analysis" :aria-busy="busy">
    <Teleport to="#ideb-filters">
      <div class="filters">
        <label
          >Etapa de ensino<select v-model="stage" :disabled="busy">
            <option
              v-for="(label, key) in info?.stages || {
                anos_iniciais: 'Ensino fundamental — anos iniciais',
                anos_finais: 'Ensino fundamental — anos finais',
                ensino_medio: 'Ensino médio',
              }"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select></label
        >
        <label
          >Edição do Ideb<select
            v-model.number="year"
            :disabled="busy || !years.length"
            @change="pause"
          >
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select></label
        >
        <label
          >Rede publicada<select
            v-model="network"
            :disabled="busy || !networks.length"
          >
            <option v-for="n in networks" :key="n">{{ n }}</option>
          </select></label
        >
        <p class="filter-help">
          Categorias oficiais do território selecionado. Localização
          urbana/rural não é publicada neste conjunto.
        </p>
      </div>
      <button
        class="reset-button"
        @click="
          pause();
          stage = 'anos_iniciais';
          year = years.at(-1);
          network = 'Pública';
          emit('select', 'all');
        "
      >
        Redefinir recorte
      </button>
      <div class="source-note">
        <h3>Sobre o Ideb</h3>
        <p>
          Nota bienal de 0 a 10. Resultados oficiais de cada território, sem
          médias das escolas.
        </p>
        <a
          :href="
            info?.source_page ||
            'https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025'
          "
          target="_blank"
          rel="noopener noreferrer"
          >Consultar resultados do Inep ↗</a
        >
      </div>
    </Teleport>
    <p v-if="busy" class="message" role="status">
      Carregando resultados oficiais do Ideb…
    </p>
    <div v-else-if="error" class="message error" role="alert">
      {{ error }}
      <button class="button" @click="info ? loadStage() : loadManifest()">
        Tentar novamente
      </button>
    </div>
    <template v-else-if="info">
      <div class="panel-head ideb-heading">
        <div>
          <h2>Desempenho educacional · Ideb</h2>
          <p>
            {{ scope }} · {{ info.stages[stage] }} · rede
            {{ network.toLocaleLowerCase("pt-BR") }}
          </p>
        </div>
        <span class="map-scope">{{ year }}</span>
      </div>
      <section class="kpis" aria-label="Resumo do Ideb">
        <div class="kpi primary">
          <span>Ideb do território selecionado</span
          ><strong>{{ score(change.current?.ideb) }}</strong
          ><small>{{ statusLabel(change.current) }} · escala de 0 a 10</small>
        </div>
        <div class="kpi">
          <span>Variação desde a edição anterior</span
          ><strong>{{ scoreDelta(change.delta) }}</strong
          ><small>{{
            change.previous
              ? `Anterior disponível: ${change.previous.year} · ${score(change.previous.ideb)}`
              : "Sem edição anterior disponível"
          }}</small>
        </div>
        <div class="kpi">
          <span>Evolução no período</span
          ><strong>{{ scoreDelta(period?.delta) }}</strong
          ><small>{{
            period
              ? `${period.start.year} → ${period.end.year}`
              : "Requer duas edições publicadas"
          }}</small>
        </div>
        <div class="kpi">
          <span>Cobertura dos resultados escolares</span
          ><strong>{{ published }} / {{ schoolRows.length }}</strong
          ><small>Com nota / linhas na fonte · etapa e rede selecionadas</small>
        </div>
      </section>
      <p
        v-if="!filterResults(municipalities, { year, stage, network }).length"
        class="message warning"
      >
        A fonte municipal não publica esta rede para a etapa e edição
        selecionadas. O mapa permanece sem notas; escolha outra rede publicada
        no filtro.
      </p>
      <p class="coverage-note">
        Ausência de nota não indica baixo desempenho. A cobertura considera
        somente escolas listadas pelo Inep, não todas as escolas do Censo. Redes
        agregadas “Pública” e “Total” não são somadas a suas dependências.
      </p>
      <section class="panel map-panel" aria-labelledby="ideb-map-heading">
        <div class="panel-head">
          <div>
            <h2 id="ideb-map-heading">Ideb por município</h2>
            <p>{{ info.stages[stage] }} · {{ network }} · {{ year }}</p>
          </div>
        </div>
        <MapPanel
          v-if="geo"
          :geo="geo"
          :stats="mapStats"
          :selected="city"
          mode="ideb"
          @select="emit('select', $event)"
        />
        <p v-else class="map-missing">
          Malha municipal indisponível. Consulte os resultados no ranking e nos
          filtros.
        </p>
        <div class="timeline" @keydown.esc="pause">
          <button
            class="play-button"
            @click="play"
            :disabled="years.length < 2"
            :aria-pressed="playing"
          >
            {{ playing ? "Pausar" : "Reproduzir" }}
          </button>
          <div class="timeline-track">
            <label for="ideb-slider"
              >Evolução por edição <strong>{{ year }}</strong></label
            ><input
              id="ideb-slider"
              type="range"
              min="0"
              :max="years.length - 1"
              :value="years.indexOf(year)"
              :aria-valuetext="String(year)"
              @input="setEdition"
            />
            <div class="year-ticks" aria-hidden="true">
              <span v-for="y in years" :key="y">{{ y }}</span>
            </div>
          </div>
        </div>
      </section>
      <section
        v-if="city !== 'all'"
        class="panel below"
        aria-label="Município selecionado"
      >
        <div class="panel-head">
          <div>
            <h2>{{ scope }}</h2>
            <p>
              Ideb {{ year }}: {{ score(change.current?.ideb) }} ·
              {{
                change.previous
                  ? `Anterior disponível ${change.previous.year}: ${score(change.previous.ideb)}`
                  : "Sem edição anterior disponível"
              }}
              · {{ scoreDelta(change.delta) }}
            </p>
          </div>
          <a class="button" href="#ideb-schools"
            >Consultar resultados escolares</a
          >
        </div>
      </section>
      <section class="panel below ideb-history">
        <div class="panel-head">
          <div>
            <h2>Evolução histórica do Ideb</h2>
            <p>{{ scope }} · {{ info.stages[stage] }} · {{ network }}</p>
          </div>
        </div>
        <IdebChart
          :series="series"
          :year="year"
          :title="`Evolução do Ideb de ${scope}`"
        />
        <div class="table-wrap">
          <table>
            <caption class="sr-only">
              Resultados oficiais por edição
            </caption>
            <thead>
              <tr>
                <th scope="col">Edição</th>
                <th scope="col">Ideb</th>
                <th scope="col">Situação</th>
                <th scope="col">Variação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in series" :key="point.year">
                <th scope="row">{{ point.year }}</th>
                <td>{{ score(point.ideb) }}</td>
                <td>{{ statusLabel(point) }}</td>
                <td>{{ scoreDelta(comparison(series, point.year).delta) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="chart-note">
          Edições bienais; lacunas não são interpoladas. Variações em pontos da
          escala, em relação à nota anterior disponível. Considere o impacto da
          pandemia na edição de 2021.
        </p>
      </section>
      <section class="panel below ideb-ranking">
        <div class="panel-head">
          <div>
            <h2>Ranking de municípios</h2>
            <p>
              {{ ranked.length }} municípios com nota ·
              {{ info.stages[stage] }} · {{ year }}
            </p>
          </div>
          <label
            >Ordenar resultados<select v-model="order">
              <option value="highest">Maior Ideb</option>
              <option value="lowest">Menor Ideb</option>
              <option value="gain">Maior evolução</option>
              <option value="loss">Maior queda</option>
            </select></label
          >
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Município</th>
                <th scope="col">Ideb {{ year }}</th>
                <th scope="col">Anterior disponível</th>
                <th scope="col">Variação</th>
                <th scope="col">Etapa</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ranked.slice(0, limit)" :key="r.municipality_id">
                <th scope="row">
                  <button
                    class="city-link"
                    @click="emit('select', r.municipality_id)"
                  >
                    {{ r.name }}
                  </button>
                </th>
                <td>{{ score(r.ideb) }}</td>
                <td>
                  {{
                    r.previous
                      ? `${score(r.previous.ideb)} (${r.previous.year})`
                      : "N/D"
                  }}
                </td>
                <td>{{ scoreDelta(r.delta) }}</td>
                <td>{{ info.stages[stage] }}</td>
              </tr>
              <tr v-if="!ranked.length">
                <td colspan="5">
                  Sem resultados numéricos para esta classificação.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          v-if="ranked.length > limit"
          class="button"
          @click="limit += 30"
        >
          Mostrar mais municípios
        </button>
      </section>
      <section id="ideb-schools" class="panel below ideb-schools">
        <div class="panel-head">
          <div>
            <h2>Resultados escolares publicados</h2>
            <p>
              {{ scope }} · {{ info.stages[stage] }} · {{ year }} ·
              {{ schoolRanking.length }} registros
            </p>
          </div>
          <label
            >Pesquisar escola ou código Inep<input
              v-model="query"
              type="search"
          /></label>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Escola / código Inep</th>
                <th scope="col">Município</th>
                <th scope="col">Etapa / rede</th>
                <th scope="col">Ideb {{ year }}</th>
                <th scope="col">Anterior disponível</th>
                <th scope="col">Variação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in schoolRanking.slice(0, limit)" :key="r.school_id">
                <th scope="row">
                  <button
                    class="city-link"
                    @click="openSchool(r.school_id, $event)"
                  >
                    {{ r.name }}</button
                  ><small class="school-code">{{ r.school_id }}</small>
                </th>
                <td>{{ r.municipality_name }}</td>
                <td>{{ info.stages[stage] }} / {{ r.network }}</td>
                <td>{{ r.ideb === null ? statusLabel(r) : score(r.ideb) }}</td>
                <td>
                  {{
                    r.previous
                      ? `${score(r.previous.ideb)} (${r.previous.year})`
                      : "N/D"
                  }}
                </td>
                <td>{{ scoreDelta(r.delta) }}</td>
              </tr>
              <tr v-if="!schoolRanking.length">
                <td colspan="6">
                  Nenhuma escola localizada nesta fonte para o recorte.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="chart-note">
          Somente notas publicadas participam da classificação numérica. Linhas
          sem nota aparecem ao final para consulta.
        </p>
        <button
          v-if="schoolRanking.length > limit"
          class="button"
          @click="limit += 30"
        >
          Mostrar mais escolas
        </button>
      </section>
      <section v-if="schoolId" class="panel below ideb-school-history">
        <div class="panel-head">
          <div>
            <h2 ref="schoolHistoryHeading" tabindex="-1">
              Histórico da escola
            </h2>
            <p>
              {{ selectedSchool?.name || schoolId }} · {{ schoolId }} ·
              {{ info.stages[stage] }}
            </p>
          </div>
          <button class="button" @click="closeSchool">Fechar histórico</button>
        </div>
        <IdebChart
          :series="schoolSeries"
          :year="year"
          title="Histórico da escola"
        />
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Edição</th>
                <th scope="col">Ideb</th>
                <th scope="col">Situação</th>
                <th scope="col">Variação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in schoolSeries" :key="r.year">
                <th scope="row">{{ r.year }}</th>
                <td>{{ score(r.ideb) }}</td>
                <td>{{ statusLabel(r) }}</td>
                <td>
                  {{ scoreDelta(comparison(schoolSeries, r.year).delta) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ideb-census">
          <button
            class="button"
            @click="checkCensus"
            :disabled="
              joinBusy ||
              !schoolSeries.some((r) => r.year === year && r.school_id)
            "
          >
            {{
              joinBusy ? "Consultando Censo…" : `Relacionar ao Censo de ${year}`
            }}
          </button>
          <p v-if="join" role="status">
            {{
              join.status === "matched"
                ? `Escola localizada no Censo de ${year}: ${join.school.name}.`
                : join.status === "school_not_found"
                  ? "Escola não localizada no cruzamento desta edição."
                  : "Informação ausente para esta edição."
            }}
          </p>
          <p v-if="joinError" role="alert">{{ joinError }}</p>
          <p class="chart-note">
            Código Inep e ano da edição preservados, com resultado separado por
            etapa. A infraestrutura descreve a escola; não comprova a oferta
            desta etapa nem estabelece causalidade.
          </p>
        </div>
      </section>
      <footer>
        <span
          >Fonte: resultados oficiais do Ideb — Inep · Cartografia: IBGE</span
        ><span
          >Dados gerados:
          {{ new Date(info.generated_at).toLocaleDateString("pt-BR") }}</span
        >
        <p>
          Resultados de UF, município e escola são observações independentes.
          Não há médias escolares usadas como notas territoriais. Restrições de
          divulgação são preservadas.
        </p>
        <details>
          <summary>Arquivos oficiais utilizados</summary>
          <ul>
            <li v-for="(source, id) in info.sources" :key="id">
              <a :href="source.url" target="_blank" rel="noopener noreferrer">{{
                source.filename
              }}</a>
            </li>
          </ul>
        </details>
        <div class="footer-project-links">
          <a
            href="https://github.com/hewerthomn/panorama-educacao"
            target="_blank"
            rel="noopener noreferrer"
            >Código-fonte no GitHub</a
          ><a
            href="https://github.com/hewerthomn/panorama-educacao/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            >Reportar problema ou sugerir melhoria</a
          >
        </div>
      </footer>
    </template>
  </div>
</template>
