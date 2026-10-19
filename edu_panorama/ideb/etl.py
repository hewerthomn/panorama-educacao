"""Publicação estática transacional por UF, com arquivos verificados por SHA-256."""
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
from ..catalog import UFS
from .catalog import SCHEMA_VERSION, SOURCE_FILES, SOURCE_PAGE, STAGES
from .parser import parse
from .sources import locate_source, fingerprint

log = logging.getLogger(__name__)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    temp.replace(path)


def signature(settings):
    return hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()


def state_status(uf, years, output_dir, source_signature=None):
    try:
        root = Path(output_dir) / uf
        manifest = json.loads((root / 'manifest.json').read_text())
        if manifest['schema_version'] != SCHEMA_VERSION or manifest['uf'] != uf:
            return False, 'esquema incompatível'
        if source_signature and manifest.get('source_signature') != source_signature:
            return False, 'configuração de fontes alterada'
        if not set(years) <= set(manifest['years']): return False, 'edições incompletas'
        for stage in STAGES:
            for level in ('state', 'municipality', 'school'):
                meta = manifest['files'][stage][level]
                path = root / meta['path']
                if path.parent != root or fingerprint(path) != meta['sha256']:
                    return False, 'arquivo ausente ou corrompido'
                data = json.loads(path.read_text())
                if data['schema_version'] != SCHEMA_VERSION or data['uf'] != uf or data['stage'] != stage or data['level'] != level or len(data['records']) != meta['count']:
                    return False, 'conteúdo incompatível'
        return True, 'completo'
    except (OSError, ValueError, KeyError, TypeError):
        return False, 'não gerado ou incompleto'


def refresh_index(output_dir):
    states = []
    for path in sorted(Path(output_dir).glob('*/manifest.json')):
        try:
            m = json.loads(path.read_text())
            if state_status(m['uf'], m['years'], output_dir)[0]:
                states.append({'uf': m['uf'], 'name': m['state_name'], 'years': m['years'], 'stages': m['stages']})
        except (OSError, ValueError, KeyError):
            log.warning('Manifesto inválido ignorado: %s', path)
    write_json(Path(output_dir) / 'index.json', {'schema_version': SCHEMA_VERSION, 'states': states})


def generate(ufs, years, *, output_dir, cache_dir, settings=None, force=False, no_download=False):
    settings = settings or {}
    source_signature = signature(settings)
    pending = []
    for uf in ufs:
        complete, reason = state_status(uf, years, output_dir, source_signature)
        if complete and not force:
            log.info('[%s] PULADO: completo', uf)
        else:
            log.info('[%s] Processar: %s', uf, 'forçado' if force else reason)
            pending.append(uf)
    if not pending:
        refresh_index(output_dir)
        return
    # Cada planilha nacional é lida uma única vez, inclusive no modo --all.
    records = defaultdict(list)
    sources = {}
    for key, (level, stage, _) in SOURCE_FILES.items():
        path, url = locate_source(key, cache_dir, urls=settings.get('urls'), local_files=settings.get('local_files'), no_download=no_download)
        log.info('Processando %s (%s)', key, path.name)
        rows, mappings = parse(path, level=level, stage=stage, years=years, ufs=set(pending), source_id=key)
        sources[key] = {'url': url, 'filename': path.name, 'sha256': fingerprint(path), 'mapping': mappings}
        for row in rows:
            records[row['uf']].append(row)
        log.info('%s: %d observações', key, len(rows))
    # Nenhuma UF é publicada se uma das fontes falhar.
    for uf in pending:
        for stage in STAGES:
            for level in ('state', 'municipality', 'school'):
                if not any(r['stage'] == stage and r['level'] == level for r in records[uf]):
                    raise ValueError(f'{uf}/{stage}/{level}: nenhuma observação')
    for uf in pending:
        root = Path(output_dir) / uf
        files = {stage: {} for stage in STAGES}
        municipalities = {}
        for row in records[uf]:
            if row['municipality_id']:
                municipalities[row['municipality_id']] = row['municipality_name']
        for stage in STAGES:
            for level in ('state', 'municipality', 'school'):
                rows = sorted((r for r in records[uf] if r['stage'] == stage and r['level'] == level),
                              key=lambda r: (r['year'], r['municipality_id'] or '', r['school_id'] or '', r['network']))
                if not rows: raise ValueError(f'{uf}/{stage}/{level}: nenhuma observação')
                payload = {'schema_version': SCHEMA_VERSION, 'uf': uf, 'years': sorted(years),
                           'stage': stage, 'level': level, 'records': rows}
                digest = signature(payload)[:12]
                filename = f'{level}_{stage}_{digest}.json'
                write_json(root / filename, payload)
                files[stage][level] = {'path': filename, 'sha256': fingerprint(root / filename), 'count': len(rows)}
        manifest = {'schema_version': SCHEMA_VERSION, 'uf': uf, 'uf_code': str(UFS[uf][0]),
                    'state_name': UFS[uf][1], 'years': sorted(years), 'stages': STAGES,
                    'generated_at': datetime.now(timezone.utc).isoformat(), 'source_page': SOURCE_PAGE,
                    'source_signature': source_signature, 'sources': sources, 'files': files,
                    'municipalities': [{'id': k, 'name': v} for k,v in sorted(municipalities.items())],
                    'notes': ['Notas territoriais oficiais; nunca médias das escolas.',
                              'N/D não é zero. Marcadores originais de não divulgação são preservados.',
                              'Cobertura escolar considera somente linhas das planilhas oficiais, não todas as escolas do Censo.',
                              'Cruzamento futuro por código Inep, edição e etapa. Infraestrutura descreve a escola no mesmo ano, sem inferir oferta de etapa.']}
        write_json(root / 'manifest.json', manifest)
        active = {meta['path'] for stages in files.values() for meta in stages.values()} | {'manifest.json'}
        for old in root.glob('*.json'):
            if old.name not in active: old.unlink()
        log.info('[%s] OK: %d observações', uf, len(records[uf]))
    refresh_index(output_dir)
