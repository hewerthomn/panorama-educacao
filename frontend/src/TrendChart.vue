<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import Chart from "chart.js/auto";
const props = defineProps({ series: Array, year: Number });
const canvas = ref(null);
let chart;
function draw() {
  if (!canvas.value) return;
  if (chart) chart.destroy();
  chart = new Chart(canvas.value.getContext("2d"), {
    type: "line",
    data: {
      labels: props.series.map((r) => r.year),
      datasets: [
        {
          label: "Escolas com indicador (%)",
          data: props.series.map((r) => r.pct),
          borderColor: "#176b68",
          backgroundColor: "#176b68",
          tension: 0,
          spanGaps: false,
          pointRadius: props.series.map((r) => (r.year === props.year ? 6 : 3)),
          pointHoverRadius: 7,
          pointHitRadius: 20,
          borderWidth: 2,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, color: "#52636c", callback: (v) => `${v}%` },
          grid: { color: "#e5ebed" },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ctx.parsed.y === null
                ? "Sem dados"
                : `${ctx.parsed.y.toFixed(1)}%`,
          },
        },
      },
    },
  });
}
onMounted(draw);
watch(() => [props.series, props.year], draw);
onBeforeUnmount(() => {
  if (chart) chart.destroy();
});
</script>
<template>
  <div class="chart">
    <canvas
      ref="canvas"
      role="img"
      aria-label="Evolução anual da cobertura, de zero a cem por cento. Valores disponíveis na tabela Consultar valores por ano."
    ></canvas>
  </div>
</template>
