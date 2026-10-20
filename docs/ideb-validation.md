# Conferência real do Ideb — amostras nacionais

Conferência realizada em 19/10/2026 sobre os XLSX obtidos dos sete ZIPs da [página oficial do Inep](https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025).

Foram conferidas diretamente 54 células (18 observações × 3 edições) de Rondônia, sem usar o parser para extrair a referência. Todas coincidiram, inclusive ausências. As células abaixo usam linha e coluna do XLSX oficial original.

| Etapa | Nível / identificação | Rede | 2021 | 2023 | 2025 | Células (2021 / 2023 / 2025) |
| --- | --- | --- | --- | --- | --- | --- |
| anos_iniciais | state / Rondônia | Total | 5.4 | 5.6 | 6.1 | DQ15 / DR15 / DS15 |
| anos_finais | state / Rondônia | Total | 4.9 | 4.8 | 4.8 | DF15 / DG15 / DH15 |
| ensino_medio | state / Rondônia | Total | 4.1 | 4.2 | 4.2 | DF14 / DG14 / DH14 |
| anos_iniciais | municipality / Alta Floresta D'Oeste / 1100015 | Pública | 4.8 | 5.3 | 5.7 | DS13 / DT13 / DU13 |
| anos_iniciais | municipality / Cacoal / 1100049 | Pública | 5.7 | 5.7 | 6.2 | DS22 / DT22 / DU22 |
| anos_iniciais | municipality / Porto Velho / 1100205 | Pública | 5.4 | 5.4 | 5.8 | DS61 / DT61 / DU61 |
| anos_finais | municipality / Alta Floresta D'Oeste / 1100015 | Pública | 4.8 | 4.7 | 5 | DH13 / DI13 / DJ13 |
| anos_finais | municipality / Cacoal / 1100049 | Pública | 5.1 | 4.9 | 5 | DH21 / DI21 / DJ21 |
| anos_finais | municipality / Porto Velho / 1100205 | Pública | 4.4 | 4.6 | 4.5 | DH59 / DI59 / DJ59 |
| ensino_medio | municipality / Alta Floresta D'Oeste / 1100015 | Pública | 3.9 | 4.5 | 4.5 | AZ12 / BA12 / BB12 |
| ensino_medio | municipality / Cacoal / 1100049 | Pública | 4.2 | 4.2 | 4.2 | AZ20 / BA20 / BB20 |
| ensino_medio | municipality / Porto Velho / 1100205 | Pública | 3.8 | 4 | 4 | AZ51 / BA51 / BB51 |
| anos_iniciais | school / EMEIEF ANA NERY / 11024372 | Municipal | - | - | - | DU11 / DV11 / DW11 |
| anos_iniciais | school / EMEIEF BOA ESPERANCA / 11024666 | Municipal | - | - | 6 | DU12 / DV12 / DW12 |
| anos_finais | school / EMEIEF BOA ESPERANCA / 11024666 | Municipal | - | 5 | 4.5 | DJ11 / DK11 / DL11 |
| anos_finais | school / EEEFM EURIDICE LOPES PEDROSO / 11024682 | Estadual | - | - | 4.9 | DJ12 / DK12 / DL12 |
| ensino_medio | school / EEEFM EURIDICE LOPES PEDROSO / 11024682 | Estadual | 3.6 | 4 | 4 | BB11 / BC11 / BD11 |
| ensino_medio | school / EEEMTI JUSCELINO KUBITSCHEK DE OLIVEIRA / 11024968 | Estadual | 5.4 | 5.4 | 5.1 | BB12 / BC12 / BD12 |

Redes estaduais: Total corresponde aos rótulos originais com notas de rodapé. Municípios: rede Pública. Escolas: dependência publicada. O sinal `-` permanece sem nota, não zero.

## Amostra nacional adicional

Em 19/10/2026, 18 observações dos resultados versionados foram verificadas novamente por leitura direta das células dos XLSX oficiais com `openpyxl`. A referência foi localizada pelas colunas de código, rede e `VL_OBSERVADO_<ano>`; não foi usada a função `parse` do projeto. Cada valor bruto abaixo foi comparado ao registro JSON indicado por UF, etapa e nível, incluindo três resultados escolares não divulgados. As células e nomes de abas se referem ao membro XLSX do ZIP oficial listado.

