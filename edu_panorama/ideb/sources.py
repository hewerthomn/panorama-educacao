"""Download TLS, cache e integridade dos arquivos oficiais do Ideb."""
import hashlib
import logging
from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZipFile, is_zipfile
import requests
from .catalog import DEFAULT_URLS

log = logging.getLogger(__name__)


def fingerprint(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def validate_file(path):
    path = Path(path)
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f'Arquivo vazio ou ausente: {path}')
    if path.suffix.lower() in ('.zip', '.xlsx'):
        if not is_zipfile(path):
            raise ValueError(f'ZIP/XLSX inválido: {path}')
        with ZipFile(path) as archive:
            if archive.testzip():
                raise ValueError(f'CRC inválido: {path}')
            if path.suffix.lower() == '.zip' and not any(
                    n.lower().endswith(('.xlsx', '.xls', '.csv')) for n in archive.namelist()):
                raise ValueError(f'ZIP sem planilha suportada: {path}')
    elif path.suffix.lower() not in ('.csv', '.xls'):
        raise ValueError(f'Formato não suportado: {path.suffix}')
    return path


def locate_source(key, cache_dir, *, urls=None, local_files=None, no_download=False):
    url = (urls or {}).get(key, DEFAULT_URLS[key])
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.inep.gov.br'):
        raise ValueError(f'A fonte deve ser HTTPS oficial do Inep: {url}')
    configured = (local_files or {}).get(key)
    path = Path(configured) if configured else Path(cache_dir) / Path(parsed.path).name
    if path.exists() or configured:
        validate_file(path)
        log.info('Reutilizado %s', path)
        return path, url
    if no_download:
        raise FileNotFoundError(f'Sem cache para {key}: {path}; configure [ideb.local_files] ou baixe a fonte oficial.')
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.part')
    log.info('Baixando %s', url)
    try:
        with requests.get(url, stream=True, timeout=(20, 180)) as response:
            response.raise_for_status()
            with temp.open('wb') as output:
                for chunk in response.iter_content(1024 * 1024):
                    output.write(chunk)
        # Validar com a extensão original antes de publicar no cache.
        candidate = temp.with_name('validate-' + path.name)
        temp.replace(candidate)
        try:
            validate_file(candidate)
            candidate.replace(path)
        finally:
            candidate.unlink(missing_ok=True)
    except (requests.RequestException, OSError, ValueError) as exc:
        temp.unlink(missing_ok=True)
        raise RuntimeError(f'Falha ao baixar {url}: {exc}. Verifique a cadeia de certificados (REQUESTS_CA_BUNDLE) ou utilize arquivo local.') from exc
    return path, url
