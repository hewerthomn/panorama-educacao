"""Obtenção de malhas e nomes de municípios (IBGE)."""
import json
from pathlib import Path
from .catalog import UFS
from .sources import get_json


def municipality_names(uf: str, cfg: dict) -> dict[str, str]:
    url = cfg['sources']['ibge_municipios_url'].format(uf=uf)
    result = get_json(url)
    if not isinstance(result, list):
        raise ValueError('IBGE Localidades retornou dados inesperados')
    return {str(item['id']): item['nome'] for item in result}


def feature_code(feature: dict) -> str | None:
    properties = feature.get('properties') or {}
    for key in ('codarea', 'CD_MUN', 'CD_GEOCMU', 'codigo', 'geocodigo', 'id', 'code'):
        val = properties.get(key)
        if val is not None and str(val).strip().isdigit() and len(str(val).strip()) == 7:
            return str(val).strip()
    val = feature.get('id')
    if val is not None and str(val).strip().isdigit() and len(str(val).strip()) == 7:
        return str(val).strip()
    return None


def geojson_for_uf(uf: str, cfg: dict, *, input_path: Path | None = None) -> dict:
    if input_path:
        with input_path.open(encoding='utf-8') as f:
            doc = json.load(f)
    else:
        url = cfg['sources']['ibge_malhas_url'].format(uf_code=UFS[uf][0])
        doc = get_json(url)
    if doc.get('type') != 'FeatureCollection' or not isinstance(doc.get('features'), list):
        raise ValueError('Malha do IBGE não veio como GeoJSON FeatureCollection. Use --geojson com arquivo GeoJSON válido.')
    features = []
    seen = set()
    for feat in doc['features']:
        code = feature_code(feat)
        if not code or not code.startswith(str(UFS[uf][0])):
            continue
        if code in seen:
            raise ValueError(f'Malha duplicou geocódigo {code}')
        if not feat.get('geometry'):
            continue
        seen.add(code)
        features.append({'type': 'Feature', 'properties': {'id': code}, 'geometry': feat['geometry']})
    if not features:
        raise ValueError(f'Malha não possui feições com códigos IBGE da UF {uf}. Verifique o formato de propriedades.')
    return {'type': 'FeatureCollection', 'features': features}
