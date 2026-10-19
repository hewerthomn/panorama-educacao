<script setup>
import {ref, watch, onMounted, onBeforeUnmount} from 'vue'
import Chart from 'chart.js/auto'
const props = defineProps({series: Array})
const canvas = ref(null)
let chart
function draw() {
  if (!canvas.value) return
  if (chart) chart.destroy()
  chart = new Chart(canvas.value.getContext('2d'), {
    type:'line',
    data:{labels:props.series.map(r=>r.year), datasets:[{label:'Escolas com indicador (%)',
      data:props.series.map(r=>r.pct), borderColor:'#0f766e', backgroundColor:'#0f766e',
      tension:.25, spanGaps:false, pointRadius:4}]},
    options:{responsive:true, maintainAspectRatio:false, scales:{y:{min:0,max:100,ticks:{callback:v=>`${v}%`}}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=> ctx.parsed.y === null ? 'Sem dados' : `${ctx.parsed.y.toFixed(1)}%`}}}}
  })
}
onMounted(draw)
watch(()=>props.series,draw)
onBeforeUnmount(()=>{if(chart)chart.destroy()})
</script>
<template><div class="chart"><canvas ref="canvas"></canvas></div></template>
