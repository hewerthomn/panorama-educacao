import io
import json
from pathlib import Path
from zipfile import ZipFile
import pytest
from edu_panorama.cli import main, years_list
from edu_panorama.etl import load_year, aggregate_year, bool_value
from edu_panorama.geo import feature_code
from edu_panorama.catalog import UFS, INDICATORS, INFRASTRUCTURE_FIELDS


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


def test_annual_school_contract_supports_longitudinal_identity(tmp_path):
    """O browser pode vincular o mesmo Inep mesmo com troca de classificação em 2025."""
    initial_zip, final_zip = tmp_path / '2020.zip', tmp_path / '2025.zip'
    make_zip(initial_zip, {'microdados_ed_basica_2020.csv': CSV_2024})
    changed = CSV_2025.replace(
        '10001|Escola A|RO|1100205|Porto Velho|3|1|1|1|1',
        '10001|Novo nome|RO|1100015|Outro município|2|2|1|0|1')
    make_zip(final_zip, {'Tabela_Escola_2025.csv': changed,
                         'Tabela_Matricula_2025.csv': MATRICULAS_2025})
    before = {s['id']: s for s in load_year(initial_zip, 2020, 'RO', 1)[0]}
    after = {s['id']: s for s in load_year(final_zip, 2025, 'RO', 1)[0]}
    assert before.keys() & after.keys() == {'10001', '10003'}
    assert before['10001']['name'] == 'Escola A'
    assert after['10001']['name'] == 'Novo nome'
    assert before['10001']['municipio'] != after['10001']['municipio']
    assert before['10001']['rede'] != after['10001']['rede']
    assert before['10001']['localizacao'] != after['10001']['localizacao']
    assert before['10001']['indicators']['agua_potavel'] == 1
    assert after['10001']['indicators']['agua_potavel'] == 0
    assert before['10003']['indicators']['agua_potavel'] is None
    # Mudança de layout/tabela de matrículas não altera o contrato dos indicadores.
    assert set(before['10001']['indicators']) == set(after['10001']['indicators']) == set(INDICATORS)


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


def infrastructure(row, metric='agua_potavel'):
    return dict(zip(INFRASTRUCTURE_FIELDS, row['infrastructure'][metric]))


def school(code, answer, enrollments, mun='1100205', rede='3', area='1'):
    return {'id': code, 'municipio': mun, 'rede': rede, 'localizacao': area,
            'matriculas': enrollments, 'indicators': {'agua_potavel': answer}}


def test_enrollment_classification_and_dimensions():
    schools = [school('1', 1, 100), school('2', 0, 40), school('3', None, 20),
               school('4', 0, None), school('5', 1, None), school('6', None, None),
               school('7', 0, 10, rede='2', area='2'),
               school('8', 1, 5, mun='1100015')]
    rows = aggregate_year(schools, 2024, {'agua_potavel': True})
    assert len(rows) == 3
    result = next(r for r in rows if r['rede'] == '3' and r['municipio'] == '1100205')
    assert result['metrics']['agua_potavel'] == [2, 4]
    assert infrastructure(result) == {
        'schools_with': 2, 'schools_without': 2, 'schools_unknown': 2,
        'enrollments_with': 100, 'enrollments_without': 40,
        'enrollments_unknown': 20, 'enrollments_valid': 140,
        'schools_missing_enrollments': 3,
    }
    assert result['matriculas_valid'] == 3
    assert infrastructure(next(r for r in rows if r['rede'] == '2'))['enrollments_without'] == 10
    assert infrastructure(next(r for r in rows if r['municipio'] == '1100015'))['enrollments_with'] == 5


def test_missing_indicator_and_missing_enrollments_are_separate():
    row = aggregate_year([school('1', 0, 40), school('2', None, None)], 2024, {})[0]
    assert row['metrics']['agua_potavel'] == [0, 0]
    assert infrastructure(row)['enrollments_unknown'] == 40
    assert infrastructure(row)['enrollments_valid'] == 0
    assert infrastructure(row)['schools_without'] == 0
    assert infrastructure(row)['schools_missing_enrollments'] == 1


def test_duplicate_school_cannot_inflate_aggregates():
    duplicate = school('1', 0, 40)
    with pytest.raises(ValueError, match='duplicada'):
        aggregate_year([duplicate, duplicate], 2024, {'agua_potavel': True})


