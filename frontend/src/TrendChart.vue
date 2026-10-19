<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import Chart from "chart.js/auto";
const props = defineProps({ series: Array, year: Number, mode: String });
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
          label: props.mode === "enrollments" ? "Matrículas em escolas sem o recurso (%)" : "Escolas com indicador (%)",
          data: props.series.map((r) => r.pct),
          yAxisID: "y",
          borderColor: "#176b68",
          backgroundColor: "#176b68",
          tension: 0,
          spanGaps: false,
          pointRadius: props.series.map((r) => (r.year === props.year ? 6 : 3)),
          pointHoverRadius: 7,
          pointHitRadius: 20,
          borderWidth: 2,
        },
        ...(props.mode === "enrollments" ? [{
          label: "Matrículas em escolas sem o recurso (total)",
          data: props.series.map((r) => r.yes),
          yAxisID: "total",
          borderColor: "#b57d36",
          backgroundColor: "#b57d36",
          borderDash: [4, 4],
          borderWidth: 2,
          tension: 0,
          spanGaps: false,
          pointRadius: props.series.map((r) => r.year === props.year ? 5 : 2),
        }] : []),
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        ...(props.mode === "enrollments" ? { total: {
          position: "right",
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: "#725111", callback: (v) => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(v) },
          title: { display: true, text: "Matrículas" },
        } } : {}),
        y: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, color: "#52636c", callback: (v) => `${v}%` },
          grid: { color: "#e5ebed" },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: props.mode === "enrollments", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ctx.parsed.y === null
                ? "Sem dados"
                : ctx.dataset.yAxisID === "total"
                  ? `${ctx.parsed.y.toLocaleString("pt-BR")} matrículas`
                  : `${ctx.parsed.y.toFixed(1)}%`,
          },
        },
      },
    },
  });
}
onMounted(draw);
watch(() => [props.series, props.year, props.mode], draw);
onBeforeUnmount(() => {
  if (chart) chart.destroy();
});
</script>
<template>
  <div class="chart">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="mode === 'enrollments' ? 'Evolução anual das matrículas em escolas sem o recurso: percentual de zero a cem e quantidade absoluta no eixo direito. Valores na tabela Consultar valores por ano.' : 'Evolução anual da cobertura, de zero a cem por cento. Valores disponíveis na tabela Consultar valores por ano.'"
    ></canvas>
  </div>
</template>
