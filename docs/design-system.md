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
                | Rede / série histórica / localização
                | Ranking municipal
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

## Distribuições do indicador

O bloco Evolução histórica reúne distribuição por rede, série anual e distribuição
por localização, nessa ordem. A série ocupa uma largura maior. Em áreas com menos
de 720 px disponíveis, as visualizações se empilham; o ranking aparece depois.

Os donuts usam `distributionFor`, em `frontend/src/distribution.js`, sobre os
agregados existentes. A participação divide escolas com resposta 1 na categoria
pelo total de escolas com resposta 1 no recorte. A taxa de atendimento divide
respostas 1 pelas respostas 0 ou 1 dentro da categoria. As duas medidas aparecem
com nomes distintos nos tooltips; a legenda mostra quantidade e participação.

Cada donut ignora apenas o filtro da própria dimensão: rede mantém localização;
localização mantém rede. Ambos mantêm UF, município, ano e indicador. Os subtítulos
explicitam a exceção quando o filtro está ativo. Sem filtro na própria dimensão,
o total central corresponde às escolas atendidas no resumo principal.

Categorias sem classificação entram no total e aparecem em cinza, sem perder
participações. Ausência de respostas válidas exibe N/D. Zero válido exibe 0 com
anel neutro, pois não há distribuição de escolas atendidas. As cores categóricas
são independentes da escala contínua do mapa e ficam fixas entre anos.

As legendas podem ser operadas por teclado ou toque para consultar a taxa e os
denominadores; o canvas também oferece tooltips. A animação de entrada dos donuts
está desativada para manter a leitura durante a reprodução temporal.
