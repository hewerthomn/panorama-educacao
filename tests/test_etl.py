import io
import json
from pathlib import Path
from zipfile import ZipFile
import pytest
from edu_panorama.cli import main, years_list
from edu_panorama.etl import load_year, aggregate_year, bool_value
from edu_panorama.geo import feature_code


def make_zip(path: Path, files: dict[str, str]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, 'w') as zf:
        for name, content in files.items():
            zf.writestr(name, content.encode('utf-8'))


CSV_2024 = '''CO_ENTIDADE;NO_ENTIDADE;CO_UF;CO_MUNICIPIO;NO_MUNICIPIO;TP_DEPENDENCIA;TP_LOCALIZACAO;TP_SITUACAO_FUNCIONAMENTO;IN_AGUA_POTAVEL;IN_INTERNET;QT_MAT_BAS
10001;Escola A;11;1100205;Porto Velho;3;1;1;1;0;100
10002;Escola B;11;1100205;Porto Velho;2;2;1;0;1;40
10003;Escola C;11;1100015;Alta Floresta D'Oeste;3;2;1;;1;20
10004;Escola D;11;1100015;Alta Floresta D'Oeste;2;1;2;1;1;25
10005;Outra UF;12;1200401;Rio Branco;3;1;1;1;1;30
'''
CSV_2025 = '''CO_ENTIDADE|NO_ENTIDADE|SG_UF|CO_MUNICIPIO|NO_MUNICIPIO|TP_DEPENDENCIA|TP_LOCALIZACAO|TP_SITUACAO_FUNCIONAMENTO|IN_AGUA_POTAVEL|IN_INTERNET
10001|Escola A|RO|1100205|Porto Velho|3|1|1|1|1
10003|Escola C|RO|1100015|Alta Floresta D'Oeste|3|2|1|1|0
10005|Outra UF|AC|1200401|Rio Branco|3|1|1|1|1
'''
MATRICULAS_2025 = '''CO_ENTIDADE|SG_UF|QT_MAT_BAS
10001|RO|115
10003|RO|25
10005|AC|50
'''
GEO = {'type': 'FeatureCollection', 'features': [
    {'type': 'Feature', 'properties': {'codarea': '1100205'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[-63, -9],[-62,-9],[-62,-8],[-63,-9]]]}},
    {'type': 'Feature', 'properties': {'codarea': '1100015'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[-62, -11],[-61,-11],[-61,-10],[-62,-11]]]}},
]}


def test_rates_and_valid_denominator(tmp_path):
    path = tmp_path / 'censo_2024.zip'
    make_zip(path, {'raiz/microdados_ed_basica_2024.csv':CSV_2024})
    schools, available, _ = load_year(path, 2024, 'RO', 5)
    assert len(schools) == 3
    assert available['agua_potavel'] is True
    assert available['biblioteca'] is False
    assert bool_value('') is None
    rows = aggregate_year(schools, 2024, available)
    water = [r['metrics']['agua_potavel'] for r in rows]
    assert sum(r[0] for r in water) == 1
    assert sum(r[1] for r in water) == 2
    assert sum(r['schools'] for r in rows) == 3


def test_separate_2025_enrollments(tmp_path):
    path = tmp_path / 'censo_2025.zip'
    make_zip(path, {'root/Tabela_Escola_2025.csv': CSV_2025,
                    'root/Tabela_Matricula_2025.csv': MATRICULAS_2025})
    schools, available, name = load_year(path, 2025, 'RO', 100)
    assert len(schools) == 2
    assert name.endswith('Tabela_Escola_2025.csv')
    assert sorted(r['matriculas'] for r in schools) == [25, 115]
    assert not available['biblioteca']


def test_geo_code():
    assert feature_code(GEO['features'][0]) == '1100205'


def test_full_offline_cli(tmp_path, monkeypatch):
    raw = tmp_path / 'raw'
    make_zip(raw / 'microdados_censo_escolar_2024.zip', {'microdados_ed_basica_2024.csv':CSV_2024})
    make_zip(raw / 'microdados_censo_escolar_2025_.zip', {'Tabela_Escola_2025.csv':CSV_2025,
                'Tabela_Matricula_2025.csv':MATRICULAS_2025})
    geo = tmp_path / 'ro.geojson'; geo.write_text(json.dumps(GEO),encoding='utf-8')
    config = tmp_path / 'config.toml'
    config.write_text('''[project]
uf = "RO"
years = [2024,2025]
raw_dir = "raw"
output_dir = "public/data"
chunksize = 2
include_schools = true
[sources]
inep_url_template = "https://example.com/{year}.zip"
inep_2025_url = "https://example.com/2025.zip"
ibge_municipios_url = "https://example.com/ibge/{uf}"
ibge_malhas_url = "https://example.com/geo/{uf_code}"
''', encoding='utf-8')
    monkeypatch.setattr('edu_panorama.cli.municipality_names', lambda uf,cfg: {'1100205':'Porto Velho', '1100015':"Alta Floresta D'Oeste"})
    result = main(['--config',str(config),'generate','--no-download','--geojson',str(geo)])
    assert result == 0
    data = json.loads((tmp_path/'public/data/RO/manifest.json').read_text())
    assert data['years'] == [2024,2025]
    assert sorted(i['key'] for i in data['indicators'] if 2024 in i['available_years']) == ['agua_potavel','internet']
    assert sum(r['schools'] for r in data['records'] if r['year']==2024) == 3
    assert len(json.loads((tmp_path/'public/data/RO/municipios.geojson').read_text())['features']) == 2
    assert len(json.loads((tmp_path/'public/data/RO/schools/2025.json').read_text())['schools']) == 2
    assert json.loads((tmp_path/'public/data/index.json').read_text())['states'][0]['uf'] == 'RO'


def test_year_validation():
    assert years_list('2020:2023') == [2020,2021,2022,2023]
    assert years_list('2025,2024') == [2024,2025]
    with pytest.raises(Exception): years_list('2024:2023')
