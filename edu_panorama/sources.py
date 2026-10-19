"""Download com cache dos arquivos oficiais; também admite ZIPs locais."""
from pathlib import Path
import requests


def download(url: str, destination: Path, *, timeout: int = 90) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size:
        print(f"  Cache: {destination}")
        return destination
    temp = destination.with_suffix(destination.suffix + ".part")
    print(f"  Download: {url}")
    try:
        with requests.get(url, timeout=(20, timeout), stream=True, verify=False, headers={"User-Agent": "PanoramaEducacao/0.1"}) as response:
            response.raise_for_status()
            with temp.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        output.write(chunk)
        temp.replace(destination)
    except Exception:
        temp.unlink(missing_ok=True)
        raise
    return destination


def get_json(url: str):
    response = requests.get(url, timeout=(15, 75), headers={"User-Agent": "PanoramaEducacao/0.1"})
    response.raise_for_status()
    return response.json()


def locate_zip(raw_dir: Path, year: int, cfg: dict, *, no_download: bool) -> Path:
    # Permite colocar manualmente um ZIP oficial em data/raw/.
    candidates = [raw_dir / f"microdados_censo_escolar_{year}.zip",
                  raw_dir / f"microdados_censo_escolar_{year}_.zip",
                  raw_dir / f"censo_{year}.zip"]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    if no_download:
        raise FileNotFoundError(f"ZIP de {year} não encontrado em {raw_dir}. Remova --no-download ou copie o ZIP oficial.")
    src = cfg["sources"]
    url = src["inep_2025_url"] if year == 2025 else src["inep_url_template"].format(year=year)
    filename = f"microdados_censo_escolar_{year}{'_' if year == 2025 else ''}.zip"
    return download(url, raw_dir / filename)
