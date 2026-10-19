"""Extrai apenas dados públicos por escola e produz estatísticas reproduzíveis."""
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile
import pandas as pd
from .catalog import INDICATORS, ALIASES, LOCAL_NAMES, REDE_NAMES, UFS, INFRASTRUCTURE_FIELDS


def find_school_member(zf: ZipFile, year: int) -> str:
    names = [i.filename for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith('.csv')]
    preferred = [f'tabela_escola_{year}', f'microdados_ed_basica_{year}', 'tabela_escola_', 'microdados_ed_basica']
    for pattern in preferred:
        hits = [name for name in names if pattern in name.lower() and 'suplemento' not in name.lower()]
        if hits:
            return sorted(hits, key=len)[0]
    raise ValueError(f'CSV de escolas não encontrado no ZIP {year}: {names[:20]}')


def find_matricula_member(zf: ZipFile, year: int) -> str | None:
    names = [i.filename for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith('.csv')]
    hits = [name for name in names if f'tabela_matricula_{year}' in name.lower()]
    return sorted(hits, key=len)[0] if hits else None


def csv_options(zf: ZipFile, member: str) -> dict:
    with zf.open(member) as f:
        raw = f.read(262144)
    try:
        decoded = raw.decode('utf-8-sig')
        encoding = 'utf-8-sig'
    except UnicodeDecodeError:
        decoded = raw.decode('latin-1')
        encoding = 'latin-1'
    first_line = decoded.splitlines()[0]
    sep = max((';', '|', ',', '\t'), key=first_line.count)
    if first_line.count(sep) < 2:
        raise ValueError(f'Cabeçalho CSV não reconhecido em {member}: {first_line[:120]}')
    return {'encoding': encoding, 'sep': sep}


def column_names(zf: ZipFile, member: str, opts: dict) -> dict[str, str]:
    with zf.open(member) as file:
        df = pd.read_csv(file, nrows=0, dtype=str, **opts)
    return {str(col).strip().upper(): col for col in df.columns}


def find_column(cols: dict, aliases: tuple[str, ...]) -> str | None:
    return next((cols[key] for key in aliases if key in cols), None)


def iter_chunks(zf: ZipFile, member: str, columns: list[str], opts: dict, chunksize: int):
    with zf.open(member) as stream:
        yield from pd.read_csv(stream, usecols=columns, dtype=str, keep_default_na=False,
                               chunksize=chunksize, on_bad_lines='error', **opts)


def clean_num(value) -> str:
    value = str(value).strip()
    return value[:-2] if value.endswith('.0') else value


def norm_municipio(value) -> str:
    value = clean_num(value)
    return value.zfill(7) if value.isdigit() and len(value) <= 7 else value


def bool_value(value) -> int | None:
    value = clean_num(value)
    return int(value) if value in {'0', '1'} else None


def num_value(value) -> int | None:
    value = clean_num(value)
    return int(value) if value.isdigit() else None


def enrollments_by_school(zf: ZipFile, member: str | None, uf: str, chunksize: int) -> dict:
    if not member:
        return {}
    opts = csv_options(zf, member)
    cols = column_names(zf, member, opts)
    code = find_column(cols, ALIASES['school_id'])
    mats = find_column(cols, ALIASES['matriculas'])
    col_uf = find_column(cols, ALIASES['uf_code'])
    sigla = find_column(cols, ALIASES['uf_sigla'])
    municipio = find_column(cols, ALIASES['municipio'])
    if not code or not mats or not (col_uf or sigla or municipio):
        return {}
    uf_code = str(UFS[uf][0])
    out = {}
    columns = list(dict.fromkeys([c for c in (code, mats, col_uf, sigla, municipio) if c]))
    for chunk in iter_chunks(zf, member, columns, opts, chunksize):
        if sigla:
            chunk = chunk[chunk[sigla].str.upper() == uf]
        elif col_uf:
            chunk = chunk[chunk[col_uf].str.strip() == uf_code]
        else:
            chunk = chunk[chunk[municipio].str.startswith(uf_code)]
        for _, row in chunk.iterrows():
            count = num_value(row[mats])
            # No layout 2025, esta é uma tabela com total por escola.
            # Duplicidade não é somada, inclusive se um dos valores for ausente.
            key = clean_num(row[code])
            if key in out and out[key] != count:
                raise ValueError(f'Matrículas com valores divergentes para escola {key}')
            out[key] = count
    return out


