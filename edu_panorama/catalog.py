"""Catálogo de indicadores e codificação das UFs.

Indicadores são atributos declarados por escola (não por aluno).
Para preservar a comparabilidade, não inferimos valores não publicados.
"""

UFS = {
    "RO": (11, "Rondônia"), "AC": (12, "Acre"), "AM": (13, "Amazonas"),
    "RR": (14, "Roraima"), "PA": (15, "Pará"), "AP": (16, "Amapá"),
    "TO": (17, "Tocantins"), "MA": (21, "Maranhão"), "PI": (22, "Piauí"),
    "CE": (23, "Ceará"), "RN": (24, "Rio Grande do Norte"),
    "PB": (25, "Paraíba"), "PE": (26, "Pernambuco"),
    "AL": (27, "Alagoas"), "SE": (28, "Sergipe"), "BA": (29, "Bahia"),
    "MG": (31, "Minas Gerais"), "ES": (32, "Espírito Santo"),
    "RJ": (33, "Rio de Janeiro"), "SP": (35, "São Paulo"),
    "PR": (41, "Paraná"), "SC": (42, "Santa Catarina"),
    "RS": (43, "Rio Grande do Sul"), "MS": (50, "Mato Grosso do Sul"),
    "MT": (51, "Mato Grosso"), "GO": (52, "Goiás"),
    "DF": (53, "Distrito Federal"),
}

# Um único campo por indicador (sem combinações heurísticas de colunas).
INDICATORS = {
    "agua_potavel": ("Água potável", "Saneamento", ("IN_AGUA_POTAVEL",)),
    "agua_rede": ("Abastecimento pela rede pública", "Saneamento", ("IN_AGUA_REDE_PUBLICA",)),
    "esgoto_rede": ("Esgoto pela rede pública", "Saneamento", ("IN_ESGOTO_REDE_PUBLICA",)),
    "energia_rede": ("Energia pela rede pública", "Infraestrutura", ("IN_ENERGIA_REDE_PUBLICA",)),
    "banheiro": ("Banheiro", "Infraestrutura", ("IN_BANHEIRO",)),
    "banheiro_pne": ("Banheiro acessível", "Acessibilidade", ("IN_BANHEIRO_PNE",)),
    "internet": ("Acesso à internet", "Tecnologia", ("IN_INTERNET",)),
    "internet_alunos": ("Internet para alunos", "Tecnologia", ("IN_INTERNET_ALUNOS",)),
    "laboratorio_informatica": ("Laboratório de informática", "Tecnologia", ("IN_LABORATORIO_INFORMATICA",)),
    "biblioteca": ("Biblioteca", "Estrutura pedagógica", ("IN_BIBLIOTECA",)),
    "sala_leitura": ("Sala de leitura", "Estrutura pedagógica", ("IN_SALA_LEITURA",)),
    "quadra_coberta": ("Quadra coberta", "Estrutura pedagógica", ("IN_QUADRA_ESPORTES_COBERTA",)),
    "cozinha": ("Cozinha", "Alimentação", ("IN_COZINHA",)),
    "refeitorio": ("Refeitório", "Alimentação", ("IN_REFEITORIO",)),
    "lixo_coleta": ("Coleta periódica de lixo", "Saneamento", ("IN_LIXO_SERVICO_COLETA",)),
}

# Nunca assumir que um campo removido/renomeado equivale a outro sem validar o dicionário.
ALIASES = {
    "school_id": ("CO_ENTIDADE", "COD_ENTIDADE", "ID_ESCOLA"),
    "school_name": ("NO_ENTIDADE", "NOME_ENTIDADE"),
    "municipio": ("CO_MUNICIPIO", "COD_MUNICIPIO"),
    "municipio_name": ("NO_MUNICIPIO",),
    "uf_code": ("CO_UF",),
    "uf_sigla": ("SG_UF",),
    "rede": ("TP_DEPENDENCIA",),
    "localizacao": ("TP_LOCALIZACAO",),
    "situacao": ("TP_SITUACAO_FUNCIONAMENTO",),
    "matriculas": ("QT_MAT_BAS",),
}
REDE_NAMES = {"1": "Federal", "2": "Estadual", "3": "Municipal", "4": "Privada"}
LOCAL_NAMES = {"1": "Urbana", "2": "Rural"}
