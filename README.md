# Panorama da Educação

Uma ferramenta de código aberto para explorar e acompanhar a evolução dos indicadores de infraestrutura das escolas brasileiras ao longo dos anos.

O projeto permite visualizar dados por estado e município, comparar períodos e identificar desigualdades no acesso a recursos como água potável, internet, bibliotecas e saneamento básico.

## Inspiração

A ideia deste projeto surgiu após a keynote do professor **Fernando Masanori**, no último dia da **Python Brasil 2026**.

A apresentação serviu de inspiração para transformar dados públicos sobre a educação brasileira em informações mais acessíveis, visuais e fáceis de explorar.

## Funcionalidades

- Alternância entre escolas com infraestrutura e matrículas em escolas sem o recurso.
- Mapa interativo com indicadores por município.
- Filtros por estado, município, ano, rede de ensino e localização.
- Evolução histórica dos indicadores.
- Animação temporal para visualizar mudanças no mapa.
- Distribuição dos indicadores por rede de ensino e localização urbana/rural.
- Comparação e ranking de municípios.
- Consulta de dados por escola.
- Exportação de dados em CSV.

## Tecnologias

- **Python:** download, tratamento e processamento dos dados.
- **Vue 3 + Vite:** interface interativa.
- **Leaflet:** mapas geográficos.
- **Chart.js:** gráficos e visualizações estatísticas.

Os dados são processados em arquivos JSON e GeoJSON, consumidos diretamente pela aplicação web, sem necessidade de uma API ou banco de dados.

## Fontes de dados

Os dados são obtidos de fontes públicas oficiais:

