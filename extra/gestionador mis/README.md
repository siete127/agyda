# Gestion Vicidial

Aplicacion web para:

- Importar Call Report de Vicidial a SQL Server sin duplicados.
- Mostrar aprobadas y rechazadas del dia cruzadas por telefono.
- Generar lotes CSV sin repetir telefonos ya exportados.
- Revisar lotes contra Call Report y liberar solo los no marcados.

## Instalacion en macOS

```bash
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 web.py
```

Abrir: `http://127.0.0.1:8020`

## Importacion manual

```bash
python3 main.py --desde 2026-07-13 --hasta 2026-07-13 --hora-desde 0 --hora-hasta 23 --campana ARDABYTE
```

## Notas

- Requiere Microsoft ODBC Driver 18 for SQL Server.
- No se incluye `.env`; conserva tus credenciales actuales o copia `.env.example`.
- Los CSV se crean en `downloads/`.

## Control de lotes

- Al generar un CSV, cada teléfono se registra como `PENDIENTE`.
- Los teléfonos `PENDIENTE` o `MARCADO` no vuelven a salir en lotes normales.
- La acción **Anular de forma segura** actualiza primero Call Report.
- Si un teléfono tuvo llamadas después de generar el lote, queda `MARCADO` y continúa bloqueado.
- Si no tuvo llamadas, queda `LIBERADO` y vuelve a estar disponible.
