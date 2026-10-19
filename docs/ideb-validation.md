# Conferência real do Ideb — Rondônia

Conferência realizada em 19/10/2026 sobre os XLSX obtidos dos sete ZIPs da [página oficial do Inep](https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025).

Foram comparadas 54 células (18 linhas × 3 edições) diretamente com os JSONs de produção, sem utilizar o parser para extrair a referência. Todas coincidiram, inclusive ausências. Os hashes dos arquivos e os nomes completos das abas constam no manifesto de RO. As referências abaixo são células do XLSX, com linha e coluna baseadas no arquivo original.

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

O comando nacional também foi executado para 2021, 2023 e 2025 nas 27 UFs, em saída temporária. Manifestos, esquema, contagens e hashes passaram pela conferência de `ideb status`. Somente os JSONs de Rondônia acompanham este commit; não há planilhas brutas ou fixtures na saída de produção.
