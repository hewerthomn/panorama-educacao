<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";
import MapPanel from "./MapPanel.vue";
import TransitionChart from "./TransitionChart.vue";
import { percent, exportCsv } from "./data.js";
import {
  transitions,
  transitionLabels,
  rankMunicipalities,
  points,
} from "./longitudinal.js";

const props = defineProps({
  manifest: Object,
  uf: String,
  geo: Object,
  metric: String,
  city: String,
  rede: String,
  area: String,
});
const emit = defineEmits(["select"]);
const years = computed(() => [...props.manifest.years].sort((a, b) => a - b));
const start = ref(years.value[0]);
const end = ref(years.value.at(-1));
const startYears = computed(() => years.value.filter((y) => y < end.value));
const endYears = computed(() => years.value.filter((y) => y > start.value));
const indicator = computed(() =>
  props.manifest.indicators.find((i) => i.key === props.metric),
);
const unavailableYears = computed(() =>
  [start.value, end.value].filter(
    (y) => !indicator.value?.available_years.includes(y),
  ),
);
const busy = ref(false),
  error = ref(""),
  result = ref(null),
  comparisonId = ref(null);
const order = ref("balancePositive"),
  list = ref(null),
  listBusy = ref(false),
  listError = ref("");
const transition = ref("all"),
  query = ref(""),
  offset = ref(0);
const historyId = ref(null),
  history = ref(null),
  historyBusy = ref(false),
  historyError = ref("");
const schoolSection = ref(null),
  historyHeading = ref(null);
const total = computed(() => result.value?.total);
const municipalityName = (id) =>
  props.manifest.municipalities.find((m) => m.id === id)?.name || id;
const networkName = (id) =>
  ({ 1: "Federal", 2: "Estadual", 3: "Municipal", 4: "Privada" })[id] || "N/D";
const areaName = (id) => ({ 1: "Urbana", 2: "Rural" })[id] || "N/D";
const number = (value) =>
  value == null ? "N/D" : value.toLocaleString("pt-BR");
const answer = (value) =>
  value === 1
    ? "Possuía o recurso"
    : value === 0
      ? "Não possuía o recurso"
      : "Resposta indisponível";
const ranking = computed(() =>
  rankMunicipalities(
    props.manifest.municipalities,
    result.value?.groups.municipio || {},
    order.value,
  ),
);
const rankValue = (row) =>
  order.value === "improvement"
    ? percent(row.improvementRate)
    : order.value === "worsening"
      ? percent(row.worseningRate)
      : points(row.balance);
const attributes = (school) =>
  `${municipalityName(school.municipio)} · ${networkName(school.rede)} · ${areaName(school.localizacao)}`;

// Uma thread/cache por UF; respostas obsoletas nunca chegam aos resultados visíveis.
let worker,
  nextId = 0,
  compareVersion = 0,
  listVersion = 0,
  historyVersion = 0;
const pending = new Map();
let workerError;
try {
  worker = new Worker(new URL("./longitudinal.worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    data.error
      ? request.reject(new Error(data.error))
      : request.resolve(data.result);
  };
  worker.onerror = () => {
    workerError = new Error(
      "Não foi possível iniciar a comparação neste navegador. Recarregue a página para tentar novamente.",
    );
    for (const request of pending.values()) request.reject(workerError);
    pending.clear();
  };
  worker.postMessage({
    type: "init",
    payload: {
      uf: props.uf,
      years: years.value,
      base: new URL(import.meta.env.BASE_URL, location.href).href,
    },
  });
} catch {
  workerError = new Error(
    "Comparação indisponível neste navegador: o processamento em segundo plano não pôde ser iniciado.",
  );
}
function request(type, payload) {
  const id = ++nextId;
  return {
    id,
    promise: new Promise((resolve, reject) => {
      if (workerError) return reject(workerError);
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload });
    }),
  };
}
onBeforeUnmount(() => {
  ++compareVersion;
  ++listVersion;
  ++historyVersion;
  worker?.terminate();
  for (const request of pending.values())
    request.reject(new Error("Comparação encerrada."));
  pending.clear();
});

