export async function fetchJson(relative) {
  const url = `${import.meta.env.BASE_URL}${relative.replace(/^\/+/, '')}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Falha ao carregar ${relative} (HTTP ${response.status})`)
  return await response.json()
}

export function subset(data, year, rede, area, municipio) {
  return (data?.records || []).filter(row =>
    (year === null || row.year === year) &&
    (rede === 'all' || row.rede === rede) &&
    (area === 'all' || row.localizacao === area) &&
    (municipio === 'all' || row.municipio === municipio)
  )
}

export function compute(rows, metric) {
  let yes = 0, valid = 0, schools = 0, students = 0, studentSchools = 0
  for (const row of rows) {
    const counts = row.metrics?.[metric] || [0, 0]
    yes += counts[0]; valid += counts[1]
    schools += row.schools
    students += row.matriculas || 0
    studentSchools += row.matriculas_valid || 0
  }
  return {yes, valid, schools, students, studentSchools, unknown: schools - valid,
          pct: valid > 0 ? (yes / valid * 100) : null}
}

export function colorFor(value) {
  if (value === null) return '#6b7280'
  if (value < 20) return '#991b1b'
  if (value < 40) return '#dc602e'
  if (value < 60) return '#eab54f'
  if (value < 80) return '#8ac298'
  return '#267f61'
}

export function percent(value) {
  return value === null ? 'N/D' : `${value.toLocaleString('pt-BR', {maximumFractionDigits:1, minimumFractionDigits:1})}%`
}

export function exportCsv(filename, rows) {
  const columns = ['codigo_ibge','municipio','ano','indicador','escolas_com','escolas_validas','total_escolas','percentual']
  const csv = [columns.join(';'), ...rows.map(row => columns.map(key => String(row[key] ?? '').replace(/;/g, ',')).join(';'))].join('\n')
  const blob = new Blob(['\ufeff', csv], {type:'text/csv;charset=utf-8'})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  URL.revokeObjectURL(a.href)
}
