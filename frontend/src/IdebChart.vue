<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import Chart from "chart.js/auto";
import { score, scoreDelta, comparison } from "./ideb.js";
const props = defineProps({ series: Array, year: Number, title: String });
const canvas = ref(null);
let chart;
function draw() {
  if (!canvas.value) return;
  chart?.destroy();
  const accent = getComputedStyle(canvas.value)
    .getPropertyValue("--accent")
    .trim();
  chart = new Chart(canvas.value, {
    type: "line",
    data: {
      labels: props.series.map((r) => r.year),
      datasets: [
        {
          label: "Ideb",
          data: props.series.map((r) => r.ideb),
          borderColor: accent,
          backgroundColor: accent,
          tension: 0,
          spanGaps: false,
          pointRadius: props.series.map((r) => (r.year === props.year ? 6 : 4)),
          pointHitRadius: 22,
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
          max: 10,
          title: { display: true, text: "Ideb · nota de 0 a 10" },
        },
        x: { title: { display: true, text: "Edição do Ideb" } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Ideb: ${score(ctx.parsed.y)}`,
            afterLabel: (ctx) => {
              const c = comparison(
                props.series,
                props.series[ctx.dataIndex].year,
              );
              return c.previous
                ? `${scoreDelta(c.delta)} desde ${c.previous.year}`
                : "Sem edição anterior disponível";
            },
          },
        },
      },
    },
  });
}
onMounted(draw);
watch(() => [props.series, props.year], draw);
onBeforeUnmount(() => chart?.destroy());
</script>
<template>
  <div class="chart">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="`${title}. Ideb de zero a dez. Valores e ausências na tabela de edições abaixo.`"
    ></canvas>
  </div>
</template>
