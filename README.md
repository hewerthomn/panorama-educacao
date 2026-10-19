# Panorama da Educação — ETL Python + Vue/Leaflet

Aplicação **estática** para analisar evolução histórica dos indicadores de infraestrutura das escolas do Brasil por UF e município. **RO** é a UF inicial; o mesmo script gera dados para qualquer outra UF. Sem Superset, PostgreSQL ou API em produção.

## O que existe nesta versão

- **Python 3.10+**: baixa e armazena o ZIP anual do Inep, localiza o CSV de escolas no arquivo, lê em blocos, filtra a UF, conta indicadores binários, gera agregados por **município × rede × urbana/rural × ano**.
- **IBGE**: busca códigos, nomes e malha municipal em GeoJSON; permite usar GeoJSON local.
- **Vue 3/Vite/Leaflet/Chart.js**: filtro de UF, ano, município, indicador, rede, área; mapa municipal coroplético; tendência anual; ranking; exportação CSV e escolas individuais (carregadas sob demanda).
- **GitHub Pages**: workflow compila e publica `frontend/dist` como site estático. Depois da geração local é necessário **versionar/commitar** os arquivos de `frontend/public/data`.
- **Dados oficiais não vêm no ZIP deste projeto.** Não há dados inventados. O download é feito localmente ao executar o ETL; o próprio INEP distribui arquivos nacionais grandes.

## Início rápido

No diretório raiz do projeto:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
python -m edu_panorama generate --uf RO --years 2020:2025
```

Alternativa com comando instalado: `panorama-educacao generate --uf RO --years 2020:2025`.

Em seguida:

```bash
cd frontend
npm install
npm run dev
```

Abra o endereço indicado pelo Vite, geralmente `http://localhost:5173/`.

### Gerar para outra UF

```bash
python -m edu_panorama generate --uf AC --years 2021:2025
python -m edu_panorama generate --uf SP --years 2020:2025
```

Os resultados são gravados separadamente em `frontend/public/data/RO`, `frontend/public/data/AC` etc. O `index.json` é atualizado para que o usuário selecione o estado no site. Você também pode modificar a configuração padrão de `uf` e `years` em `config.toml`.

### Processar ZIPs locais sem download

Se o ZIP já foi baixado manualmente do site oficial, mova-o para `data/raw/microdados_censo_escolar_2024.zip` (o 2025 costuma ser `microdados_censo_escolar_2025_.zip`). Rode:

```bash
python -m edu_panorama generate --uf RO --years 2024:2025 --no-download
```

Os links oficiais são configuráveis em `config.toml`. O ZIP é **lido diretamente**, sem descompactar dezenas de gigabytes no disco. Sem conexão com o IBGE, use também `--no-network --geojson /caminho/para/RO.geojson`. Há log das colunas encontradas e dos indicadores indisponíveis.

### Malha municipal offline

```bash
python -m edu_panorama generate --uf RO --years 2024:2025 --no-download --no-network --geojson /caminho/para/RO.geojson
```

A malha deve ser um `FeatureCollection` GeoJSON com código IBGE municipal de sete dígitos em `feature.id` ou `properties.codarea`, `CD_MUN`, `CD_GEOCMU` ou `id`. A versão `--no-geojson` permite gerar apenas indicadores sem mapa, **não** é recomendada para publicação.

## Estrutura

```text
config.toml                      # UF, anos, paths e fontes
edu_panorama/                   # Python: CLI, fontes, dicionário, ETL e geografia
data/raw/                       # ZIPs originais em cache (não versionar)
frontend/
  public/data/
    index.json                  # Lista de estados disponíveis
    RO/manifest.json            # Indicadores, anos, municípios, agregados
    RO/municipios.geojson       # Malha municipal georreferenciada
    RO/schools/2025.json        # Dados por escola, carregados sob demanda
  src/                          # Vue, mapa, gráfico e funções analíticas
.github/workflows/pages.yml     # Deploy estático
tests/                           # Testes com bases fictícias
```

## Publicar no GitHub Pages

1. Gere os dados **localmente** e confirme que `frontend/public/data/RO/manifest.json` e `municipios.geojson` existem. Caso a atualização inclua vários anos/UFs, confira o tamanho dos arquivos antes de versioná-los.
2. Faça commit e push dos arquivos do projeto e do diretório `frontend/public/data/` na branch `main`.
3. Em **Settings → Pages**, configure **Source: GitHub Actions**.
4. O workflow `pages.yml` compila o site com `BASE_PATH=/<nome-repo>/`, necessário para URLs relativas de assets e JSON em repositórios de projeto. Para domínio próprio, ajuste `BASE_PATH=/`.
5. O site será publicado em `https://usuario.github.io/nome-repo/`. **Nenhum processamento Python roda no GitHub Pages**: para atualizar dados, rode o ETL local novamente e publique novo commit.

## Regras analíticas (essenciais)

- Inclui **escolas em atividade** (`TP_SITUACAO_FUNCIONAMENTO=1`) quando esse campo existe.
- Indicador binário: **`sim` = 1; `não` = 0; outro ou campo ausente = sem resposta**, portanto nunca soma `N/D` no denominador.
- Percentual = escolas `1` / escolas que responderam `0` ou `1` × 100; escolas são contadas, **não matrículas**.
- Matrículas são informativas e não o peso da proporção; o arquivo de matrículas separado de 2025 é lido quando disponível.
- Indicadores indisponíveis em algum ano aparecem como **N/D**, não como zero. A ausência de um campo pode refletir alteração do questionário e deve ser auditada contra o dicionário do INEP.
- Não presumir equivalência entre campos de anos diferentes; o catálogo `edu_panorama/catalog.py` define um único campo por indicador e mantém a lista de anos em que foi encontrado.
- Para séries muito longas, revise mudanças de questionário, descontinuidade de escolas e limite territorial; o mapa atual usa a malha da data de geração para todos os anos.
- A geometria da escola **não** faz parte desta versão. O mapa coroplético representa municípios, não a localização exata das escolas.
- Os dados por escola se limitam a atributos públicos e não incluem dados pessoais de alunos/docentes.

## Adicionar indicadores

Em `edu_panorama/catalog.py`, registre a `chave`, `rótulo`, `categoria`, e **campo exato** (ex.: `IN_AGUA_POTAVEL`). O pipeline passa a extraí-lo, calcular valores agregados e exibi-lo automaticamente. Se uma variável muda ao longo do tempo, documente a harmonização antes de alterar os aliases. Indicadores de outros datasets (Ideb, SIOPE, PDDE etc.) serão **novos conectores ETL**; esta primeira versão implementa de fato o Censo Escolar + IBGE, não afirma integrar essas fontes.

## Testes

```bash
pytest -q
```

Os testes montam ZIPs de Censo **fictícios** (layout consolidado 2024 e separado 2025), validam contas e geram arquivos JSON/GeoJSON. Não fazem download pela internet.

## Fontes

- [INEP — microdados do Censo Escolar](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar)
- [IBGE — serviço de localidades](https://servicodados.ibge.gov.br/api/docs/localidades)
- [IBGE — API de malhas](https://servicodados.ibge.gov.br/api/docs/malhas)
- [Vite — GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)

**Limitações de validação do pacote:** os testes Python com arquivos fictícios foram executados, mas não foi possível baixar ZIPs completos do Inep nem instalar pacotes do npm neste ambiente. Após baixar os microdados reais, confira os logs de campos encontrados e os dicionários originais antes de publicar indicadores históricos.
