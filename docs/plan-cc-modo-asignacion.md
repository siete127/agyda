# Plan — Modo de asignación por campaña y por canal (Contact Center)

## Lo que se pide

Poder configurar **cómo se reparten las conversaciones** en dos niveles:

### Campaña — 3 modos
| Modo | Qué hace |
|---|---|
| `global` | Hereda del `CCO_CONFIG` global (el default del tenant) |
| `auto` | El sistema asigna cada conversación a un agente disponible (comportamiento actual) |
| `manual` | La conversación cae a la bandeja de **todos** los agentes de la campaña; ellos la "jalan" desde la cola |

### Canal — 3 modos
| Modo | Qué hace |
|---|---|
| `campania` | Hereda del modo de su campaña |
| `auto` | Fuerza auto-asignación para este canal, aunque la campaña sea manual |
| `manual` | Fuerza manual para este canal, aunque la campaña sea auto |

**Resolución en cascada:** `canal.modo` → si es `campania` → `campania.modo` → si es
`global` → `CCO_CONFIG.modo` (default `auto`).

---

## Estado actual

- **Todo es auto-asignación.** `ccRoutingService.rutearInteraccion` y
  `intentarAsignarSiguienteEnCola` siempre buscan agente disponible y asignan.
- `CCO_CANALES.CN_AUTO_ASIGNAR` (bit) **existe pero nadie lo lee** — columna
  muerta.
- `GET /contact-center/interacciones?estado=en_cola` **ya devuelve TODA la
  cola a cualquier agente** (no filtra por grupo del agente). Así que la parte
  de "aparecen a todos" del modo manual ya está — solo falta no auto-asignar.
- `ccInteracciones.tomar` ya permite que un agente jale una interacción de la
  cola (`CI_ESTADO='en_cola'` → `'activa'` con su id). Idempotente, con guard
  "Ya la tomó otro agente".

**Conclusión:** el modo `manual` es casi gratis — es "no llamar a
rutearInteraccion". Lo que falta es la configuración y la cascada.

---

## Diseño

### Schema (aditivo, idempotente)

```sql
-- Modo por campaña: global | auto | manual
IF COL_LENGTH('dbo.CCO_CAMPANIAS','CM2_MODO_ASIGNACION') IS NULL
  ALTER TABLE dbo.CCO_CAMPANIAS ADD CM2_MODO_ASIGNACION NVARCHAR(12) NOT NULL
    CONSTRAINT DF_CM2_MODO DEFAULT 'global';

-- Modo por canal: campania | auto | manual
IF COL_LENGTH('dbo.CCO_CANALES','CN_MODO_ASIGNACION') IS NULL
  ALTER TABLE dbo.CCO_CANALES ADD CN_MODO_ASIGNACION NVARCHAR(12) NOT NULL
    CONSTRAINT DF_CN_MODO DEFAULT 'campania';

-- Default global del tenant: auto | manual
IF COL_LENGTH('dbo.CCO_CONFIG','CF_MODO_ASIGNACION') IS NULL
  ALTER TABLE dbo.CCO_CONFIG ADD CF_MODO_ASIGNACION NVARCHAR(12) NOT NULL
    CONSTRAINT DF_CF_MODO DEFAULT 'auto';

-- Migración: el CN_AUTO_ASIGNAR viejo, si algún canal lo tenía en 0,
-- se traduce a CN_MODO_ASIGNACION='manual'. Luego la columna queda obsoleta
-- (se puede dropear en una limpieza futura; por ahora se deja).
UPDATE dbo.CCO_CANALES SET CN_MODO_ASIGNACION = 'manual'
WHERE CN_MODO_ASIGNACION = 'campania' AND CN_AUTO_ASIGNAR = 0;
```

### Backend — `ccRoutingService`

Nueva función:

```js
// Resuelve el modo efectivo de una interacción: canal -> campaña -> global.
// Devuelve 'auto' | 'manual'.
async function modoAsignacionEfectivo(pool, { canalId, campaniaId }) {
  const cfg = await getConfig(pool);           // CF_MODO_ASIGNACION
  let modo = null;

  if (canalId) {
    const c = await pool.request().input('id', sql.Int, canalId)
      .query('SELECT CN_MODO_ASIGNACION m FROM dbo.CCO_CANALES WHERE CN_ID=@id');
    const m = c.recordset[0]?.m;
    if (m === 'auto' || m === 'manual') return m;    // el canal manda
    // m === 'campania' -> sigue al de la campaña
  }
  if (campaniaId) {
    const c = await pool.request().input('id', sql.Int, campaniaId)
      .query('SELECT CM2_MODO_ASIGNACION m FROM dbo.CCO_CAMPANIAS WHERE CM2_ID=@id');
    const m = c.recordset[0]?.m;
    if (m === 'auto' || m === 'manual') return m;    // la campaña manda
    // m === 'global' -> sigue al global
  }
  return cfg.CF_MODO_ASIGNACION === 'manual' ? 'manual' : 'auto';
}
```

`rutearInteraccion` (línea ~107) — arriba de `buscarAgenteDisponible`:

```js
const modo = await modoAsignacionEfectivo(pool, { canalId: it.canalId, campaniaId: it.campaniaId });
if (modo === 'manual') {
  // No se asigna: queda en_cola visible para todos los agentes de la campaña.
  emitir(tenantKey, 'supervisores', 'cc:cola_cambio', {});
  emitir(tenantKey, 'agentes', 'cc:nueva_en_cola', { interaccionId: it.id });  // ← nuevo broadcast
  return null;
}
```

`intentarAsignarSiguienteEnCola` (línea ~130) — en el loop de la cola, saltar
las interacciones cuyo modo efectivo sea `manual`:

