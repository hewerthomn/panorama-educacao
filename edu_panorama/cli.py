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
    manifest_files = sorted(output_dir.glob('*/manifest.json'))
    available = []
    for p in manifest_files:
        try:
            obj = json.loads(p.read_text(encoding='utf-8'))
            available.append({'uf': obj['uf'], 'name': obj['state_name'], 'years': obj['years']})
        except (OSError, KeyError, json.JSONDecodeError):
            print(f'AVISO: manifesto inválido ignorado {p}', file=sys.stderr)
    write_json(output_dir / 'index.json', {'states': sorted(available, key=lambda r: r['uf'])})
    print(f'OK: {uf_dir / "manifest.json"}\nPublicável: {output_dir}')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Gerar dados estáticos do panorama de educação.')
    parser.add_argument('--config', default=str(ROOT / 'config.toml'), help='Caminho para config.toml')
    sub = parser.add_subparsers(dest='command', required=True)
    build = sub.add_parser('generate', help='Processar os ZIPs oficiais do Inep por UF')
    build.add_argument('--uf', help='Sigla da UF, ex.: RO, SP, AM')
    build.add_argument('--years', help='Período YYYY:YYYY ou anos separados por vírgula')
    build.add_argument('--no-download', action='store_true', help='Somente ZIPs já presentes em data/raw')
    build.add_argument('--no-network', action='store_true', help='Não consultar a API de localidades do IBGE; requer ZIPs e malha locais')
    build.add_argument('--geojson', help='Malha municipal GeoJSON local (para processamento offline)')
    build.add_argument('--no-geojson', action='store_true', help='Gerar estatísticas sem malha territorial')
    args = parser.parse_args(argv)
    if args.command == 'generate' and args.no_network and (not args.no_download or not (args.geojson or args.no_geojson)):
        parser.error('--no-network requer --no-download e --geojson ou --no-geojson')
    config_path = Path(args.config).resolve()
    try:
        with config_path.open('rb') as fh:
            config = tomllib.load(fh)
        if args.command == 'generate':
            generate(args, config, config_path)
    except Exception as exc:
        print(f'ERRO: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
