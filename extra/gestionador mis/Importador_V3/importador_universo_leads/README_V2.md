# Importador Universo Vicidial V2

Esta version elimina completamente `MERGE` y usa:

1. `UPDATE ... FROM`
2. `INSERT ... WHERE NOT EXISTS`

La existencia se valida por `LeadID`, no por telefono. Por lo tanto, el mismo telefono puede crecer historicamente en diferentes listas, campanas o archivos.

## Reintentar sin releer los archivos

Como el staging ya contiene los 871,568 registros, ejecuta:

```bash
python3 importar_universo.py --mode target
```

Tambien puedes usar:

```bash
python3 importar_universo.py --no-files
```

## Procesar todo desde el ZIP

```bash
python3 importar_universo.py \
  --zip "/Users/edgarmontoya/Downloads/Archivo(2).zip" \
  --year 2026 \
  --mode full
```

## Solo cargar staging

```bash
python3 importar_universo.py \
  --zip "/Users/edgarmontoya/Downloads/Archivo(2).zip" \
  --year 2026 \
  --mode stage
```

## Estadisticas

```bash
python3 importar_universo.py --mode stats
```

## Limpiar staging

```bash
python3 importar_universo.py --mode clear-stage
```

Si ejecutas el script sin `--mode`, aparece un menu interactivo.