- [INEP — Censo Escolar](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar)
- [IBGE — Dados geográficos e municípios](https://servicodados.ibge.gov.br/)

A versão atual utiliza dados do Censo Escolar e do IBGE, com suporte inicial aos anos de 2020 a 2025 e possibilidade de ampliar a série histórica.

## Executando o projeto

**1. Preparar o ambiente Python**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

**2. Gerar os dados de um estado**

```bash
python -m edu_panorama generate --uf RO --years 2020:2025
```

É possível substituir `RO` pela sigla de qualquer estado brasileiro.

**3. Processar todos os estados**

```bash
python -m edu_panorama generate --all --years 2020:2025
```

O processamento reutiliza os ZIPs do Inep em cache e só pula estados com saídas completas
no esquema atual. Manifestos antigos são identificados pelo `status` e regenerados,
incluindo todos os indicadores na mesma execução. Para regenerar usando somente ZIPs locais:

```bash
python -m edu_panorama generate --all --years 2020:2025 --no-download
```

Para uma UF, use `generate --uf RO --years 2020:2025 --no-download`.
Para refazer também estados já atualizados, acrescente `--force` ao comando com `--all`.
O cache dos ZIPs em `data/raw/` não deve ser incluído no Git.

Para verificar quais estados já foram processados:

```bash
python -m edu_panorama status --years 2020:2025
```

**4. Executar a interface**

```bash
cd frontend
npm install
npm run dev
```

Acesse o endereço local informado pelo Vite.

## Como os indicadores são calculados

Somente escolas em atividade compõem as duas perspectivas. Cada escola é contada uma
vez por ano, município, rede e localização, usando os mesmos filtros.

- **Escolas:** escolas que declararam possuir o recurso (`1`) / escolas com resposta
  válida (`0` ou `1`) × 100. O mapa vai do vermelho (menor presença) ao verde (maior presença).
- **Matrículas:** matrículas conhecidas em escolas que declararam não possuir o recurso
  (`0`) / matrículas conhecidas em escolas com resposta válida (`0` ou `1`) × 100.
  O mapa vai do verde (menor ausência) ao vermelho (maior ausência).

As escalas são fixas de 0% a 100%; denominador zero é **N/D**, em cinza no mapa.
O número absoluto conhecido é mostrado separadamente, mesmo com percentual N/D.
Respostas ausentes não significam ausência do recurso. Matrículas desconhecidas não
são consideradas zero nem entram no denominador: a interface informa o número de
escolas sem esse total, cuja quantidade de matrículas é desconhecida. Também mostra
as matrículas conhecidas em escolas sem resposta válida ao indicador.

Os donuts em Matrículas mostram a participação no total de matrículas em escolas
sem o recurso; o tooltip informa a taxa dentro da categoria. Todos os filtros são
aplicados nesse modo. Em Escolas, cada donut mantém a comparação entre categorias
da própria dimensão, conforme indicado no gráfico. Os cálculos somam contagens,
nunca médias de percentuais municipais.

A série anual apresenta percentual e total de matrículas (eixo direito). A comparação
em pontos percentuais usa o ano anterior disponível, somente quando ambos têm
percentual válido e cobertura completa de matrículas e respostas ao indicador no
recorte. Cobertura parcial continua visível, sem comparação automática em p.p.

Usamos `QT_MAT_BAS`: no arquivo de escolas de 2020–2024 e na tabela pública agregada
por escola `Tabela_Matricula` de 2025, vinculada por `CO_ENTIDADE`. Não são utilizados
dados individuais de estudantes. Se o campo ou a tabela não estiver disponível, as
matrículas permanecem desconhecidas. Campos de infraestrutura removidos/ausentes
não são substituídos por aproximações. O Censo descreve a **condição declarada da
unidade escolar**, sem demonstrar que cada estudante ficou diretamente sem acesso
ao serviço. Matrículas tampouco equivalem necessariamente a pessoas únicas.
Comparações históricas também dependem da estabilidade das definições do Censo.

O JSON usa o **esquema 2**, preservando os campos existentes. Os novos agregados
ficam em `infrastructure[indicador]`, na ordem de `infrastructure_fields` do manifesto.
Uma classe com escolas, mas sem matrículas conhecidas, recebe `null`; uma classe sem
escolas recebe zero. `matriculas_valid` continua contando escolas com matrícula informada.

## Testes do processamento e dos indicadores

```bash
pip install -e '.[test]'
python -m pytest -q
cd frontend
npm test
npm run build
```

Fixtures pequenas cobrem respostas 0/1/nulas, matrículas ausentes, denominador zero,
agregações, duplicidades, as 27 UFs, o layout separado de 2025 e a detecção de
manifestos antigos. Os testes de navegador também verificam a alternância de
perspectiva, os filtros, os dados dos gráficos, as cores do mapa e a reprodução temporal.

## Testes dos filtros pesquisáveis

O Playwright é uma dependência apenas de desenvolvimento:

```bash
cd frontend
npm install
npx playwright install chromium webkit
npm test
npm run test:e2e
```

A suíte cobre mouse e teclado no Chromium desktop, toque no Chromium com perfil
Android e toque no WebKit com perfil iPhone. Verifica busca, seleção, saída de foco
antes de `pointerup`, rolagem, cancelamento, emissão única e atualização dos três
filtros no dashboard. Traces de falhas ficam no diretório temporário do sistema.

Os perfis móveis não substituem a conferência em aparelhos físicos nem reproduzem
o teclado virtual do sistema operacional.

## Contribuindo

O Panorama da Educação é open source e recebe contribuições para novos indicadores,
processamento de dados, mapas e gráficos, correções, acessibilidade e documentação.

- [Guia de contribuição](CONTRIBUTING.md)
- [Reportar problema ou sugerir melhoria](https://github.com/hewerthomn/panorama-educacao/issues/new)

## Objetivo

Facilitar o acesso e a interpretação de dados públicos sobre a educação brasileira, permitindo acompanhar avanços, identificar desigualdades e apoiar análises baseadas em evidências.

O projeto é aberto à colaboração e à inclusão de novas fontes de dados e indicadores.
