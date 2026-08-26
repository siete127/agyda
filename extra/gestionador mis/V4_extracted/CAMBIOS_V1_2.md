# Cambios V1.2

- El filtro **ListID origen** fue reemplazado por **Lista origen**.
- Las opciones del filtro ahora provienen de `Vicidial_Leads_Completo.ListName`.
- El backend filtra por `ListName`; el CSV de carga conserva su columna `list_id` requerida por Vicidial.
- Se agregó el filtro multiselección **Mes gestión**.
- El mes gestión se calcula con `EntryDate` en formato `AAAA-MM`.
- La vista previa muestra el nombre de la lista y el mes gestión.
- Se corrigió la inconsistencia entre `list_id`, `listname` y el modelo de la API.
