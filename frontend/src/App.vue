<script setup>
import {ref, computed, watch, onMounted} from 'vue'
import MapPanel from './MapPanel.vue'
import TrendChart from './TrendChart.vue'
import {fetchJson, subset, compute, percent, colorFor, exportCsv} from './data.js'

const stateOptions = ref([])
const uf = ref('RO')
const manifest = ref(null)
const geo = ref(null)
const year = ref(null)
const metric = ref('agua_potavel')
const city = ref('all')
const rede = ref('all')
const area = ref('all')
const loading = ref(false)
const error = ref('')
const schools = ref([])
const schoolsBusy = ref(false)
let loadId = 0
let schoolLoadId = 0

onMounted(async () => {
  try {
    const index = await fetchJson('data/index.json')
    stateOptions.value = index.states || []
    if (stateOptions.value.length) {
      const preferred = new URLSearchParams(location.search).get('uf')?.toUpperCase()
      uf.value = stateOptions.value.some(r => r.uf === preferred) ? preferred :
                 stateOptions.value.some(r => r.uf === 'RO') ? 'RO' : stateOptions.value[0].uf
      await loadUf()
    }
  } catch(e) { error.value = e.message }
})

async function loadUf() {
  const thisLoad = ++loadId
  loading.value = true; error.value = ''; manifest.value = null; geo.value = null
  city.value = 'all'; schools.value = []
  try {
    const info = await fetchJson(`data/${uf.value}/manifest.json`)
    let shapes = null
    if (info.map_available) shapes = await fetchJson(`data/${uf.value}/municipios.geojson`)
    if (loadId !== thisLoad) return
    manifest.value = info; geo.value = shapes
    year.value = Math.max(...info.years)
    const metrics = info.indicators.filter(i => i.available_years.length > 0)
    metric.value = metrics.some(i => i.key === 'agua_potavel') ? 'agua_potavel' : metrics[0]?.key || ''
    const search = new URL(location.href)
    search.searchParams.set('uf', uf.value)
    history.replaceState({}, '', search)
  } catch(e) {if(loadId === thisLoad) error.value = e.message}
  finally {if(loadId === thisLoad) loading.value = false}
}
const municipalities = computed(() => manifest.value?.municipalities || [])
const indicators = computed(() => manifest.value?.indicators || [])
const selectedIndicator = computed(() => indicators.value.find(i=>i.key === metric.value))
const selectedCity = computed(() => municipalities.value.find(m=>m.id === city.value))
const rows = computed(() => subset(manifest.value, year.value, rede.value, area.value, city.value))
const current = computed(() => compute(rows.value, metric.value))
const missingYear = computed(() => selectedIndicator.value && !selectedIndicator.value.available_years.includes(year.value))
const byMunicipality = computed(() => {
  const result = {}
  for (const municipality of municipalities.value) {
    result[municipality.id] = compute(subset(manifest.value, year.value, rede.value, area.value, municipality.id), metric.value)
  }
  return result
})
const trend = computed(() => (manifest.value?.years || []).map(y => ({
  year:y, ...compute(subset(manifest.value, y, rede.value, area.value, city.value), metric.value),
})))
const ranking = computed(() => municipalities.value.map(m => ({...m, ...byMunicipality.value[m.id]}))
  .filter(m => m.pct !== null && m.valid > 0)
  .sort((a,b)=>b.pct-a.pct || a.name.localeCompare(b.name, 'pt-BR')))
const yearReady = computed(() => manifest.value && current.value.schools > 0)

watch([city,year,uf], async () => {
  const id = ++schoolLoadId
  schools.value = []
  if (!manifest.value?.schools_available || city.value === 'all' || year.value === null) return
  schoolsBusy.value = true
  try {
    const result = await fetchJson(`data/${uf.value}/schools/${year.value}.json`)
    if (id === schoolLoadId) schools.value = result.schools.filter(s=>s.municipio === city.value)
  } catch(e) {if (id === schoolLoadId) error.value = e.message}
  finally {if(id===schoolLoadId) schoolsBusy.value = false}
})

