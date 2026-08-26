# Importador de universo histórico a Vicidial_Leads_Completo

## Actualización automática desde Vicidial

El dashboard sincroniza AzulCC SQL automáticamente cada 15 minutos, únicamente
de **10:00 a 19:00**. Fuera de ese horario no realiza consultas y deja la
siguiente ejecución preparada para las 10:00. Este intervalo coincide con la
frecuencia de actualización de la réplica; consultar con mayor frecuencia no
produciría datos más nuevos.

La parte superior muestra el estado **En vivo** y la cuenta regresiva. Al
terminar cada sincronización, el dashboard actualiza sus indicadores sin que el
usuario tenga que presionar un botón.

El intervalo se puede cambiar en `.env`:

```env
AUTO_REFRESH_ENABLED=true
AUTO_REFRESH_MINUTES=15
AUTO_REFRESH_START_HOUR=10
AUTO_REFRESH_END_HOUR=19
```

El programador funciona mientras el servicio web esté encendido.

## Fuentes de llamadas

La fuente automática principal es
`AzulCC.vicidial_snapshot.vicidial_list`. Se consulta cada 15 minutos dentro
del horario configurado, toma los últimos 31 días y consolida los teléfonos en
la campaña `60035`.

El reporte HTTP del primer Vicidial queda pausado de forma predeterminada. En
el dashboard puede activarse para las ejecuciones automáticas o descargarse
manualmente sin cambiar su estado automático.

```env
AZUL_SNAPSHOT_TABLE=AzulCC.vicidial_snapshot.vicidial_list
AZUL_LISTS_TABLE=AzulCC.vicidial_snapshot.vicidial_lists
AZUL_LINKED_SERVER=AZULCCSERVER
AZUL_CAMPAIGN_ID=60035
AZUL_LOOKBACK_DAYS=31
LEGACY_REPORT_AUTO_ENABLED=false
```

Al revisar o anular un lote se consideran llamadas de ambas fuentes: el Call
Report ya almacenado y `last_local_call_time` de AzulCC.

El dashboard relaciona `vicidial_list.list_id` con
`vicidial_lists.list_id` para mostrar `list_name`, descripción y campaña. Si
una lista nueva todavía no llegó al catálogo de la réplica, muestra su
`list_id` temporalmente en lugar de clasificarla como “Sin coincidencia”.
La actualización automática sincroniza primero `vicidial_lists` desde el
Linked Server y después actualiza el universo. El proceso hace `UPDATE/INSERT`
sin borrar listas históricas; si el origen está temporalmente fuera de línea,
conserva el último catálogo disponible y continúa con las llamadas.

La opción **Anular de forma segura** trabaja en segundo plano, muestra el avance
por etapas y puede detenerse antes de aplicar cambios. La actualización final
usa una transacción corta y reintentos automáticos ante deadlocks. No fuerza
una descarga HTTP: usa el último Call Report disponible y consulta AzulCC
directamente. El resultado permanece visible para su revisión y puede
descartarse con el botón **Cerrar notificación**.

## Regla de reciclaje

El modo de reciclaje usa `UltimoStatus` de la marcación más reciente cuando
existe; en caso contrario usa el status del maestro. Puede volver a seleccionar
cualquier teléfono válido que no esté en un lote `PENDIENTE`, excepto:

- ventas: `VE`, `EVE`, `EVESA`, `SALE`, `VENTA` y códigos `VESA*`;
- no llamar: códigos `DNC*` o descripciones DNC / no llamar.

La vista previa muestra el universo filtrado, pendientes bloqueados,
ventas/DNC excluidos, teléfonos inválidos y total reciclable.

La opción **Volver a marcar pendientes** permite incluir deliberadamente
teléfonos que ya pertenecen a uno o más lotes `PENDIENTES`. Está apagada por
defecto y solicita confirmación antes de generar el CSV, porque un mismo
teléfono puede quedar simultáneamente en varios lotes activos. Aun con esta
opción, ventas, DNC y teléfonos inválidos permanecen excluidos.

## Dashboard de decisión por lote

La parte superior de **Generación de lotes** prioriza los lotes históricos por
teléfono normalizado único. El score combina capacidad para cubrir el objetivo,
conversión relativa, contactabilidad, días de enfriamiento, saturación por
intentos y solapamiento con otros lotes. También muestra nivel de confianza y
frescura de las fuentes.

Hay dos políticas:

- **Solo liberados**: usa registros liberados y excluye pendientes, ventas
  aprobadas y DNC.
- **Todo reciclable**: evalúa el universo completo aplicando las mismas
  protecciones de ventas, DNC y pendientes.

**Usar este lote** prepara el generador en modo reciclaje y limita la vista
previa a los teléfonos elegibles del lote elegido; nunca genera el CSV sin la
confirmación del usuario. El lote nuevo guarda `FiltrosOrigenJSON`, la versión
de la regla de elegibilidad y la fecha de corte para conservar trazabilidad.

Las métricas pesadas se materializan en `dbo.KpiLoteDecisionSnapshot`. La
pantalla lee la última fotografía en aproximadamente un segundo y, cuando
supera 20 minutos o cambia un lote, la actualización se ejecuta en segundo
plano.

## Vista personalizada de generación de lotes

