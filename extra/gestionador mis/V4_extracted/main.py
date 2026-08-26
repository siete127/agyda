# -*- coding: utf-8 -*-
import argparse
import sys
from datetime import datetime

from app import config
from app.import_service import run_import


def parse_date(value: str):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise argparse.ArgumentTypeError("La fecha debe tener formato YYYY-MM-DD")


def parse_hour(value: str) -> int:
    try:
        hour = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("La hora debe ser un numero entre 0 y 23")
    if not 0 <= hour <= 23:
        raise argparse.ArgumentTypeError("La hora debe estar entre 0 y 23")
    return hour


def main() -> int:
    parser = argparse.ArgumentParser(description="Descarga e importa Call Reports de Vicidial")
    parser.add_argument("--desde", type=parse_date, required=True)
    parser.add_argument("--hasta", type=parse_date, required=True)
    parser.add_argument("--hora-desde", type=parse_hour, default=0)
    parser.add_argument("--hora-hasta", type=parse_hour, default=23)
    parser.add_argument("--campana", action="append", dest="campanas")
    args = parser.parse_args()
    if args.desde > args.hasta or (args.desde == args.hasta and args.hora_desde > args.hora_hasta):
        parser.error("Rango de fecha/hora no valido")
    start = datetime.combine(args.desde, datetime.min.time()).replace(hour=args.hora_desde)
    end = datetime.combine(args.hasta, datetime.min.time()).replace(hour=args.hora_hasta, minute=59)
    try:
        result = run_import(start, end, args.campanas or config.VICIDIAL_CAMPAIGNS)
        print("Leidos: {read} | Insertados: {inserted} | Duplicados: {duplicates}".format(**result))
        return 0
    except Exception as exc:
        print("ERROR: {0}".format(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
