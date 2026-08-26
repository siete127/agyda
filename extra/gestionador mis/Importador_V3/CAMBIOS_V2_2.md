# Cambios V2.2

## Actualización incremental desde Vicidial

- El botón **Actualizar desde Vicidial** continúa desde la última fecha/hora existente en `Vicidial_Call_Report`.
- Se eliminó el límite que forzaba el inicio al día actual. Si la última llamada importada es de días anteriores, descargará desde esa fecha.
- Se conserva un traslape configurable mediante `REFRESH_OVERLAP_HOURS` para evitar pérdidas.
- Cuando la tabla está vacía, descarga 30 días históricos por defecto mediante `REFRESH_INITIAL_DAYS`.

## Nombre de lista en la interfaz

- La gráfica **Resultados por lote** ahora agrupa y muestra `list_name`.
- Si `list_name` está vacío, usa `list_id` como respaldo.
- La tarjeta de lotes identificados cuenta nombres de lista.
- El detalle fusionado muestra una sola columna: **Nombre de lista**.
- El ID de lista se mantiene internamente para compatibilidad, pero ya no es el dato principal visible.

## Archivos modificados

- `app/dashboard_service.py`
- `app/config.py`
- `static/dashboard.js`
- `templates/dashboard.html`