function selectCity(code) {city.value = city.value === code ? 'all' : code}
function csvDownload() {
  const names = Object.fromEntries(municipalities.value.map(m => [m.id, m.name]))
  const data = municipalities.value.filter(m=>city.value === 'all' || city.value === m.id)
    .map(m => {
      const s = byMunicipality.value[m.id]
      return {codigo_ibge:m.id,municipio:names[m.id],ano:year.value,indicador:metric.value,
        escolas_com:s.yes,escolas_validas:s.valid,total_escolas:s.schools,percentual:s.pct===null?'':s.pct.toFixed(2).replace('.',',')}
    })
  exportCsv(`educacao_${uf.value}_${year.value}_${metric.value}.csv`,data)
}
function schoolAnswer(value) {return value === 1 ? 'Sim' : value === 0 ? 'Não' : 'N/D'}
function withSeparators(v) {return new Intl.NumberFormat('pt-BR').format(v)}
</script>

<template>
<div class="layout">
  <aside class="sidebar">
    <div class="brand"><div class="brand-icon">▦</div><div><strong>Panorama da Educação</strong><small>Brasil · Indicadores públicos</small></div></div>
    <div class="sidebar-title">EXPLORAR</div>
    <div class="nav active">◈ &nbsp; Visão geral</div>
    <div class="nav">◫ &nbsp; Censo Escolar</div>
    <div class="sidebar-note">
      <strong>Fontes oficiais</strong>
      <p>Microdados do Censo Escolar (Inep) e malhas territoriais (IBGE).</p>
      <a href="https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar" target="_blank" rel="noopener">Consultar fonte ↗</a>
    </div>
    <div class="sidebar-footer">Versão 0.1 · sem backend</div>
  </aside>

  <main class="content">
    <header class="topbar"><span>Painel de indicadores <b>/ Panorama estadual</b></span><span class="static-pill">● Dados pré-processados</span></header>
    <section class="intro"><div><p class="eyebrow">ANÁLISE TERRITORIAL DA EDUCAÇÃO</p><h1>{{manifest?.state_name || 'Panorama da Educação'}}</h1><p>Acompanhe infraestrutura das escolas por município, rede, localização e ano.</p></div><button class="export" @click="csvDownload" :disabled="!manifest">↓ Exportar CSV</button></section>
    <p v-if="loading" class="message">Carregando os indicadores...</p>
    <p v-if="error" class="message error" role="alert">{{error}}</p>
    <div v-if="!loading && !stateOptions.length" class="message">Nenhum estado foi processado ainda. Execute o gerador Python conforme o README para criar os arquivos em <code>frontend/public/data/</code>.</div>
    <template v-if="manifest">
      <section class="filters">
        <label>Estado<select v-model="uf" @change="loadUf"><option v-for="s in stateOptions" :key="s.uf" :value="s.uf">{{s.name}} ({{s.uf}})</option></select></label>
        <label>Ano<select v-model.number="year"><option v-for="y in manifest.years" :key="y" :value="y">{{y}}</option></select></label>
        <label>Indicador<select v-model="metric"><option v-for="i in indicators" :key="i.key" :value="i.key">{{i.label}}</option></select></label>
        <label>Município<select v-model="city"><option value="all">Todos os municípios</option><option v-for="m in municipalities" :key="m.id" :value="m.id">{{m.name}}</option></select></label>
        <label>Rede<select v-model="rede"><option value="all">Todas as redes</option><option value="1">Federal</option><option value="2">Estadual</option><option value="3">Municipal</option><option value="4">Privada</option></select></label>
        <label>Localização<select v-model="area"><option value="all">Urbana e rural</option><option value="1">Urbana</option><option value="2">Rural</option></select></label>
      </section>
      <div v-if="missingYear" class="message warning">O campo <strong>{{selectedIndicator?.field}}</strong> não foi encontrado nos microdados de {{year}}. Não é possível calcular esse indicador para esse ano.</div>
      <section class="kpis">
        <div class="kpi"><span>Escolas ativas</span><strong>{{withSeparators(current.schools)}}</strong><small>Segundo o filtro aplicado</small></div>
        <div class="kpi"><span>Com {{selectedIndicator?.label.toLowerCase()}}</span><strong>{{current.valid ? withSeparators(current.yes) : 'N/D'}}</strong><small>{{withSeparators(current.valid)}} respostas válidas</small></div>
        <div class="kpi"><span>Cobertura do indicador</span><strong>{{percent(current.pct)}}</strong><small>Escolas com resposta válida</small></div>
        <div class="kpi"><span>Sem resposta válida</span><strong>{{withSeparators(current.unknown)}}</strong><small>Não equivale a resposta “não”</small></div>
      </section>
      <section class="visual-grid">
        <div class="panel map-panel">
          <div class="panel-head"><div><h2>Distribuição territorial</h2><p>Percentual de escolas por município · {{year}}</p></div><span class="tag">Mapa coroplético</span></div>
          <MapPanel v-if="geo" :geo="geo" :stats="byMunicipality" :selected="city" @select="selectCity"/>
          <div v-else class="map-missing">Mapa municipal indisponível. Gere os dados sem <code>--no-geojson</code> para visualizá-lo.</div>
          <div class="legend"><span v-for="(c,i) in ['#991b1b','#dc602e','#eab54f','#8ac298','#267f61','#6b7280']" :key="i"><i :style="{'background':c}"></i>{{['0–20%','20–40%','40–60%','60–80%','80–100%','N/D'][i]}}</span></div>
        </div>
        <div class="panel trends"><div class="panel-head"><div><h2>Evolução histórica</h2><p>{{ selectedCity?.name || manifest.state_name }} · {{selectedIndicator?.label}}</p></div></div>
          <TrendChart :series="trend"/>
          <div class="trend-table"><div v-for="point in trend" :key="point.year"><span>{{point.year}}</span><strong>{{percent(point.pct)}}</strong><small>({{point.yes}}/{{point.valid}})</small></div></div>
        </div>
      </section>
      <section class="panel below"><div class="panel-head"><div><h2>Municípios em destaque</h2><p>Ordenação pelo percentual do indicador, apenas com respostas válidas.</p></div><small>{{ranking.length}} com dados</small></div>
        <div class="table-wrap"><table><thead><tr><th>Município</th><th>Escolas c/ indicador</th><th>Respostas válidas</th><th>Percentual</th></tr></thead><tbody><tr v-for="m in ranking.slice(0,15)" :key="m.id" @click="selectCity(m.id)" :class="{chosen:city===m.id}"><td>{{m.name}}</td><td>{{m.yes}}</td><td>{{m.valid}}</td><td><span class="bar"><i :style="{width:m.pct+'%',background:colorFor(m.pct)}"></i></span>{{percent(m.pct)}}</td></tr><tr v-if="!ranking.length"><td colspan="4">Não há respostas válidas para este recorte.</td></tr></tbody></table></div>
      </section>
      <section v-if="city!=='all' && manifest.schools_available" class="panel below"><div class="panel-head"><div><h2>Escolas de {{selectedCity?.name || city}}</h2><p>Detalhes das escolas ativas · {{year}} · indicador selecionado</p></div><small>{{schoolsBusy ? 'Carregando...' : `${schools.length} escolas`}}</small></div>
        <div class="table-wrap schools-table"><table><thead><tr><th>Escola</th><th>Código Inep</th><th>Rede</th><th>Área</th><th>Indicador</th></tr></thead><tbody><tr v-for="s in schools" :key="s.id"><td>{{s.name}}</td><td>{{s.id}}</td><td>{{({'1':'Federal','2':'Estadual','3':'Municipal','4':'Privada'})[s.rede] || 'N/D'}}</td><td>{{({'1':'Urbana','2':'Rural'})[s.localizacao] || 'N/D'}}</td><td>{{schoolAnswer(s.indicators[metric])}}</td></tr></tbody></table></div>
      </section>
      <footer><span>Fonte: Censo Escolar — Inep · Cartografia: IBGE</span><span>Dados gerados: {{new Date(manifest.generated_at).toLocaleDateString('pt-BR')}}</span><p>Proporções calculadas sobre escolas com respostas 0 ou 1, sem ponderação por matrícula. Comparações entre anos exigem verificar as alterações dos dicionários oficiais.</p></footer>
    </template>
  </main>
</div>
</template>
