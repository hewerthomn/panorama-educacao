<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import Chart from "chart.js/auto";
import { percent } from "./data.js";
const props = defineProps({
  distribution: { type: Object, required: true },
  title: String,
  scope: String,
});
const canvas = ref(null),
  active = ref(null),
  hovering = ref(false);
let chart;
const format = (value) => new Intl.NumberFormat("pt-BR").format(value);
const hasData = computed(() => props.distribution.total.yes > 0);
const totalLabel = computed(() =>
  props.distribution.total.valid > 0
    ? format(props.distribution.total.yes)
    : "N/D",
);
const activeCategory = computed(() =>
  props.distribution.categories.find(
    (category) => category.id === active.value,
  ),
);
const emptyMessage = computed(() =>
  props.distribution.total.schools === 0
    ? "Nenhuma escola neste recorte."
    : props.distribution.total.valid === 0
      ? "Sem respostas válidas para este indicador."
      : "Nenhuma escola atende ao indicador neste recorte.",
);
function details(category) {
  return `${category.label}: ${format(category.yes)} escolas com o indicador; participação: ${percent(category.share)}; taxa de atendimento: ${percent(category.pct)} (${format(category.yes)} de ${format(category.valid)} respostas válidas).`;
}
function showCategory(category, index) {
  active.value = category.id;
  if (!chart || !hasData.value || category.yes === 0) return;
  const arc = chart.getDatasetMeta(0).data[index];
  chart.setActiveElements([{ datasetIndex: 0, index }]);
  chart.tooltip.setActiveElements(
    [{ datasetIndex: 0, index }],
    arc.getCenterPoint(),
  );
  chart.update("none");
}
function clearCategory() {
  active.value = null;
  chart?.setActiveElements([]);
  chart?.tooltip.setActiveElements([], { x: 0, y: 0 });
  chart?.update("none");
}
function draw() {
  if (!canvas.value) return;
  active.value = null;
  hovering.value = false;
  if (chart) chart.destroy();
  const categories = props.distribution.categories;
  chart = new Chart(canvas.value.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: hasData.value
        ? categories.map((c) => c.label)
        : ["Sem distribuição"],
      datasets: [
        {
          data: hasData.value ? categories.map((c) => c.yes) : [1],
          backgroundColor: hasData.value
            ? categories.map((c) => c.color)
            : ["#e1e7e9"],
          borderColor: "#ffffff",
          borderWidth: hasData.value ? 2 : 0,
          hoverOffset: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      onHover: (_event, elements) => {
        hovering.value = elements.length > 0;
      },
      cutout: "72%",
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: hasData.value,
          displayColors: false,
          backgroundColor: "#183c50",
          padding: 12,
          bodyFont: { family: "Source Sans 3", size: 13 },
          callbacks: {
            title: (items) => categories[items[0].dataIndex].label,
            label: (context) => {
              const category = categories[context.dataIndex];
              return [
                `${format(category.yes)} escolas com o indicador`,
                `Participação no total: ${percent(category.share)}`,
                `Taxa de atendimento: ${percent(category.pct)}`,
                `${format(category.valid)} respostas válidas`,
              ];
            },
          },
        },
      },
    },
  });
}
onMounted(draw);
watch(() => props.distribution, draw);
onBeforeUnmount(() => chart?.destroy());
</script>
<template>
  <div class="distribution-chart">
    <h3>{{ title }}</h3>
    <p class="distribution-scope">{{ scope }}</p>
    <div class="donut-plot" @mouseleave="hovering = false">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="`${title}. ${totalLabel} escolas com o indicador. Quantidades e participações na legenda a seguir.`"
      ></canvas>
      <div
        class="donut-total"
        v-show="!hasData || (!hovering && !activeCategory?.yes)"
        aria-hidden="true"
      >
        <strong>{{ totalLabel }}</strong
        ><span>escolas com<br />o indicador</span>
      </div>
    </div>
    <p v-if="!hasData" class="distribution-empty" role="status">
      {{ emptyMessage }}
    </p>
    <div
      class="distribution-legend"
      :aria-label="`Valores de ${title.toLowerCase()}`"
    >
      <div class="distribution-columns" aria-hidden="true">
        <span>Categoria</span><span>Escolas</span><span>Participação</span>
      </div>
      <ul>
        <li
          v-for="(category, index) in distribution.categories"
          :key="category.id"
        >
          <button
            type="button"
            :aria-label="details(category)"
            @focus="showCategory(category, index)"
            @blur="clearCategory"
            @click="showCategory(category, index)"
          >
            <span class="distribution-category"
              ><i :style="{ background: category.color }" aria-hidden="true"></i
              >{{ category.label }}</span
            ><span>{{ format(category.yes) }}</span
            ><strong>{{ percent(category.share) }}</strong>
          </button>
        </li>
      </ul>
    </div>
    <div class="distribution-detail" aria-live="polite">
      <p v-if="activeCategory">
        <strong>{{ activeCategory.label }}</strong> · Taxa de atendimento:
        {{ percent(activeCategory.pct) }}<br />{{
          format(activeCategory.yes)
        }}
        de {{ format(activeCategory.valid) }} respostas válidas<span
          v-if="activeCategory.unknown"
        >
          · {{ format(activeCategory.unknown) }} sem resposta válida</span
        ><span v-if="!activeCategory.schools"> · Sem registros</span>.
      </p>
      <p v-else>
        Participação entre as escolas com o indicador. Selecione uma categoria
        para consultar sua taxa de atendimento.
      </p>
    </div>
  </div>
</template>
