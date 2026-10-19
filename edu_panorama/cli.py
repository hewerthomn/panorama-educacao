"""CLI: panorama-educacao generate --uf RO --years 2020:2025."""
import argparse
import json
from pathlib import Path
import sys
import tomllib
from datetime import datetime, timezone
from .catalog import UFS, INDICATORS
from .etl import load_year, aggregate_year
from .geo import geojson_for_uf, municipality_names
from .sources import locate_zip

ROOT = Path(__file__).resolve().parents[1]


def write_json(path: Path, value: object):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    with temp.open('w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, separators=(',', ':'))
    temp.replace(path)


def years_list(value: str) -> list[int]:
    years = [int(y) for y in (value.split(':') if ':' in value else value.split(','))]
    if ':' in value:
        if len(years) != 2 or years[1] < years[0]:
            raise argparse.ArgumentTypeError('Use YYYY:YYYY (ordem crescente)')
        years = list(range(years[0], years[1] + 1))
    if not years or any(y < 2007 or y > 2025 for y in years):
        raise argparse.ArgumentTypeError('Este ETL aceita inicialmente 2007–2025; anos anteriores requerem harmonização.')
    return sorted(set(years))


def resolve_dir(config_path: Path, location: str) -> Path:
    path = Path(location)
    return path if path.is_absolute() else config_path.parent / path



def state_status(uf: str, years: list[int], output_dir: Path, *,
                 include_schools: bool, require_geojson: bool) -> tuple[bool, str]:
    """Confere saídas publicáveis sem acessar a internet ou reprocessar microdados.

    O manifesto é a marca de conclusão (é gravado por último no ETL). Não
    confie só na existência do diretório: arquivos de escola/mapa também
    precisam estar presentes, conforme a configuração solicitada.
    """
    uf_dir = output_dir / uf
    path = uf_dir / 'manifest.json'
    if not path.is_file():
        return False, 'não gerado'
    try:
        manifest = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        return False, f'manifest.json inválido ({type(exc).__name__})'
    if manifest.get('uf') != uf or manifest.get('schema_version') != 1:
        return False, 'manifest.json incompatível'
    available = set(manifest.get('years', []))
    missing_years = sorted(set(years) - available)
    if missing_years:
        return False, 'faltam anos: ' + ', '.join(map(str, missing_years))
    source_files = manifest.get('sources', {}).get('files', {})
    missing_sources = [year for year in years if str(year) not in source_files]
    if missing_sources:
        return False, 'sem metadados de origem: ' + ', '.join(map(str, missing_sources))
    records = manifest.get('records')
    if not isinstance(records, list):
        return False, 'registros ausentes'
    years_with_records = {row.get('year') for row in records if isinstance(row, dict)}
    if set(years) - years_with_records:
        return False, 'agregados incompletos'
    if include_schools:
        if not manifest.get('schools_available'):
            return False, 'arquivos individuais de escolas indisponíveis'
        for year in years:
            school_file = uf_dir / 'schools' / f'{year}.json'
            if not school_file.is_file() or school_file.stat().st_size == 0:
                return False, f'arquivo schools/{year}.json ausente'
    if require_geojson:
        geo_file = uf_dir / 'municipios.geojson'
        if not manifest.get('map_available') or not geo_file.is_file() or geo_file.stat().st_size == 0:
            return False, 'malha municipal ausente'
    return True, 'completo'


def refresh_index(output_dir: Path) -> None:
    """Reconstrói a lista de UFs para o Vue, mesmo se todas forem puladas."""
    available = []
    for path in sorted(output_dir.glob('*/manifest.json')):
        try:
            obj = json.loads(path.read_text(encoding='utf-8'))
            available.append({'uf': obj['uf'], 'name': obj['state_name'], 'years': obj['years']})
        except (OSError, KeyError, ValueError):
            print(f'AVISO: manifesto inválido ignorado {path}', file=sys.stderr)
    write_json(output_dir / 'index.json', {'states': sorted(available, key=lambda row: row['uf'])})


def output_options(args, cfg, config_path):
    project = cfg['project']
    years = years_list(args.years) if args.years else list(project['years'])
    output_dir = resolve_dir(config_path, project['output_dir'])
    return years, output_dir


def generate_all(args, cfg, config_path) -> int:
    """Processa as 27 UFs, ignorando automaticamente as saídas completas."""
    years, output_dir = output_options(args, cfg, config_path)
    project = cfg['project']
    summary = {'skipped': [], 'generated': [], 'failed': []}
    print(f'Processamento nacional: {len(UFS)} UFs | {years[0]}–{years[-1]}')
    for uf in UFS:
        complete, reason = state_status(
            uf, years, output_dir,
            include_schools=bool(project.get('include_schools', True)),
            require_geojson=not args.no_geojson,
        )
        if complete and not args.force:
            print(f'[{uf}] PULADO — arquivos completos no destino')
            summary['skipped'].append(uf)
            continue
        print(f'[{uf}] GERAR — {"--force" if args.force else reason}')
        per_state_args = argparse.Namespace(**vars(args))
        per_state_args.uf = uf
        try:
            generate(per_state_args, cfg, config_path)
            summary['generated'].append(uf)
        except Exception as exc:
            print(f'[{uf}] ERRO: {type(exc).__name__}: {exc}', file=sys.stderr)
            summary['failed'].append(uf)
    refresh_index(output_dir)
    print('\nRESUMO:')
    print(f'  Já existentes, pulados: {len(summary["skipped"])} ' + ', '.join(summary['skipped']))
    print(f'  Gerados nesta execução: {len(summary["generated"])} ' + ', '.join(summary['generated']))
    print(f'  Falharam: {len(summary["failed"])} ' + ', '.join(summary['failed']))
    print(f'  Índice atualizado: {output_dir / "index.json"}')
    return 1 if summary['failed'] else 0


def show_status(args, cfg, config_path) -> None:
    years, output_dir = output_options(args, cfg, config_path)
    project = cfg['project']
    complete_count = 0
    for uf in UFS:
        complete, reason = state_status(
            uf, years, output_dir,
            include_schools=bool(project.get('include_schools', True)),
            require_geojson=not args.no_geojson,
        )
        if complete:
            complete_count += 1
        print(f'{uf}: {"COMPLETO" if complete else reason}')
    print(f'\n{complete_count}/{len(UFS)} UFs completas para {years[0]}–{years[-1]}')

def generate(args, cfg, config_path):
    project = cfg['project']
    uf = (args.uf or project['uf']).upper()
    if uf not in UFS:
        raise ValueError(f'UF inválida {uf}. Use uma das seguintes: {", ".join(UFS)}')
    years = years_list(args.years) if args.years else list(project['years'])
    if any(y < 2007 or y > 2025 for y in years):
        raise ValueError('Esta versão suporta dados de 2007 a 2025; para anos anteriores, atualize os dicionários.')
    raw_dir = resolve_dir(config_path, project['raw_dir'])
    output_dir = resolve_dir(config_path, project['output_dir'])
    uf_dir = output_dir / uf
    chunksize = int(project.get('chunksize', 50000))
    if chunksize < 1:
        raise ValueError('chunksize deve ser positivo')

    names = {}
    if not args.no_network:
        try:
            names = municipality_names(uf, cfg)
            print(f'IBGE: {len(names)} municípios cadastrados')
        except Exception as exc:
            print(f'AVISO: nomes IBGE indisponíveis; serão usados nomes do Censo ({exc})', file=sys.stderr)

    records = []
    source_files = {}
    availability_by_year = {}
    school_batches = {}
    for year in years:
        print(f'Processando {uf}/{year}...')
        source_zip = locate_zip(raw_dir, year, cfg, no_download=args.no_download)
        schools, availability, member = load_year(source_zip, year, uf, chunksize)
        if not schools:
            raise ValueError(f'{year}: nenhuma escola ativa encontrada para {uf}; verifique a UF e o arquivo.')
        school_batches[year] = schools
        availability_by_year[str(year)] = availability
        source_files[str(year)] = {'url': str(source_zip.name), 'arquivo_csv': member, 'escolas_ativas': len(schools)}
        for school in schools:
            if not names.get(school['municipio']) and school['municipio_name']:
                names[school['municipio']] = school['municipio_name']
        records.extend(aggregate_year(schools, year, availability))
        print(f'  {len(schools)} escolas ativas; {len([r for r in records if r["year"] == year])} grupos agregados')

    if args.no_geojson:
        geo = None
        print('AVISO: geometrias não incluídas (--no-geojson); mapa ficará desabilitado')
    else:
        geo_path = Path(args.geojson).resolve() if args.geojson else None
        geo = geojson_for_uf(uf, cfg, input_path=geo_path)
        for f in geo['features']:
            f['properties']['name'] = names.get(f['properties']['id'], f['properties']['id'])
        print(f'IBGE: {len(geo["features"])} geometrias municipais')

    # Só grava saídas após validar todos os anos; não publica série parcialmente nova.
    for year, schools in school_batches.items():
        if project.get('include_schools', True):
            write_json(uf_dir / 'schools' / f'{year}.json', {
                'uf': uf, 'year': year,
                'schools': sorted(schools, key=lambda r: (r['municipio'], r['name']))
            })
    if geo is not None:
        write_json(uf_dir / 'municipios.geojson', geo)
    else:
        (uf_dir / 'municipios.geojson').unlink(missing_ok=True)

    manifest = {
        'schema_version': 1,
        'uf': uf, 'state_name': UFS[uf][1], 'years': years,
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'sources': {'inep': 'https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar',
                    'ibge': 'https://servicodados.ibge.gov.br/', 'files': source_files},
        'notes': ['Somente escolas em atividade (TP_SITUACAO_FUNCIONAMENTO=1), quando disponível.',
                  'Numerador: escolas com valor 1; denominador: escolas com valor 0 ou 1.',
                  'Indicadores ausentes/sem respostas válidas são N/D, nunca zero.',
                  'Agregação por escola, não ponderada por matrícula.',
                  'A malha territorial corresponde à consulta IBGE no momento da geração.'],
        'municipalities': [{'id': k, 'name': v} for k, v in sorted(names.items()) if k.startswith(str(UFS[uf][0]))],
        'indicators': [{'key': key, 'label': label, 'category': category, 'field': aliases[0],
                        'available_years': [y for y in years if availability_by_year[str(y)][key]]}
                       for key, (label, category, aliases) in INDICATORS.items()],
        'records': records,
        'schools_available': bool(project.get('include_schools', True)),
        'map_available': geo is not None,
    }
    write_json(uf_dir / 'manifest.json', manifest)
    refresh_index(output_dir)
    print(f'OK: {uf_dir / "manifest.json"}\nPublicável: {output_dir}')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Gerar dados estáticos do panorama de educação.')
    parser.add_argument('--config', default=str(ROOT / 'config.toml'), help='Caminho para config.toml')
    sub = parser.add_subparsers(dest='command', required=True)
    build = sub.add_parser('generate', help='Processar os ZIPs oficiais do Inep por UF ou em lote')
    build.add_argument('--uf', help='Sigla da UF, ex.: RO, SP, AM')
    build.add_argument('--all', action='store_true', help='Percorrer todas as 27 UFs, pulando as já completas')
    build.add_argument('--force', action='store_true', help='Com --all, reprocessar também as UFs completas')
    build.add_argument('--years', help='Período YYYY:YYYY ou anos separados por vírgula')
    build.add_argument('--no-download', action='store_true', help='Somente ZIPs já presentes em data/raw')
    build.add_argument('--no-network', action='store_true', help='Não consultar a API de localidades do IBGE; requer ZIPs e malha locais')
    build.add_argument('--geojson', help='Malha municipal GeoJSON local (para processamento offline)')
    build.add_argument('--no-geojson', action='store_true', help='Gerar estatísticas sem malha territorial')
    status = sub.add_parser('status', help='Exibir UFs já geradas e o que ainda falta, sem fazer downloads')
    status.add_argument('--years', help='Período YYYY:YYYY ou anos separados por vírgula')
    status.add_argument('--no-geojson', action='store_true', help='Não exigir malha geográfica na checagem')
    args = parser.parse_args(argv)
    if args.command == 'generate':
        if args.all and args.uf:
            parser.error('Use --all ou --uf, não os dois juntos')
        if args.force and not args.all:
            parser.error('--force é destinado ao modo --all; para uma UF, generate já reprocessa por padrão')
        if args.all and args.geojson:
            parser.error('--all não aceita um único --geojson para diferentes UFs')
        if args.no_network and (not args.no_download or not (args.geojson or args.no_geojson)):
            parser.error('--no-network requer --no-download e --geojson ou --no-geojson')
    config_path = Path(args.config).resolve()
    try:
        with config_path.open('rb') as fh:
            config = tomllib.load(fh)
        if args.command == 'status':
            show_status(args, config, config_path)
            return 0
        if args.all:
            return generate_all(args, config, config_path)
        generate(args, config, config_path)
    except Exception as exc:
        print(f'ERRO: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
