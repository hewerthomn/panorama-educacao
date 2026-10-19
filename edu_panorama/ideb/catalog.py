"""Contrato próprio para observações numéricas do Ideb."""
SCHEMA_VERSION = 1
STAGES = {
    'anos_iniciais': 'Ensino fundamental — anos iniciais',
    'anos_finais': 'Ensino fundamental — anos finais',
    'ensino_medio': 'Ensino médio',
}
SOURCE_PAGE = 'https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025'
# Links inspecionados na página oficial. Podem ser substituídos em [ideb.urls].
SOURCE_FILES = {'ufs': ('state', None, 'divulgacao_regioes_ufs_ideb_2025.zip')}
for level, suffix in [('municipality', 'municipios'), ('school', 'escolas')]:
    for stage in STAGES:
        SOURCE_FILES[f'{suffix}_{stage}'] = (level, stage, f'divulgacao_{stage}_{suffix}_2025.zip')
DEFAULT_URLS = {key: f'https://download.inep.gov.br/ideb/resultados/{filename}'
                for key, (_, _, filename) in SOURCE_FILES.items()}
STATUS_LABELS = {
    'available': 'Resultado disponível',
    'not_published': 'Resultado não divulgado',
    'not_applicable': 'Etapa não aplicável',
    'missing': 'Informação ausente',
}