def load_year(zip_file: Path, year: int, uf: str, chunksize: int):
    schools = {}
    with ZipFile(zip_file) as zf:
        member = find_school_member(zf, year)
        opts = csv_options(zf, member)
        cols = column_names(zf, member, opts)
        resolved = {key: find_column(cols, alias) for key, alias in ALIASES.items()}
        if not resolved['school_id'] or not resolved['municipio']:
            raise ValueError(f'{year}: CO_ENTIDADE ou CO_MUNICIPIO ausente em {member}')
        if not (resolved['uf_code'] or resolved['uf_sigla']):
            print(f'  {year}: filtro de UF obtido pelo prefixo de CO_MUNICIPIO')
        metrics = {key: find_column(cols, aliases) for key, (_, _, aliases) in INDICATORS.items()}
        used = list(dict.fromkeys(x for x in [*resolved.values(), *metrics.values()] if x))
        enrollment_file = find_matricula_member(zf, year) if not resolved['matriculas'] else None
        matriculas = enrollments_by_school(zf, enrollment_file, uf, chunksize)
        print(f'  {year}: lendo {member}; indicadores disponíveis: {sum(v is not None for v in metrics.values())}/{len(INDICATORS)}')
        uf_code = str(UFS[uf][0])
        for chunk in iter_chunks(zf, member, used, opts, chunksize):
            ufcol = resolved['uf_code']
            sigla = resolved['uf_sigla']
            mcol = resolved['municipio']
            if sigla:
                chunk = chunk[chunk[sigla].str.upper() == uf]
            elif ufcol:
                chunk = chunk[chunk[ufcol].str.strip() == uf_code]
            else:
                chunk = chunk[chunk[mcol].str.startswith(uf_code)]
            if resolved['situacao']:
                # 1 = em atividade. Escolas paralisadas/extintas não compõem denominador.
                chunk = chunk[chunk[resolved['situacao']].str.strip() == '1']
            for _, row in chunk.iterrows():
                school_id = clean_num(row[resolved['school_id']])
                mun = norm_municipio(row[mcol])
                if not school_id or not mun.startswith(uf_code) or len(mun) != 7:
                    continue
                if school_id in schools:
                    raise ValueError(f'{year}: escola duplicada {school_id} no arquivo {member}')
                value = lambda key: clean_num(row[resolved[key]]) if resolved[key] else ''
                mat = num_value(row[resolved['matriculas']]) if resolved['matriculas'] else matriculas.get(school_id)
                schools[school_id] = {
                    'id': school_id,
                    'name': value('school_name') or f'Escola {school_id}',
                    'municipio': mun,
                    'municipio_name': value('municipio_name'),
                    'rede': value('rede') if value('rede') in REDE_NAMES else '0',
                    'localizacao': value('localizacao') if value('localizacao') in LOCAL_NAMES else '0',
                    'matriculas': mat,
                    'indicators': {key: bool_value(row[field]) if field else None for key, field in metrics.items()},
                }
    return list(schools.values()), {k: v is not None for k, v in metrics.items()}, member


def aggregate_year(schools: list[dict], year: int, availability: dict) -> list[dict]:
    # Soma numeradores/denominadores válidos; nulos não são tratados como 'não'.
    groups = defaultdict(lambda: {'schools': 0, 'matriculas': 0, 'matriculas_valid': 0,
                                  'metrics': {k: [0, 0] for k in INDICATORS},
                                  'known_enrollments': {k: set() for k in INDICATORS},
                                  'infrastructure': {k: dict.fromkeys(INFRASTRUCTURE_FIELDS, 0)
                                                     for k in INDICATORS}})
    seen = set()
    for school in schools:
        if school['id'] in seen:
            raise ValueError(f'{year}: escola duplicada {school["id"]} na agregação')
        seen.add(school['id'])
        key = (school['municipio'], school['rede'], school['localizacao'])
        group = groups[key]
        group['schools'] += 1
        if school['matriculas'] is not None:
            group['matriculas'] += school['matriculas']
            group['matriculas_valid'] += 1
        for metric in INDICATORS:
            answer = school['indicators'].get(metric) if availability.get(metric) else None
            answer = answer if answer in (0, 1) else None
            counts = group['infrastructure'][metric]
            classification = 'with' if answer == 1 else 'without' if answer == 0 else 'unknown'
            counts[f'schools_{classification}'] += 1
            if school['matriculas'] is None:
                counts['schools_missing_enrollments'] += 1
            else:
                group['known_enrollments'][metric].add(classification)
                counts[f'enrollments_{classification}'] += school['matriculas']
                if answer is not None:
                    counts['enrollments_valid'] += school['matriculas']
            if answer is not None:
                group['metrics'][metric][0] += answer
                group['metrics'][metric][1] += 1
    for group in groups.values():
        for metric, counts in group['infrastructure'].items():
            known = group['known_enrollments'][metric]
            for classification in ('with', 'without', 'unknown'):
                if counts[f'schools_{classification}'] and classification not in known:
                    counts[f'enrollments_{classification}'] = None
            if counts['schools_with'] + counts['schools_without'] and not known.intersection({'with', 'without'}):
                counts['enrollments_valid'] = None
    return [
        {'year': year, 'municipio': mun, 'rede': rede, 'localizacao': loc,
         'schools': group['schools'], 'matriculas': group['matriculas'],
         'matriculas_valid': group['matriculas_valid'], 'metrics': group['metrics'],
         # Mesmo padrão compacto de metrics, com ordem publicada no manifesto.
         'infrastructure': {metric: [counts[field] for field in INFRASTRUCTURE_FIELDS]
                            for metric, counts in group['infrastructure'].items()}}
        for (mun, rede, loc), group in sorted(groups.items())
    ]
