<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import Chart from "chart.js/auto";
import { transitions } from "./longitudinal.js";
const props = defineProps({ totals: Object });
const canvas = ref(null);
let chart;
function draw() {
  chart?.destroy();
  const style = getComputedStyle(canvas.value);
  chart = new Chart(canvas.value, {
    type: "bar",
    data: {
      labels: transitions.map((t) => t.label),
      datasets: [
        {
          label: "Escolas",
          data: transitions.map((t) => props.totals[t.key]),
          backgroundColor: transitions.map((t) =>
            style.getPropertyValue(t.color).trim(),
          ),
        },
      ],
    },
    options: {
      indexAxis: "y",
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.parsed.x.toLocaleString("pt-BR")} escolas · ${props.totals.comparable ? ((ctx.parsed.x / props.totals.comparable) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0"}% das comparáveis`,
          },
        },
      },
    },
  });
}
onMounted(draw);
watch(() => props.totals, draw);
onBeforeUnmount(() => chart?.destroy());
</script>
<template>
  <div class="chart transition-chart">
    <canvas
      ref="canvas"
      role="img"
      aria-label="Transições de infraestrutura das mesmas escolas. Quantidades e taxas na faixa de indicadores acima."
    />
  </div>
</template>
