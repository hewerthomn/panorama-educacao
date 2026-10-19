<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import L from "leaflet";
import {
  colorFor,
  percent,
  mapScale,
  gradientFor,
  noDataColor,
} from "./data.js";
const props = defineProps({ geo: Object, stats: Object, selected: String, mode: String });
const emit = defineEmits(["select"]);
const mapEl = ref(null);
const basemap = ref(true);
let map, layer, tiles, observer, lastGeo;
function fitTerritory() {
  const bounds = layer?.getBounds();
  if (bounds?.isValid())
    map.fitBounds(bounds, { padding: [28, 28], animate: false });
}
function update() {
  if (!map || !props.geo) return;
  if (layer) layer.remove();
  layer = L.geoJSON(props.geo, {
    style: (f) => {
      const id = String(f.properties?.id ?? f.id);
      const active = props.selected === id;
      return {
        color: active ? "#183c50" : "#fff",
        weight: active ? 3 : 1,
        fillColor: colorFor(props.stats?.[id]?.pct ?? null, props.mode),
        fillOpacity: 0.88,
      };
    },
    onEachFeature: (f, poly) => {
      const id = String(f.properties?.id ?? f.id),
        stat = props.stats?.[id];
      const name = f.properties?.name || id;
      const format = (value) => value == null ? "N/D" : value.toLocaleString("pt-BR");
      poly.bindTooltip(
        `<strong>${escapeHtml(name)}</strong><br>${percent(stat?.pct ?? null)}<br>${format(stat?.yes)} de ${format(stat?.valid)} ${props.mode === 'enrollments' ? 'matrículas em escolas sem o recurso / matrículas válidas' : 'escolas com resposta válida'}`,
      );
      poly.on("click", () => emit("select", id));
      poly.on("mouseover", () =>
        poly.setStyle({ weight: 3, color: "#183c50" }),
      );
      poly.on("mouseout", () => layer?.resetStyle(poly));
    },
  }).addTo(map);
  if (lastGeo !== props.geo) {
    fitTerritory();
    lastGeo = props.geo;
  }
}
function toggleBasemap() {
  basemap.value = !basemap.value;
  basemap.value ? tiles.addTo(map) : tiles.remove();
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (v) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        v
      ],
  );
}
onMounted(() => {
  map = L.map(mapEl.value, {
    zoomControl: false,
    zoomSnap: 0.25,
    scrollWheelZoom: false,
    preferCanvas: true,
  });
  L.control
    .zoom({
      position: "topright",
      zoomInTitle: "Aproximar",
      zoomOutTitle: "Afastar",
    })
    .addTo(map);
  tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);
  update();
  observer = new ResizeObserver(() => {
    map.invalidateSize();
    fitTerritory();
  });
  observer.observe(mapEl.value);
});
watch(() => [props.geo, props.stats, props.selected, props.mode], update);
onBeforeUnmount(() => {
  observer?.disconnect();
  map?.remove();
});
</script>
<template>
  <div class="map-stage">
    <div
      ref="mapEl"
      class="map"
      role="region"
      aria-label="Mapa dos municípios. Use os filtros ou o ranking para selecionar um município por teclado."
    ></div>
    <div class="map-tools">
      <button class="button" @click="fitTerritory">Enquadrar estado</button
      ><button class="button" @click="toggleBasemap" :aria-pressed="basemap">
        Mapa de fundo
      </button>
    </div>
    <div
      class="map-legend"
      :aria-label="mode === 'enrollments' ? 'Legenda: percentual de matrículas em escolas sem o recurso' : 'Legenda: percentual de escolas com o indicador'"
    >
      <strong>{{ mode === 'enrollments' ? 'Matrículas em escolas sem o recurso' : 'Escolas com o indicador' }}</strong>
      <div
        class="legend-ramp"
        :style="{ background: gradientFor(mode) }"
        aria-hidden="true"
      ></div>
      <div class="legend-values">
        <span v-for="c in mapScale" :key="c.value">{{ c.label }}</span>
      </div>
      <div class="legend-caption">
        <span
          ><i class="no-data-swatch" :style="{ background: noDataColor }"></i>
          N/D · sem dados válidos</span
        ><span>Escala fixa · %</span>
      </div>
    </div>
    <p class="map-instruction">Selecione um município para detalhar</p>
  </div>
</template>
