# Ideb: fontes, esquema e metodologia

O Ideb é numérico (0 a 10) e bienal. Este módulo é independente do catálogo dos
15 indicadores booleanos e dos arquivos do Censo Escolar. Não calcula índices,
metas, médias de escolas ou estimativas de resultados ausentes.

## Fontes efetivamente inspecionadas

Página oficial: [Inep, resultados 2005–2025](https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025).
Consulta e download em 19/10/2026. Os sete ZIPs contêm XLSX e ODS equivalentes,
além de arquivos MD5. O importador lê somente XLSX para não duplicar observações.
CRC do ZIP/XLSX é verificado; SHA-256 do arquivo recebido é registrado no manifesto.
Não são publicados arquivos brutos.

Todos os links abaixo usam o prefixo oficial
`https://download.inep.gov.br/ideb/resultados/`:

| Chave de configuração | Arquivo |
| --- | --- |
| `ufs` | `divulgacao_regioes_ufs_ideb_2025.zip` |
| `municipios_anos_iniciais` | `divulgacao_anos_iniciais_municipios_2025.zip` |
| `municipios_anos_finais` | `divulgacao_anos_finais_municipios_2025.zip` |
| `municipios_ensino_medio` | `divulgacao_ensino_medio_municipios_2025.zip` |
| `escolas_anos_iniciais` | `divulgacao_anos_iniciais_escolas_2025.zip` |
| `escolas_anos_finais` | `divulgacao_anos_finais_escolas_2025.zip` |
| `escolas_ensino_medio` | `divulgacao_ensino_medio_escolas_2025.zip` |

UFs: abas `UF e Regiões (AI)`, `UF e Regiões (AF)` e `UF e Regiões (EM)`.
Municípios: `IDEB_AI_MUNICÍPIOS`, `IDEB_AF_MUNICÍPIOS` e
`IDEB_Municípios (ENSINO MÉDIO)`. Escolas: `IDEB_Escolas (Anos_Iniciais)`,
`IDEB_Escolas (Anos_Finais)` e `IDEB_Escolas (ENSINO MÉDIO)`.

As planilhas de fundamental contêm 2005–2025; municipais/escolares do médio,
2017–2025. As abas estaduais também contêm edições anteriores de ensino médio.
As edições estão em colunas, não em arquivos anuais. A interface apresenta as
edições efetivamente importadas; uma edição solicitada que não existe em alguma
fonte resulta em erro explícito, sem inventar observações.

## Mapeamento

Cabeçalhos visuais nas linhas 7–9, cabeçalhos técnicos na linha 10 e dados a
partir da linha 11. O parser procura a linha técnica, sem assumir sua posição.
O manifesto registra os nomes das abas, membros ZIP e índices de coluna (base 1).

| Origem | Campo JSON | Regra |
| --- | --- | --- |
| `SG_UF` | `uf` | Sigla oficial; `uf_code` vem do catálogo IBGE das UFs |
| `CO_MUNICIPIO` | `municipality_id` | String de 7 dígitos |
| `NO_MUNICIPIO` | `municipality_name` | Nome publicado |
| `ID_ESCOLA` | `school_id` | String de 8 dígitos, preservando zeros |
| `NO_ESCOLA` | `name` | Nome publicado da escola |
| `REDE` | `network`, `network_label` | Categoria normalizada e rótulo original |
| `VL_OBSERVADO_<ano>` | `ideb` | Nota oficial; nunca usar `VL_PROJECAO_*` |
| `VL_NOTA_MEDIA_<ano>` | `components.performance` | Nota média padronizada N, sem recalcular |
| `VL_NOTA_MATEMATICA_<ano>` | `components.math` | Nota Saeb de matemática |
| `VL_NOTA_PORTUGUES_<ano>` | `components.portuguese` | Nota Saeb de língua portuguesa |
| `VL_INDICADOR_REND_<ano>` / cabeçalho visual | `components.yield` | Indicador de rendimento P |

UFs não repetem seus identificadores na linha técnica: as duas primeiras colunas
visuais são `Região/Unidade da Federação` e `Rede`. São reconhecidos os nomes
completos e as abreviações publicadas `R. G. do Norte`, `R. G. do Sul` e
`M. G. do Sul`. Regiões não são importadas como UFs. Notas de rodapé nos rótulos
de rede, como `Pública (4)` e `Total (3)(4)`, são removidas apenas da categoria
normalizada; o texto original permanece em `network_label`.

**Inconsistência observada:** na aba estadual de anos iniciais, o campo técnico
de P/2025 repete `VL_INDICADOR_REND_2023`. A associação de P usa o agrupamento
visual `Taxa de Aprovação - 2025` e a subcoluna `Indicador de Rendimento (P)`.
Não utiliza o nome técnico duplicado para atribuir esse componente a 2023.
Nomes de ano visuais com notas de rodapé, como `20215`, não são interpretados
como edição 20215. As notas do Ideb usam exclusivamente `VL_OBSERVADO_<ano>`.

`-`, `ND`, `ND*`, `ND**`, `ND***` e asteriscos permanecem sem nota numérica,
com `status=not_published` e `raw_value` original. Células vazias recebem
`missing`. Um marcador explícito `N/A`/“não se aplica” recebe `not_applicable`.
O parser não deduz que uma etapa é não aplicável somente porque não há linha.
Valores desconhecidos ou fora de 0–10 causam erro. Vírgulas decimais são aceitas,
sem arredondar os números publicados. As notas de divulgação dos XLSX explicam
insuficiência de participantes e diferentes motivos de não divulgação; o raw
preservado permite distingui-los sem expor resultados suprimidos.

