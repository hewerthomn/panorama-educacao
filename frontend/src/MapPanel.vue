<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import {colorFor, percent} from './data.js'
const props = defineProps({geo: Object, stats: Object, selected: String})
const emit = defineEmits(['select'])
const mapEl = ref(null)
let map, layer

function update() {
  if (!map || !props.geo) return
  if (layer) layer.remove()
  layer = L.geoJSON(props.geo, {
    style: f => {
      const id = f.properties?.id
      const stat = props.stats?.[id]
      const active = props.selected === id
      return {color: active ? '#122c50' : '#ffffff', weight: active ? 3 : 1,
              fillColor: colorFor(stat?.pct ?? null), fillOpacity: .79}
    },
    onEachFeature: (f, poly) => {
      const id = f.properties?.id, stat = props.stats?.[id]
      const name = f.properties?.name || id
      poly.bindTooltip(`<strong>${escapeHtml(name)}</strong><br>${percent(stat?.pct ?? null)}<br>${stat?.yes ?? 0} de ${stat?.valid ?? 0} escolas com resposta válida`)
      poly.on('click', () => emit('select', id))
      poly.on('mouseover', () => poly.setStyle({weight:3, color:'#20375d'}))
      poly.on('mouseout', () => layer?.resetStyle(poly))
    },
  }).addTo(map)
  if (!map._initialBoundsFit) {
    const bounds = layer.getBounds()
    if (bounds.isValid()) { map.fitBounds(bounds, {padding:[16,16]}); map._initialBoundsFit = true }
  }
}
function escapeHtml(s) {return String(s).replace(/[&<>"']/g, v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]))}
onMounted(() => {
  map = L.map(mapEl.value, {zoomControl:true, scrollWheelZoom:false, preferCanvas:true})
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map)
  update()
})
watch(() => [props.geo, props.stats, props.selected], update, {deep:false})
onBeforeUnmount(() => {if(map) map.remove()})
</script>
<template><div ref="mapEl" class="map"></div></template>
