"""CLI independente: python -m edu_panorama ideb generate --uf RO."""
import argparse
import logging
from pathlib import Path
import sys
import tomllib
from ..catalog import UFS
from .etl import generate, state_status, signature

ROOT = Path(__file__).resolve().parents[2]


def editions(value):
    try:
        years = sorted(set(int(y) for y in value.split(',')))
    except ValueError:
        raise argparse.ArgumentTypeError('Use edições separadas por vírgula') from None
    if not years or any(y < 2005 or y % 2 != 1 for y in years):
        raise argparse.ArgumentTypeError('Ideb aceita edições bienais ímpares desde 2005')
    return years


def main(argv=None):
    parser = argparse.ArgumentParser(description='Importar resultados oficiais do Ideb sem regenerar o Censo.')
    parser.add_argument('--config', default=str(ROOT / 'config.toml'))
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('generate', 'status'):
        p = sub.add_parser(command)
        group = p.add_mutually_exclusive_group(required=command == 'generate')
        group.add_argument('--uf', type=str.upper, choices=UFS)
        group.add_argument('--all', action='store_true')
        p.add_argument('--years', type=editions, default=[2021, 2023, 2025])
        p.add_argument('--output-dir', type=Path)
        if command == 'generate':
            p.add_argument('--cache-dir', type=Path)
            p.add_argument('--no-download', action='store_true')
            p.add_argument('--force', action='store_true')
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    try:
        config_path = Path(args.config).resolve()
        config = tomllib.loads(config_path.read_text())
        settings = config.get('ideb', {})
        def resolve(path):
            path = Path(path)
            return path if path.is_absolute() else config_path.parent / path
        settings = {**settings, 'local_files': {k: str(resolve(v)) for k,v in settings.get('local_files', {}).items()}}
        output = args.output_dir or resolve(settings.get('output_dir', 'frontend/public/data/ideb'))
        states = [args.uf] if args.uf else list(UFS)
        if args.command == 'status':
            complete_count = 0
            for uf in states:
                ok, reason = state_status(uf, args.years, output, signature(settings))
                print(f'{uf}: {"COMPLETO" if ok else reason}')
                complete_count += int(ok)
            pending = len(states) - complete_count
            summary = f'{complete_count}/{len(states)} UFs completas'
            if pending:
                summary += f' — {pending} pendentes'
            print(summary)
            return int(pending > 0)
        cache = args.cache_dir or resolve(settings.get('cache_dir', 'data/raw/ideb'))
        generate(states, args.years, output_dir=output, cache_dir=cache, settings=settings,
                 force=args.force, no_download=args.no_download)
        return 0
    except Exception as exc:
        print(f'ERRO Ideb: {exc}', file=sys.stderr)
        return 1