```js
for (const it of cola.recordset) {
  const modo = await modoAsignacionEfectivo(pool, { canalId: it.canalId, campaniaId: it.campaniaId });
  if (modo === 'manual') continue;   // esas las jala un agente a mano
  const agente = await buscarAgenteDisponible(pool, {...});
  ...
}
```

(La query de `cola` necesita traer `CI_CANAL_ID` — hoy trae `grupoId` y
`campaniaId`, falta `canalId`.)

### Backend — broadcast a la bandeja

Hoy `LivechatPage` escucha `cc:nueva_interaccion` (asignada a mí) y refresca
la cola cada 8s. Para modo manual queremos que la cola aparezca **al momento**
para todos:

- Nuevo room `agentes` (todos los sockets de agentes CC — se unen en
  `join_livechat_conversation`? no; se necesita un `joinAgentesCc` o reusar
  algo). **Alternativa más simple:** emitir `cc:nueva_en_cola` **sin room**
  (`io.emit`) — la bandeja ya lo maneja como "alguien se está comunicando".
  Lo hace `LivechatPage` línea ~940: `socket.on('cc:nueva_interaccion',
  handleNuevaEnCola)`. Se agrega `socket.on('cc:nueva_en_cola', handleNuevaEnCola)`.

### Backend — endpoints de config

`ccService.updateCampania` / `ccCampaniasController` — aceptar
`modoAsignacion` ('global'|'auto'|'manual').

`ccService.updateCanal` / `ccCanalesController` — aceptar
`modoAsignacion` ('campania'|'auto'|'manual'). El `autoAsignar` viejo se
mantiene por compat pero se ignora si viene `modoAsignacion`.

`ccService.getConfig` / `updateConfig` — exponer/guardar `CF_MODO_ASIGNACION`.

### Frontend — 3 lugares

1. **Configuración → Contact Center → config general** — un selector
   "Modo de asignación por defecto: Automático / Manual".

2. **CampaniaDetalle** (o el editor de campaña) — selector
   "Asignación: Seguir configuración global / Automática / Manual (los agentes
   jalan de la cola)".

3. **CanalCard** (`ContactCenterTabs.tsx`, ~línea 200) — junto a "Campaña" y
   "Skill destino", un selector "Asignación: Seguir campaña / Automática /
   Manual".

Chips visuales: en la lista de canales/campañas, un badge "Auto" / "Manual"
para verlo de un vistazo.

### Frontend — bandeja del agente

`LivechatPage` — la sección "Bandeja de espera" ya muestra `esperandoCc`
(toda la cola CCO). Con modo manual entrarán más ahí. Solo:
- agregar `socket.on('cc:nueva_en_cola', handleNuevaEnCola)`
- (opcional) un rótulo "toma una para atenderla" cuando hay items en espera

El botón "tomar" de la bandeja ya llama `ccService.tomar` → funciona.

---

## Archivos

**Backend:**
- `services/schemaService.js` — 3 columnas + migración `CN_AUTO_ASIGNAR`.
- `services/ccRoutingService.js` — `modoAsignacionEfectivo`, guard en
  `rutearInteraccion` e `intentarAsignarSiguienteEnCola`, broadcast
  `cc:nueva_en_cola`.
- `controllers/ccCampaniasController.js` — `updateCampania` acepta `modoAsignacion`.
- `controllers/ccCanalesController.js` — `updateCanal` acepta `modoAsignacion`.
- `controllers/ccConfigController.js` (o donde viva `updateConfig`) —
  `CF_MODO_ASIGNACION`.
- `controllers/ccInteraccionesController.js` — el `SELECT` de campaña/canal
  para exponer el modo efectivo en la lista (para el chip).

**Frontend:**
- `services/cc.service.ts` — tipos de los 3 payloads.
- `types/cc.types.ts` — `CCModoAsignacionCampania`, `CCModoAsignacionCanal`.
- `pages/configuracion/ContactCenterTabs.tsx` — selector en `CanalCard` y en
  `CampaniaDetalle`; badge en las listas.
- el componente de config general de CC — selector del default.
- `pages/livechat/LivechatPage.tsx` — listener `cc:nueva_en_cola`.

---

## Fases

| Fase | Entregable | Riesgo | Estado |
|---|---|---|---|
| **1** | Schema + `modoAsignacionEfectivo` + guard en el ruteo. Sin UI todavía: se prueba poniendo el modo a mano en BD. El default `auto` mantiene todo igual. | Bajo — aditivo, default no cambia nada | ✅ `988f81b` |
| **2** | Los 3 selectores de config (canal, campaña, global) + endpoints. | Bajo | ✅ `4010558` |
| **3** | Broadcast `cc:nueva_en_cola` + rótulo en la bandeja + badges. | Bajo | ✅ `b8b3caf` |

Fase 1 sola ya da el comportamiento; 2 y 3 son la UX. **Plan completo.**

---

## Verificación

**Fase 1:**
- Canal en `manual` → escalar desde el widget → la interacción queda
  `en_cola`, **NO** se asigna, aparece en `GET /interacciones?estado=en_cola`
  de cualquier agente.
- Agente hace `tomar` → pasa a `activa` suya, el widget recibe
  `livechat:conversacion_tomada` (fix ya hecho).
- Canal en `auto` (o `campania` con campaña `auto`) → se asigna solo, como hoy.
- Campaña `manual` + canal `campania` → manual.
- Campaña `auto` + canal `manual` → manual (el canal manda).
- Todo en `global`/`campania` + `CF_MODO_ASIGNACION='auto'` → auto (no cambia
  nada vs. hoy).
