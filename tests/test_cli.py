import argparse
import json

from edu_panorama.catalog import INFRASTRUCTURE_FIELDS, SCHEMA_VERSION
from edu_panorama.cli import generate_all, show_status, state_status, write_json
from edu_panorama.etl import aggregate_year
from edu_panorama.sources import locate_zip


def manifest(uf='RO'):
    schools = [{'id': '1', 'municipio': '1100205', 'rede': '3', 'localizacao': '1',
                'matriculas': 20, 'indicators': {'agua_potavel': 0}}]
    return {'uf': uf, 'state_name': uf, 'schema_version': SCHEMA_VERSION,
            'infrastructure_fields': list(INFRASTRUCTURE_FIELDS),
            'years': [2025], 'sources': {'files': {'2025': {}}},
            'records': aggregate_year(schools, 2025, {'agua_potavel': True})}


def status(path):
    return state_status('RO', [2025], path, include_schools=False, require_geojson=False)


def test_old_or_incomplete_enrollment_manifest_requires_regeneration(tmp_path):
    data = manifest()
    file = tmp_path / 'RO/manifest.json'
    write_json(file, data)
    assert status(tmp_path) == (True, 'completo')
    data['schema_version'] = 1
    write_json(file, data)
    assert not status(tmp_path)[0]
    assert 'regenerar' in status(tmp_path)[1]
    data['schema_version'] = SCHEMA_VERSION
    del data['records'][0]['infrastructure']['agua_potavel']
    write_json(file, data)
    assert not status(tmp_path)[0]
    data = manifest()
    data['infrastructure_fields'].reverse()
    write_json(file, data)
    assert not status(tmp_path)[0]


def test_batch_regenerates_old_outputs_and_skips_current(tmp_path, monkeypatch, capsys):
    from edu_panorama import cli
    monkeypatch.setattr(cli, 'UFS', {'RO': (11, 'Rondônia'), 'AC': (12, 'Acre')})
    old = manifest()
    old['schema_version'] = 1
    write_json(tmp_path / 'out/RO/manifest.json', old)
    write_json(tmp_path / 'out/AC/manifest.json', manifest('AC'))
    generated = []

    def generate(args, cfg, path):
        assert args.no_download
        generated.append(args.uf)
        write_json(tmp_path / f'out/{args.uf}/manifest.json', manifest(args.uf))

    monkeypatch.setattr(cli, 'generate', generate)
    args = argparse.Namespace(years=None, force=False, no_geojson=True, no_download=True)
    cfg = {'project': {'years': [2025], 'output_dir': 'out', 'include_schools': False}}
    show_status(args, cfg, tmp_path / 'config.toml')
    assert 'regenerar' in capsys.readouterr().out
    assert generate_all(args, cfg, tmp_path / 'config.toml') == 0
    assert generated == ['RO']
    assert json.loads((tmp_path / 'out/index.json').read_text())['states'][0]['uf'] == 'AC'
    show_status(args, cfg, tmp_path / 'config.toml')
    assert '2/2 UFs completas' in capsys.readouterr().out


def test_existing_inep_zip_never_downloads_again(tmp_path, monkeypatch):
    from edu_panorama import sources
    monkeypatch.setattr(sources, 'download', lambda *a, **kw: (_ for _ in ()).throw(AssertionError('download')))
    for year in (2020, 2025):
        path = tmp_path / f'microdados_censo_escolar_{year}{"_" if year == 2025 else ""}.zip'
        path.write_bytes(b'cached fixture')
        assert locate_zip(tmp_path, year, {}, no_download=False) == path
