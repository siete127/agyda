# Importador de universo histórico a Vicidial_Leads_Completo

## Actualización automática desde Vicidial

El dashboard ejecuta **Actualizar desde Vicidial** automáticamente cada 30 minutos,
únicamente de **10:00 a 19:00**. Fuera de ese horario no realiza consultas y deja
la siguiente ejecución preparada para las 10:00.
En la parte superior se muestra una cuenta regresiva, el estado de la ejecución y
un botón para **Pausar** o **Reanudar** el programador. La actualización manual
sigue disponible y el sistema impide que una ejecución manual y una automática
se dupliquen.

El intervalo se puede cambiar en `.env`:

```env
AUTO_REFRESH_ENABLED=true
AUTO_REFRESH_MINUTES=30
AUTO_REFRESH_START_HOUR=10
AUTO_REFRESH_END_HOUR=19
```

El programador funciona mientras el servicio web esté encendido.

## Uso desde el dashboard web

Inicia el dashboard y abre la pestaña **Importar universo**. Selecciona un ZIP,
Excel (`.xlsx`, `.xlsm`, `.xls`, `.xlsb`) o texto separado por comas (`.csv`,
`.txt`), indica el año de referencia y presiona **Seleccionar e importar**. La pantalla muestra
el archivo en proceso, filas leídas, nuevas en staging e inserciones/actualizaciones
del universo. Solo se permite una importación simultánea.

Durante la carga se muestra porcentaje, filas procesadas, velocidad, tiempo
estimado y etapa actual. El botón **Detener proceso** cancela de forma cooperativa
al terminar el bloque SQL en curso; lo ya confirmado permanece en staging y se
reutiliza al volver a cargar el mismo archivo.

Las campañas vacías o cuyo identificador comienza con `1006` o `1009` se
normalizan automáticamente a `60035`.
La recarga del mismo archivo se identifica por archivo y número de fila para no
duplicar el staging.

## Higiene global de teléfonos

`dbo.Stg_Vicidial_Leads_Archivos` conserva las interacciones históricas para
auditoría. `dbo.Vicidial_Leads_Completo` funciona como maestro global y mantiene
una sola fila por `PhoneNormalized`.

Cuando llega una interacción nueva:

- Si es más reciente, actualiza campaña, lista, estatus y fecha de gestión.
- Si es más antigua, permanece en el historial pero no sustituye la gestión actual.
- `CalledCount` conserva el valor máximo.
- Los datos personales existentes se conservan y solo se completan campos vacíos.
- `FirstSeenDate` guarda la primera aparición y `LastInteractionDate` la gestión más reciente.

La unicidad global está protegida por el índice filtrado
`UX_Vicidial_Leads_Completo_PhoneGlobal`.

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