@pytest.mark.parametrize('value,expected', [('', None), ('NA', None), ('-1', None),
    ('10.05', None), ('1.5', None), ('0', 0), ('0.0', 0), ('100.0', 100)])
def test_unknown_enrollments_are_not_zero(value, expected):
    from edu_panorama.etl import num_value
    assert num_value(value) == expected


@pytest.mark.parametrize('year', range(2020, 2025))
def test_legacy_years_keep_enrollment_totals(tmp_path, year):
    path = tmp_path / f'censo_{year}.zip'
    make_zip(path, {f'microdados_ed_basica_{year}.CSV': CSV_2024})
    schools, availability, _ = load_year(path, year, 'RO', 1)
    rows = aggregate_year(schools, year, availability)
    assert sum(infrastructure(r)['enrollments_valid'] for r in rows) == 140
    assert sum(infrastructure(r)['enrollments_without'] for r in rows) == 40
    assert sum(infrastructure(r)['enrollments_unknown'] for r in rows) == 20


@pytest.mark.parametrize('uf', UFS)
def test_uf_filter_is_generic(tmp_path, uf):
    code = str(UFS[uf][0])
    path = tmp_path / 'censo_2024.zip'
    csv = ('CO_ENTIDADE;CO_MUNICIPIO;TP_DEPENDENCIA;TP_LOCALIZACAO;IN_AGUA_POTAVEL;QT_MAT_BAS\n'
           f'1;{code}00001;3;1;0;15\n')
    make_zip(path, {'microdados_ed_basica_2024.csv': csv})
    schools, availability, _ = load_year(path, 2024, uf, 1)
    assert infrastructure(aggregate_year(schools, 2024, availability)[0])['enrollments_without'] == 15


def test_2025_repeated_aggregate_rows_are_not_summed(tmp_path):
    path = tmp_path / 'censo_2025.zip'
    make_zip(path, {'Tabela_Escola_2025_V2.csv': CSV_2025,
                    'Tabela_Matricula_2025_V2.csv': MATRICULAS_2025 + '10001|RO|115\n'})
    schools, availability, _ = load_year(path, 2025, 'RO', 1)
    assert sum(infrastructure(r)['enrollments_with'] for r in aggregate_year(schools, 2025, availability)) == 140


@pytest.mark.parametrize('extra', ['10001|RO|999\n', '10001|RO|\n'])
def test_2025_conflicting_enrollment_totals_fail(tmp_path, extra):
    path = tmp_path / 'censo_2025.zip'
    make_zip(path, {'Tabela_Escola_2025.csv': CSV_2025,
                    'Tabela_Matricula_2025.csv': MATRICULAS_2025 + extra})
    with pytest.raises(ValueError, match='divergentes'):
        load_year(path, 2025, 'RO', 1)


def test_2025_missing_enrollment_table_keeps_unknown(tmp_path):
    path = tmp_path / 'censo_2025.zip'
    make_zip(path, {'Tabela_Escola_2025.csv': CSV_2025})
    schools, availability, _ = load_year(path, 2025, 'RO', 1)
    rows = aggregate_year(schools, 2025, availability)
    assert all(s['matriculas'] is None for s in schools)
    assert sum(infrastructure(r)['schools_missing_enrollments'] for r in rows) == 2
    assert sum(r['matriculas_valid'] for r in rows) == 0


def test_unknown_enrollments_with_known_unclassified_total_are_not_zero():
    row = aggregate_year([school('1', 0, None), school('2', None, 100)],
                         2025, {'agua_potavel': True})[0]
    counts = infrastructure(row)
    assert counts['enrollments_without'] is None
    assert counts['enrollments_valid'] is None
    assert counts['enrollments_unknown'] == 100
    assert counts['schools_missing_enrollments'] == 1


@pytest.mark.parametrize('metric', INDICATORS)
def test_every_binary_indicator_supports_enrollment_perspective(metric):
    schools = [school('1', None, 100), school('2', None, 20), school('3', None, 40)]
    for item, answer in zip(schools, (1, 0, None)):
        item['indicators'] = {metric: answer}
    row = aggregate_year(schools, 2025, {metric: True})[0]
    counts = infrastructure(row, metric)
    assert counts['enrollments_without'] == 20
    assert counts['enrollments_valid'] == 120
    assert counts['enrollments_unknown'] == 40
    assert row['metrics'][metric] == [1, 2]