function clearHistory() {
  ++historyVersion;
  historyId.value = null;
  history.value = null;
  historyBusy.value = false;
  historyError.value = "";
}
async function compare() {
  const version = ++compareVersion;
  ++listVersion;
  result.value = null;
  list.value = null;
  comparisonId.value = null;
  listBusy.value = false;
  listError.value = "";
  clearHistory();
  offset.value = 0;
  error.value = "";
  if (!props.manifest.schools_available || years.value.length < 2) return;
  busy.value = true;
  try {
    const task = request("compare", {
      start: start.value,
      end: end.value,
      metric: props.metric,
      filters: { city: props.city, rede: props.rede, area: props.area },
    });
    const data = await task.promise;
    if (version !== compareVersion || !data) return;
    result.value = data;
    comparisonId.value = task.id;
  } catch (e) {
    if (version === compareVersion) error.value = e.message;
  } finally {
    if (version === compareVersion) busy.value = false;
  }
}
watch(
  () => [
    start.value,
    end.value,
    props.metric,
    props.city,
    props.rede,
    props.area,
  ],
  compare,
  { immediate: true, flush: "sync" },
);
async function loadList() {
  const version = ++listVersion;
  list.value = null;
  listError.value = "";
  listBusy.value = false;
  if (comparisonId.value === null) return;
  listBusy.value = true;
  try {
    const data = await request("list", {
      comparison: comparisonId.value,
      transition: transition.value,
      query: query.value,
      offset: offset.value,
    }).promise;
    if (version === listVersion) list.value = data;
  } catch (e) {
    if (version === listVersion) listError.value = e.message;
  } finally {
    if (version === listVersion) listBusy.value = false;
  }
}
watch([query, transition], () => {
  offset.value = 0;
});
watch([comparisonId, offset, transition, query], loadList);
async function openHistory(id) {
  const version = ++historyVersion;
  historyId.value = id;
  history.value = null;
  historyError.value = "";
  historyBusy.value = true;
  await nextTick();
  historyHeading.value?.focus();
  try {
    const data = await request("history", { school: id, metric: props.metric })
      .promise;
    if (version === historyVersion) history.value = data;
  } catch (e) {
    if (version === historyVersion) historyError.value = e.message;
  } finally {
    if (version === historyVersion) historyBusy.value = false;
  }
}
const historySchool = computed(
  () => history.value?.findLast((row) => row.school)?.school,
);
function showSchools() {
  schoolSection.value?.scrollIntoView({ block: "start" });
  schoolSection.value?.focus({ preventScroll: true });
}
function download() {
  if (!result.value) return;
  exportCsv(
    `evolucao_escolas_${props.uf}_${start.value}_${end.value}_${props.metric}.csv`,
    props.manifest.municipalities
      .filter((m) => result.value.groups.municipio[m.id])
      .map((m) => ({
        codigo_ibge: m.id,
        municipio: m.name,
        ano_inicial: start.value,
        ano_final: end.value,
        indicador: props.metric,
        rede: props.rede,
        localizacao: props.area,
        ...result.value.groups.municipio[m.id],
      })),
    [
      "codigo_ibge",
      "municipio",
      "ano_inicial",
      "ano_final",
      "indicador",
      "rede",
      "localizacao",
      "comparable",
      "improved",
      "worsened",
      "retainedWith",
      "retainedWithout",
      "invalid",
      "left",
      "entered",
      "improvementRate",
      "worseningRate",
      "balance",
    ],
  );
}
</script>

