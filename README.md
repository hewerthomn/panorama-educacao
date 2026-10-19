# Panorama da Educação

Uma ferramenta de código aberto para explorar e acompanhar a evolução dos indicadores de infraestrutura das escolas brasileiras ao longo dos anos.

O projeto permite visualizar dados por estado e município, comparar períodos e identificar desigualdades no acesso a recursos como água potável, internet, bibliotecas e saneamento básico.

## Inspiração

A ideia deste projeto surgiu após a keynote do professor **Fernando Masanori**, no último dia da **Python Brasil 2026**.

A apresentação serviu de inspiração para transformar dados públicos sobre a educação brasileira em informações mais acessíveis, visuais e fáceis de explorar.

## Funcionalidades

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

O processamento identifica estados já concluídos e reutiliza os arquivos do Inep que estiverem em cache.

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

Os percentuais consideram escolas em atividade com respostas válidas para cada indicador.

Por exemplo, o percentual de escolas com água potável corresponde à quantidade de escolas que declararam possuir água potável dividida pelo total de escolas com informação válida sobre esse indicador.

Dados ausentes são identificados separadamente e não são tratados como zero.

Como os questionários do Censo Escolar podem mudar ao longo dos anos, comparações históricas devem considerar possíveis alterações nas definições dos indicadores.

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
