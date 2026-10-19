PYTHON ?= python3
UF ?= RO
YEARS ?= 2020:2025

.PHONY: install data dev build test
install:
	$(PYTHON) -m pip install -e '.[test]'

# Uso: make data UF=AM YEARS=2022:2025
data:
	$(PYTHON) -m edu_panorama generate --uf $(UF) --years $(YEARS)

dev:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

test:
	$(PYTHON) -m pytest -q