<template>
  <section
    class="longitudinal"
    aria-labelledby="longitudinal-heading"
    :aria-busy="busy"
  >
    <div class="perspective-row">
      <div>
        <h2 id="longitudinal-heading">Evolução das escolas</h2>
        <p class="longitudinal-subtitle">
          {{ indicator?.label }} · {{ start }} a {{ end }}
        </p>
      </div>
      <div class="period-control">
        <label
          >De:<select v-model.number="start" :disabled="years.length < 2">
            <option v-for="y in startYears" :key="y" :value="y">{{ y }}</option>
          </select></label
        >
        <label
          >Até:<select v-model.number="end" :disabled="years.length < 2">
            <option v-for="y in endYears" :key="y" :value="y">{{ y }}</option>
          </select></label
        >
        <button class="button" :disabled="!result" @click="download">
          Exportar CSV
        </button>
      </div>
    </div>
    <p class="perspective-note">
      Mesmas escolas pelo código Inep. Município, rede e localização seguem o
      ano inicial.
    </p>
    <p v-if="!manifest.schools_available" class="message warning">
      Arquivos anuais por escola indisponíveis nesta UF. Consulte o Panorama por
      ano.
    </p>
    <p v-else-if="years.length < 2" class="message warning">
      São necessários ao menos dois anos disponíveis para comparar as escolas.
    </p>
    <p v-else-if="busy" class="message" role="status">
      Comparando as escolas de {{ start }} e {{ end }}…
    </p>
    <p v-if="error" class="message error" role="alert">
      {{ error }}
      <button class="button" @click="compare">Tentar novamente</button>
    </p>
    <template v-if="total">
      <p v-if="unavailableYears.length" class="message warning">
        O indicador não está disponível em {{ unavailableYears.join(" e ") }}.
        Respostas ausentes ficam sem comparação válida.
      </p>
      <div class="evolution-summary">
        <div>
          <span>Saldo de evolução</span
          ><strong>{{ points(total.balance) }}</strong>
        </div>
        <p>
          <strong>{{ number(total.comparable) }} escolas comparáveis</strong>
          com respostas 0 ou 1 nos dois anos. Taxa de melhoria
          {{ percent(total.improvementRate) }}; taxa de piora
          {{ percent(total.worseningRate) }}. O saldo é a taxa de melhoria menos
          a taxa de piora; não é a diferença entre percentuais agregados.
        </p>
      </div>
      <section class="kpis evolution-kpis" aria-label="Transições das escolas">
        <div v-for="t in transitions" :key="t.key" class="kpi">
          <span>{{ t.label }}</span
          ><strong>{{ number(total[t.key]) }}</strong>
          <small
            >{{
              percent(
                total.comparable
                  ? (total[t.key] / total.comparable) * 100
                  : null,
              )
            }}
            das comparáveis</small
          >
        </div>
        <div class="kpi">
          <span>Sem comparação válida</span
          ><strong>{{ number(total.invalid) }}</strong
          ><small>Presentes nos dois anos; resposta ausente ou inválida</small>
        </div>
      </section>
      <p class="coverage-note">
        Saiu da base de escolas ativas: {{ number(total.left) }}. Entrou na base
        de escolas ativas: {{ number(total.entered) }}. Esses movimentos não
        comprovam fechamento ou inauguração. {{ number(total.changed) }} escolas
        presentes nos dois anos mudaram de nome, município, rede ou localização.
      </p>
      <details class="cohort-method">
        <summary>Como a coorte é definida</summary>
        <p>
          Escolas que mudaram de município, rede ou localização continuam
          vinculadas à classificação inicial. As mudanças são indicadas na
          lista. Entrantes usam a classificação final e ficam fora das taxas. A
          comparação usa somente a UF selecionada: uma transferência para outra
          UF pode aparecer como entrada ou saída da base. Mudanças de código
          Inep não são vinculadas automaticamente. As definições dos campos do
          Censo podem variar entre anos.
        </p>
      </details>
      <section class="panel map-panel" aria-labelledby="evolution-map-heading">
        <div class="panel-head">
          <div>
            <h2 id="evolution-map-heading">Saldo por município</h2>
            <p>
              {{ indicator?.label }} · {{ start }} a {{ end }} · coorte do ano
              inicial
            </p>
          </div>
          <span class="map-scope">{{ uf }}</span>
        </div>
        <MapPanel
          v-if="geo"
          :geo="geo"
          :stats="result.groups.municipio"
          :selected="city"
          mode="longitudinal"
          @select="emit('select', $event)"
        />
        <div v-else class="map-missing">
          Malha municipal indisponível. Consulte os resultados no ranking.
        </div>
        <div v-if="city !== 'all'" class="municipal-comparison">
          <strong>{{ municipalityName(city) }}</strong>
          <p>
            {{ number(total.comparable) }} comparáveis ·
            {{ number(total.improved) }} melhoraram ·
            {{ number(total.worsened) }} pioraram ·
            {{ number(total.retainedWith + total.retainedWithout) }} sem mudança
            · {{ number(total.invalid) }} sem comparação válida · saldo
            {{ points(total.balance) }}.
          </p>
          <button class="button" @click="showSchools">
            Ver escolas da comparação
          </button>
        </div>
      </section>
      <section class="panel below" aria-labelledby="transition-heading">
        <div class="panel-head">
          <div>
            <h2 id="transition-heading">
              Transições entre {{ start }} e {{ end }}
            </h2>
            <p>Quantidade de escolas · respostas válidas nos dois anos</p>
          </div>
        </div>
        <TransitionChart :totals="total" />
      </section>
      <section class="panel below" aria-labelledby="evolution-ranking-heading">
        <div class="panel-head">
          <div>
            <h2 id="evolution-ranking-heading">Ranking longitudinal</h2>
            <p>
              {{ ranking.length }} municípios com escolas comparáveis · todos os
              filtros aplicados
            </p>
          </div>
          <label class="ranking-order"
            >Ordenar por<select v-model="order">
              <option value="improvement">Maior taxa de melhoria</option>
              <option value="worsening">Maior taxa de piora</option>
              <option value="balancePositive">Maior saldo positivo</option>
              <option value="balanceNegative">Maior saldo negativo</option>
            </select></label
          >
        </div>
        <div class="table-wrap">
          <table>
            <caption class="sr-only">
              Municípios e suas taxas longitudinais
            </caption>
            <thead>
              <tr>
                <th scope="col">Município</th>
                <th scope="col">Escolas comparáveis</th>
                <th scope="col">Melhoria</th>
                <th scope="col">Piora</th>
                <th scope="col">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in ranking" :key="m.id">
                <th scope="row">
                  <button class="city-link" @click="emit('select', m.id)">
                    {{ m.name }}
                  </button>
                </th>
                <td>{{ number(m.comparable) }}</td>
                <td>{{ percent(m.improvementRate) }}</td>
                <td>{{ percent(m.worseningRate) }}</td>
                <td>
                  {{ points(m.balance)
                  }}<span class="sr-only">
                    · valor de ordenação {{ rankValue(m) }}</span
                  >
                </td>
              </tr>
              <tr v-if="!ranking.length">
                <td colspan="5">
                  Nenhum município com escolas comparáveis. Consulte as escolas
                  sem comparação válida abaixo.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section
        ref="schoolSection"
        class="panel below"
        tabindex="-1"
        aria-labelledby="cohort-schools-heading"
      >
        <div class="panel-head">
          <div>
            <h2 id="cohort-schools-heading">
              Escolas da comparação{{
                city === "all" ? "" : ` · ${municipalityName(city)}`
              }}
            </h2>
            <p>
              Identidade pelo código Inep · classificação inicial preservada ·
              até 50 escolas por página
            </p>
          </div>
        </div>
        <div class="school-list-filters">
          <label
            >Pesquisar escola ou código Inep<input
              v-model="query"
              type="search" /></label
          ><label
            >Transição<select v-model="transition">
              <option value="all">Todas as transições</option>
              <option
                v-for="(label, key) in transitionLabels"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select></label
          >
        </div>
        <p v-if="listBusy" class="list-status" role="status">
          Carregando escolas…
        </p>
        <p v-if="listError" class="message error" role="alert">
          {{ listError }}
          <button class="button" @click="loadList">Tentar novamente</button>
        </p>
        <div v-if="list" class="table-wrap schools-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Escola / Inep</th>
                <th scope="col">Classificação {{ start }}</th>
                <th scope="col">{{ start }}</th>
                <th scope="col">{{ end }}</th>
                <th scope="col">Transição</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in list.entries" :key="s.id">
                <th scope="row">
                  <button class="city-link" @click="openHistory(s.id)">
                    {{ (s.after || s.before).name }}</button
                  ><small class="school-code">{{ s.id }}</small>
                </th>
                <td>
                  {{
                    s.before ? attributes(s.before) : "Ausente na base inicial"
                  }}<small v-if="s.changed.length" class="school-change"
                    >Mudança em {{ end }}: {{ attributes(s.after)
                    }}{{
                      s.changed.includes("name")
                        ? ` · nome anterior: ${s.before.name}`
                        : ""
                    }}</small
                  ><small v-if="!s.before" class="school-change"
                    >{{ end }}: {{ attributes(s.after) }}</small
                  >
                </td>
                <td>
                  {{
                    s.before
                      ? answer(s.before.indicators[metric])
                      : "Fora da base ativa"
                  }}
                </td>
                <td>
                  {{
                    s.after
                      ? answer(s.after.indicators[metric])
                      : "Fora da base ativa"
                  }}
                </td>
                <td>{{ transitionLabels[s.transition] }}</td>
              </tr>
              <tr v-if="!list.entries.length">
                <td colspan="5">
                  Nenhuma escola para este recorte e transição.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="list" class="list-pagination">
          <span
            >{{ number(list.total) }} escolas · página
            {{ Math.floor(offset / 50) + 1 }} de
            {{ Math.max(1, Math.ceil(list.total / 50)) }}</span
          ><button class="button" :disabled="!offset" @click="offset -= 50">
            Anterior</button
          ><button
            class="button"
            :disabled="offset + 50 >= list.total"
            @click="offset += 50"
          >
            Próxima
          </button>
        </div>
      </section>
      <section
        v-if="historyId"
        class="panel below school-history"
        aria-labelledby="school-history-heading"
        :aria-busy="historyBusy"
      >
        <div class="panel-head">
          <div>
            <h2 id="school-history-heading" ref="historyHeading" tabindex="-1">
              Histórico da escola{{
                historySchool ? ` · ${historySchool.name}` : ""
              }}
            </h2>
            <p>Código Inep {{ historyId }} · {{ indicator?.label }}</p>
            <p v-if="historySchool">
              Última classificação disponível: {{ attributes(historySchool) }}
            </p>
          </div>
          <button
            class="button"
            @click="
              clearHistory();
              showSchools();
            "
          >
            Voltar à lista
          </button>
        </div>
        <p v-if="historyBusy" class="list-status" role="status">
          Consultando os anos disponíveis…
        </p>
        <p v-if="historyError" class="message error" role="alert">
          {{ historyError }}
          <button class="button" @click="openHistory(historyId)">
            Tentar novamente
          </button>
        </p>
        <ol v-if="history" class="school-history-timeline">
          <li
            v-for="row in history"
            :key="row.year"
            :class="
              row.school
                ? row.value === 1
                  ? 'answer-yes'
                  : row.value === 0
                    ? 'answer-no'
                    : 'answer-unknown'
                : 'answer-unknown'
            "
          >
            <strong>{{ row.year }}</strong>
            <div>
              <span>{{
                row.school
                  ? answer(row.value)
                  : "Ausente da base de escolas ativas nesta UF"
              }}</span
              ><small v-if="row.school"
                >{{ row.school.name }} · {{ attributes(row.school) }}</small
              >
            </div>
          </li>
        </ol>
        <p class="chart-note">
          Respostas declaradas pela escola em cada Censo. Lacunas não são
          preenchidas. Ausência da base ativa não comprova fechamento; mudanças
          de código não são vinculadas automaticamente.
        </p>
      </section>
    </template>
  </section>
</template>
