# Panorama da Educação: interface do observatório

A composição privilegia a análise territorial: cabeçalho compacto, filtros laterais,
faixa de indicadores, mapa com legenda e controle temporal, série histórica e ranking.
A navegação decorativa da versão anterior foi substituída pelos filtros reais.

```text
Cabeçalho: identidade                                      Exportar CSV
Filtros (280 px) | Território / indicador / ano
                | Faixa de indicadores
                | Mapa municipal + controles + legenda
                | Reprodução e seleção de ano
                | Série histórica       | Ranking municipal
```

## Tokens

Os tokens ficam em `frontend/src/style.css`, no seletor `:root`.

| Papel                   | Token       | Valor     |
| ----------------------- | ----------- | --------- |
| Identidade e títulos    | `--ink`     | `#183c50` |
| Texto                   | `--text`    | `#233d49` |
| Texto secundário        | `--muted`   | `#52636c` |
| Ações e série histórica | `--accent`  | `#176b68` |
| Superfície              | `--surface` | `#ffffff` |
| Fundo                   | `--canvas`  | `#eef2f3` |
| Separadores             | `--line`    | `#d6dfe2` |
| Superfície secundária   | `--soft`    | `#f5f8f8` |

Source Sans 3 é hospedada localmente e tem fallback para a fonte do sistema. Títulos usam peso 650;
valores usam numerais tabulares. Escala de espaçamento: 4, 8, 12, 16, 24 e 32 px.
Raio padrão de 4 px. Sem sombras ou gradientes decorativos; o gradiente da
legenda representa exclusivamente os valores da escala.

## Componentes e interações

- `.button`: ações secundárias, com borda e foco visível.
- `.kpis` / `.kpi`: uma faixa estatística, com divisores entre valores.
- `.panel` / `.panel-head`: seções de análise com título e contexto.
- `MapPanel`: mapa Leaflet, legenda compartilhada, enquadramento e mapa de fundo.
- `TrendChart`: série de 0 a 100%, sem interpolar lacunas, destacando o ano atual.
- Tabela histórica expansível como alternativa textual ao gráfico.
- Slider usa índices dos anos disponíveis, inclusive para séries com lacunas.
- Reprodução é iniciada explicitamente, pausa no último ano, ao alterar o recorte,
  ao ocultar a página e com Escape dentro do controle temporal.

A coroplética interpola continuamente entre vermelho (0%), laranja (25%), âmbar
(50%), oliva (75%) e verde (100%), com âncoras fixas entre anos. A escala e a legenda
compartilham `mapScale`, em `data.js`. Zero válido usa vermelho; N/D usa cinza
separado e rótulo explícito. Os cálculos continuam considerando apenas respostas
0 ou 1 no denominador, sem ponderação por matrícula.

## Adaptação e acessibilidade

Em telas intermediárias a lateral reduz para 260 px; os indicadores passam
para duas colunas e os painéis inferiores se empilham. Até 700 px, os filtros
viram um drawer modal acionado por Filtros, com contenção de foco, fechamento
com Escape e retorno ao acionador. No desktop, a lateral pode ser recolhida. Tabelas têm rolagem própria para preservar o conteúdo.

Os comboboxes oferecem pesquisa sem acentos, setas e Enter para seleção, Escape
para fechar, estado vazio e limpeza do município.

Há link para pular à análise, rótulos de formulário, foco com contraste, botões
no ranking, comboboxes pesquisáveis para estado, município e indicador, selects nativos
para os demais filtros e slider, e tabela com valores do
gráfico. A seleção municipal também pode ser feita pelo filtro, sem depender
de apontar polígonos no mapa. Animações do gráfico estão desativadas.

Vue, Vite, Leaflet e Chart.js são preservados. Não há dependências de UI novas,
backend ou mudanças nos contratos JSON/GeoJSON. URLs de dados continuam usando
`import.meta.env.BASE_URL` para publicação em subdiretórios do GitHub Pages.
