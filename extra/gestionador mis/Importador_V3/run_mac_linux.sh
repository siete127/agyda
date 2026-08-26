#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
[ -f .env ] || cp .env.example .env
printf '\nConfigura el archivo .env y despues ejecuta:\n'
printf 'source .venv/bin/activate\n'
printf 'python3 main.py --desde 2026-07-13 --hasta 2026-07-13\n'