| Observação (UF · nível · etapa · edição · código · rede) | Arquivo XLSX do ZIP · aba · célula | Valor na fonte | Valor no JSON | Conferência |
| --- | --- | ---: | ---: | --- |
| RO · estado · anos iniciais · 2021 · Total | `divulgacao_regioes_ufs_ideb_2025.xlsx` · UF e Regiões (AI) · DQ15 | 5.4 | 5.4 | OK |
| SP · estado · anos finais · 2023 · Total | `divulgacao_regioes_ufs_ideb_2025.xlsx` · UF e Regiões (AF) · DG99 | 5.4 | 5.4 | OK |
| AM · estado · ensino médio · 2025 · Total | `divulgacao_regioes_ufs_ideb_2025.xlsx` · UF e Regiões (EM) · DH20 | 3.8 | 3.8 | OK |
| BA · estado · anos iniciais · 2021 · Total | `divulgacao_regioes_ufs_ideb_2025.xlsx` · UF e Regiões (AI) · DQ79 | 5.3 | 5.3 | OK |
| RS · estado · anos finais · 2023 · Total | `divulgacao_regioes_ufs_ideb_2025.xlsx` · UF e Regiões (AF) · DG115 | 4.9 | 4.9 | OK |
| DF · estado · ensino médio · 2025 · Total | `divulgacao_regioes_ufs_ideb_2025.xlsx` · UF e Regiões (EM) · DH104 | 4.1 | 4.1 | OK |
| AM · município · anos iniciais · 2021 · 1300029 · Pública | `divulgacao_anos_iniciais_municipios_2025.xlsx` · IDEB_AI_MUNICÍPIOS · DS230 | 4.5 | 4.5 | OK |
| DF · município · anos iniciais · 2021 · 5300108 · Pública | `divulgacao_anos_iniciais_municipios_2025.xlsx` · IDEB_AI_MUNICÍPIOS · DS14527 | 5.9 | 5.9 | OK |
| RO · município · anos finais · 2023 · 1100015 · Pública | `divulgacao_anos_finais_municipios_2025.xlsx` · IDEB_AF_MUNICÍPIOS · DI13 | 4.7 | 4.7 | OK |
| BA · município · anos finais · 2023 · 2900108 · Pública | `divulgacao_anos_finais_municipios_2025.xlsx` · IDEB_AF_MUNICÍPIOS · DI5041 | 5.1 | 5.1 | OK |
| SP · município · ensino médio · 2025 · 3500105 · Pública | `divulgacao_ensino_medio_municipios_2025.xlsx` · IDEB_Municípios (ENSINO MÉDIO) · BB6928 | 5 | 5.0 | OK |
| RS · município · ensino médio · 2025 · 4300034 · Pública | `divulgacao_ensino_medio_municipios_2025.xlsx` · IDEB_Municípios (ENSINO MÉDIO) · BB9724 | 4.9 | 4.9 | OK |
| SP · escola · anos iniciais · 2021 · 35079923 · Municipal | `divulgacao_anos_iniciais_escolas_2025.xlsx` · IDEB_Escolas (Anos_Iniciais) · DU44369 | - | nulo (`not_published`) | OK |
| RS · escola · anos iniciais · 2021 · 43019285 · Municipal | `divulgacao_anos_iniciais_escolas_2025.xlsx` · IDEB_Escolas (Anos_Iniciais) · DU57357 | 5.8 | 5.8 | OK |
| AM · escola · anos finais · 2023 · 13012533 · Estadual | `divulgacao_anos_finais_escolas_2025.xlsx` · IDEB_Escolas (Anos_Finais) · DK752 | 4.4 | 4.4 | OK |
| DF · escola · anos finais · 2023 · 53000846 · Estadual | `divulgacao_anos_finais_escolas_2025.xlsx` · IDEB_Escolas (Anos_Finais) · DK47786 | - | nulo (`not_published`) | OK |
| RO · escola · ensino médio · 2025 · 11024682 · Estadual | `divulgacao_ensino_medio_escolas_2025.xlsx` · IDEB_Escolas (ENSINO MÉDIO) · BD11 | 4 | 4.0 | OK |
| BA · escola · ensino médio · 2025 · 29149886 · Estadual | `divulgacao_ensino_medio_escolas_2025.xlsx` · IDEB_Escolas (ENSINO MÉDIO) · BD6738 | - | nulo (`not_published`) | OK |

As amostras adicionais cobrem Rondônia, São Paulo, Amazonas, Bahia, Rio Grande do Sul e Distrito Federal; as três etapas, todos os anos 2021/2023/2025, e as classificações Total, Pública, Municipal e Estadual. Os códigos IBGE/Inep foram comparados diretamente com as colunas de identificação das planilhas. Isso é uma conferência amostral, não uma validação célula a célula de todas as observações nacionais.

Por fim, `python -m edu_panorama ideb status --all --years 2021,2023,2025` verificou os manifestos, o esquema, as contagens e os SHA-256 dos arquivos publicados: 27/27 UFs completas. Os ZIPs de fonte foram lidos do cache local; nenhum dado foi regenerado e os JSONs de produção não foram alterados.