Identidade: `(year, uf, level, municipality_id, school_id, stage, network)`.
Duplicatas idênticas são ignoradas; conflitantes interrompem a importação.
Notas estaduais, municipais e escolares nunca são agregadas entre si. Nomes,
municípios e redes são os publicados na planilha histórica; não se infere a
classificação administrativa da escola em censos anteriores.

## Comandos e configuração

```bash
python -m edu_panorama ideb generate --uf RO --years 2021,2023,2025
python -m edu_panorama ideb generate --all --years 2021,2023,2025
python -m edu_panorama ideb status --years 2021,2023,2025
python -m edu_panorama ideb generate --uf RO --no-download --force
```

`--all` lê cada planilha nacional uma vez para as UFs pendentes. `--force` funciona
para uma UF ou para todas. Saídas completas, no esquema e configuração atuais,
são puladas. `status` confere manifesto, arquivos, contagens e SHA-256 sem rede.
Mudanças no esquema exigem regeneração; alterações no conteúdo de uma fonte no
mesmo endereço devem ser aplicadas atualizando o cache e usando `--force`.

```toml
[ideb]
cache_dir = "data/raw/ideb"
output_dir = "frontend/public/data/ideb"

[ideb.urls]
# Apenas URLs HTTPS oficiais do Inep, nunca URLs presumidas.
ufs = "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2025.zip"

[ideb.local_files]
# Mesmas chaves da tabela de fontes. Caminhos relativos ao config.toml.
ufs = "data/raw/ideb/divulgacao_regioes_ufs_ideb_2025.zip"
```

Também existem `--config`, `--cache-dir` e `--output-dir`. É possível configurar
ZIP, XLSX, XLS ou CSV oficial previamente baixado. CSV usa UTF-8 e os mesmos
cabeçalhos técnicos, com delimitador detectado. Fontes de outras estruturas
exigem inspeção e atualização explícita do parser. Não há download inseguro:
requests valida TLS por padrão e respeita `REQUESTS_CA_BUNDLE` para ambientes
com cadeia de certificados própria. Erros são informados e temporários removidos.
Neste ambiente, o download inicial foi feito com `curl` validando certificados,
e a importação reutilizou esses ZIPs locais; não foi usado `verify=False`.

## Arquivos estáticos e cruzamento

Esquema 1 em `frontend/public/data/ideb/index.json`, com manifesto por UF e
arquivos separados por etapa e nível. Cada arquivo contém todas as edições
importadas daquela etapa/nível. Nomes contêm resumo do conteúdo, evitando
que um manifesto antigo leia um arquivo novo durante a geração. O manifesto
é gravado por último; arquivos substituídos são removidos. Os arquivos e hashes
são conferidos antes de uma UF entrar no índice. Os caminhos do frontend usam
`BASE_URL`, inclusive em subdiretórios, sem dependência de API.

As geometrias são reutilizadas de `data/<UF>/municipios.geojson`, sem regravar o
Censo. Se a malha não existir, resultados e histórico continuam disponíveis.
A área de desempenho e seus filtros podem funcionar sem manifesto do Censo.
Resultados são carregados por UF e etapa sob demanda, com cache de promessas,
retry e descarte de respostas obsoletas. Listas têm paginação para limitar o DOM.

O cruzamento escolar é exato por código Inep e edição. A observação mantém sua
etapa; não se replica um resultado em etapas diferentes. A consulta opcional ao
Censo da mesma edição distingue escola localizada, escola não localizada,
edição divergente e arquivo indisponível. Infraestrutura descreve a escola, não
comprova a oferta da etapa nem estabelece causalidade. Análises estatísticas
Ideb × infraestrutura ficam para uma próxima etapa.

## Leitura e limites

A escala cartográfica e do gráfico é fixa em 0–10. N/D é cinza; zero publicado é
vermelho. Somente edições importadas aparecem na reprodução. O gráfico não
interpola lacunas nem transforma Ideb em indicador anual. Cada gráfico possui
tabela textual de valores e situações. A variação compara com a última edição
anterior **com nota publicada** da mesma unidade, etapa e rede, mostrando seu
ano. A evolução no período compara os extremos disponíveis da série inteira.
Rankings por diferença exigem duas notas. Ausências não entram na classificação.

As redes do filtro vêm das linhas oficiais do território e edição selecionados.
Não se aplica localização urbana/rural. Se uma categoria estadual, como Total
ou Privada, não estiver na fonte municipal, a interface informa e mantém o mapa
sem notas. Para consultar escolas, Pública inclui dependências Federal,
Estadual e Municipal; Total inclui as dependências listadas. Essa seleção serve
apenas para consulta/contagem, nunca para calcular uma nota territorial.

Cobertura escolar é `linhas com nota / linhas da planilha` para a etapa, edição,
rede e território. Não é taxa de participação de todas as escolas, nem significa
que todas as linhas sem nota oferecem a etapa em todas as edições. Restrições
de divulgação e impactos da pandemia em 2021 devem orientar comparações.

Dados iniciais versionados: Rondônia, 2021/2023/2025, três etapas, 5.376
observações. As demais UFs têm estado de não processado explícito na interface;
podem ser geradas sem o Censo. O modo nacional foi executado e validado para as
27 UFs em diretório temporário (aproximadamente 214 MB), fora do commit.
A [conferência real](ideb-validation.md) registra 54 células oficiais verificadas.
