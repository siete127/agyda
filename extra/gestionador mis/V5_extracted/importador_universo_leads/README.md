# Importador de universo histórico a Vicidial_Leads_Completo

## Qué hace

1. Lee todos los CSV y XLSX contenidos en un ZIP.
2. Ignora archivos de macOS (`__MACOSX` y `._*`).
3. Normaliza teléfonos a los últimos 10 dígitos.
4. Carga primero a `dbo.Stg_Vicidial_Leads_Archivos`.
5. Evita repetir la misma fila mediante SHA-256.
6. Ejecuta un `MERGE` hacia `dbo.Vicidial_Leads_Completo`.
7. Para CSV usa `Lead` como `LeadID`.
8. Para XLSX sin `LeadID` genera un identificador negativo estable.

## Mapeo principal

| Archivo | Destino |
|---|---|
| Fecha | EntryDate / ModifyDate / LastLocalCallTime |
| Disposicion | Status / StatusDetalle |
| Agente | UserName |
| Lista | ListID / EntryListID / ListName |
| Campana | CampaignID |
| Lead | LeadID |
| Numero Marcado | PhoneNumber / PhoneNormalized |
| NOMBRE | FirstName |
| Estado | State |
| CORREO | Email |
| Conteo Llamadas | CalledCount |

Los XLSX sin fecha usan el mes detectado en el nombre del archivo y el año indicado por `--year`.

## Instalación

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env
```

## Primera prueba: solo staging

```bash
python3 importar_universo.py \
  --zip "/ruta/Archivo(2).zip" \
  --year 2026 \
  --solo-stage
```

Valida:

```sql
SELECT COUNT(*) FROM MIS_Ardaby.dbo.Stg_Vicidial_Leads_Archivos;
SELECT TOP 100 * FROM MIS_Ardaby.dbo.Stg_Vicidial_Leads_Archivos ORDER BY StageID DESC;
```

## Carga completa

```bash
python3 importar_universo.py \
  --zip "/ruta/Archivo(2).zip" \
  --year 2026
```

## Consideraciones

- Ejecutar dos veces el mismo ZIP no duplica filas en staging.
- El `MERGE` actualiza leads existentes y agrega los nuevos.
- Los archivos XLSX no contienen LeadID, campaña/lista completa ni fecha exacta; se infieren del nombre cuando es posible.
- Haz respaldo de `Vicidial_Leads_Completo` antes de la primera carga productiva.