Cada agrupador de **Generación de lotes** puede minimizarse de forma
independiente. La barra **Mi vista** también permite mostrar todo, minimizar
todo o dejar abierto únicamente **Exportar lote**.

La selección se conserva en el navegador para las siguientes visitas. Los
agrupadores analíticos minimizados no solicitan sus datos hasta que el usuario
los vuelve a abrir, lo que reduce consultas innecesarias para quienes trabajan
principalmente con el formulario de exportación. Esta preferencia es local al
navegador y perfil actual; podrá sincronizarse entre equipos cuando exista una
cuenta de usuario en la aplicación.

El encabezado de **Generación de lotes** también conserva un alcance global de
campaña, mes/año de `EntryDate` y mes de última gestión. Los mismos controles
alimentan los catálogos en cascada, la vista previa y la exportación, por lo que
no existen filtros duplicados ni configuraciones contradictorias. El mes de
última gestión se consulta desde la columna materializada e indexada
`UltimoMesGestion`, sin convertir fechas sobre todo el universo en cada
consulta. Solo se actualizan los catálogos secundarios que ya fueron abiertos o
tienen una selección; los demás se consultan bajo demanda. **Limpiar alcance**
elimina campaña y ambos periodos, y la configuración se guarda en el navegador
actual.

La **Vista previa** materializa una sola vez los candidatos filtrados dentro de
la sesión SQL y obtiene del mismo resultado tanto el resumen como la muestra de
100 registros. Esto evita recorrer repetidamente el maestro global. La cantidad
solicitada está limitada a 50,000 registros y un timeout real se presenta como
un aviso recuperable con la recomendación de aplicar campaña, lista o mes, sin
exponer el error ODBC `HYT00`.

Al generar un lote, **Lista destino** tiene prioridad como nombre visible en el
histórico y como base del archivo CSV. El archivo conserva un sufijo de
fecha/hora para impedir que una exportación posterior sobrescriba otra. Si
**Lista destino** está vacía, se mantiene la nomenclatura anterior basada en
**Nombre del lote** o `LOTE_AAAAMMDD_HHMMSS`.

## Priorización del universo por EntryDate

El módulo **Mejores meses de EntryDate para marcar** compara cada cohorte
mensual usando una sola fila por teléfono normalizado. Muestra elegibles, nunca
marcados, cobertura de la muestra, contacto único, aprobados por cada 1,000
teléfonos marcados y confianza estadística.

Las llamadas y ventas siempre se comparan dentro de la misma ventana temporal.
Una tasa alta con cobertura menor al 2% se clasifica como **Piloto**, aunque el
porcentaje aparente sea superior. **Usar este mes** prepara el filtro de
`EntryDate` y la vista previa en modo reciclaje; no genera un CSV
automáticamente.

El cálculo completo se guarda en `dbo.KpiUniverseDecisionSnapshot`, se precarga
en memoria y se renueva en segundo plano después de cada sincronización de
AzulCC, al iniciar con una fotografía vencida y, como respaldo, al superar una
hora. El navegador revisa la fotografía materializada cada 30 segundos, sin
volver a recorrer las tablas fuente.

Los cálculos ejecutivos de universo y lotes comparten un coordinador para no
competir entre sí sobre SQL Server. Si ocurre un `HYT00`, el trabajo se
reintenta una vez con espera gradual. Una petición web nunca ejecuta el cálculo
pesado: sirve la última fotografía disponible o devuelve estado `preparing`
mientras el trabajo termina en segundo plano.

El desempeño usa las llamadas recientes disponibles tanto en Call Report como
en `AzulCC.vicidial_snapshot.vicidial_list`. El detalle por lista resuelve el
nombre oficial mediante `AzulCC.vicidial_snapshot.vicidial_lists`, muestra
siempre `list_name` junto con `list_id` y conserva ventas, DNC y pendientes
fuera del universo elegible.

Para las filas provenientes de AzulCC, `EntryDate` ya no se reemplaza con la
última interacción. Los registros afectados por sincronizaciones anteriores se
agrupan y filtran temporalmente con `COALESCE(FirstSeenDate,EntryDate)`, mientras
`LastInteractionDate` mantiene la gestión más reciente.

## Carga mensual desde CSV

La pantalla **Importar registros mensuales** permite seleccionar el mes
`YYYY-MM` que corresponde al EntryDate o cohorte del archivo. Reconoce los dos
perfiles de CSV de Vicidial:

- reporte general con `Numero Marcado`, `Campana`, `Lista` y `Disposicion`;
- lista de resultados con `Telefono`, `Nombre`, `Apellidos` y
  `Nombre Disposicion`.

La importación mantiene una sola fila global por teléfono en
`Vicidial_Leads_Completo`. Los teléfonos que vuelven a aparecer se registran en
`Vicidial_Lead_MonthlyCohort`, por mes, lista y teléfono; por eso no se pierde
su EntryDate histórico ni se duplica el maestro.

Al terminar se muestran teléfonos únicos, nuevos globales, existentes en meses
anteriores, marcados antes del mes elegido, repetidos dentro del archivo e
inválidos. La comparación es informativa: no cambia `ActiveList` ni agrega,
libera o bloquea registros en los controles de lotes. Los filtros de mes y
lista consultan tanto el EntryDate original como la membresía mensual.

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
