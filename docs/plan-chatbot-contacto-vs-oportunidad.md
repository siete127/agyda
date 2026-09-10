# Plan — Chatbot: contacto vs. oportunidad, con flujo ramificado y sin duplicados

## El problema

Hoy el chatbot mezcla dos cosas que son distintas:

- **Contacto** = una persona en `CRM_CONTACTOS`. Puede llegar por dudas,
  atención, información — **no siempre quiere comprar**.
- **Oportunidad** = "esta persona quiere que le demos un servicio/solución"
  (`CRM_OPORTUNIDADES`). Solo cuando hay **intención comercial real**.

`recibirLeadChatbot` hace un `INSERT` ciego: **siempre** crea contacto **y**
oportunidad, disparado por *cualquiera* de las 116 respuestas con "señal de
interés" (que incluyen "quiénes somos", "misión y visión", "aliados"…).
Resultado:

1. **Oportunidades falsas** — gente que solo preguntó aparece en el pipeline.
2. **Contactos duplicados** — el mismo email/teléfono entra N veces (un cliente
   actual que vuelve al chat, un prospecto que ya llenó el form web). Es la
   basura que se limpió al inicio de esta sesión ("Edgar"/"Daniela" repetidos).

La causa raíz: **el flujo no está ramificado**. Las 200 respuestas están
apiladas sin caminos ("info / dudas" vs "quiero un servicio"), así que no hay
forma de saber por dónde pasó el visitante.

## Objetivo

1. **Ramificar el flujo** — cada respuesta y cada opción es un nodo visible y
   conectado en el Constructor de flujo; los caminos quedan claros.
2. **El chatbot siempre registra/actualiza el CONTACTO** (dedup por email/tel).
3. **La OPORTUNIDAD solo se crea** cuando el camino recorrido lo marca como
   intención comercial.
4. **Nada se duplica** — ni contacto ni oportunidad.

---

## Parte A — Señal comercial por nodo (marca en el flujo)

Cada nodo del flujo (respuesta, opción del árbol, botón de menú) gana un
atributo nuevo que dice qué genera cuando el visitante llega ahí y deja sus
datos:

| Valor | Qué crea | Ejemplos |
|---|---|---|
| `contacto` (default) | Solo registra/actualiza el contacto | "Quiénes somos", "Misión y visión", "Horario de oficina" |
| `oportunidad` | Contacto **+** oportunidad en `prospecto` | "Quiero cotización", "Precios de desarrollo web", nodo del árbol "Necesito una solución" |
| `ninguno` | No pide datos, solo responde | "Aliados", "Ver portafolio" |

Columnas nuevas (aditivas):

```sql
ALTER TABLE dbo.CHATBOT_RESPUESTAS      ADD RESP_GENERA NVARCHAR(15) NULL;  -- contacto|oportunidad|ninguno
ALTER TABLE dbo.CHATBOT_NODOS           ADD NODO_GENERA NVARCHAR(15) NULL;
ALTER TABLE dbo.CHATBOT_ETIQUETAS_MENU  ADD ETQ_GENERA  NVARCHAR(15) NULL;
```

Migración de datos: `RESP_SENAL_INTERES = 1` → `RESP_GENERA = 'contacto'` por
defecto (conservador — nadie pierde captura, pero deja de crear oportunidades
falsas). El admin luego marca a mano las ~10-15 que sí son comerciales como
`'oportunidad'`.

El `RESP_SENAL_INTERES` se mantiene por compatibilidad (el widget lo sigue
leyendo para *disparar la captura*); `RESP_GENERA` decide *qué se crea al
final*.

---

## Parte B — El widget acumula las "variables del camino"

`leadData` ya lleva `interes`, `presupuestoValor`, `empresa`… Se le añade:

```js
leadData.generaOportunidad = false;  // se pone true si algún nodo del camino lo marca
leadData.caminoNodos = [];           // ['resp:precios','arbol:hw_no_enciende',…] para la transcripción
```

- Cada vez que `mostrarRespuesta` / `avanzarArbol` / `ejecutarAccionBoton`
  pasa por un nodo con `genera === 'oportunidad'` → `leadData.generaOportunidad = true`.
- `dar presupuesto` (rango > 0) también lo pone `true` — dar un número de
  inversión es señal comercial inequívoca.
- `enviarLead` manda `generaOportunidad` en el payload.

Ambas señales persisten en `sessionStorage` con el resto del estado.

---

## Parte C — `recibirLeadChatbot` deduplica y decide

Reescritura del controlador. Antes del INSERT:

### 1. Buscar contacto existente
```sql
SELECT TOP 1 CONT_ID, CONT_ES_CLIENTE, CONT_RESPONSABLE_ID
FROM CRM_CONTACTOS
WHERE CONT_ACTIVO = 1
  AND (
    (@correo   <> '' AND LOWER(LTRIM(RTRIM(CONT_CORREO)))   = LOWER(@correo)) OR
    (@telefono <> '' AND REPLACE(CONT_TELEFONO,' ','')       = REPLACE(@telefono,' ',''))
  )
ORDER BY CONT_ID
```

### 2a. Contacto NUEVO
- `INSERT CRM_CONTACTOS` (como hoy, con notas `[chatbot-web]`).
- Si `generaOportunidad` → `INSERT CRM_OPORTUNIDADES` (`prospecto`, tag
  `chatbot-web`) + interacción de creación + transcripción.
- Si NO → solo el contacto queda, con una nota de la conversación. Sin opp.

### 2b. Contacto EXISTE
- **No** crear contacto. `UPDATE` de campos vacíos (empresa/cargo/tel si el
  chatbot trae algo y estaba NULL) + append a `CONT_NOTAS`
  (`\n[chatbot-web DD/MM] volvió por el chat: <interés>`).
- **Oportunidad:**
  - Si `generaOportunidad` **y** no tiene ya una oportunidad abierta con tag
    `chatbot-web` (`OPO_ETAPA NOT IN ('ganado','perdido')`) → crear una nueva.
  - Si `generaOportunidad` pero **ya tiene** una abierta → **no** crear otra;
    agregar interacción a esa opp ("volvió por el chatbot: …").
  - Si NO `generaOportunidad` → solo la nota en el contacto.
- Si `CONT_ES_CLIENTE = 1` → notificar al `CONT_RESPONSABLE_ID`
  ("un cliente tuyo escribió por el chat").

### 3. Respuesta al widget
`{ ok: true, contId, opoId: <o null>, duplicado: <bool>, creoOportunidad: <bool> }`

El widget puede ajustar el mensaje final: si `!creoOportunidad`, decir
"registré tu consulta, un asesor te contactará" en vez de "tu solicitud entró
al pipeline".

---

## Parte D — Índice para el dedup

```sql
CREATE INDEX IX_CRM_CONTACTOS_CORREO   ON dbo.CRM_CONTACTOS(CONT_CORREO)   WHERE CONT_CORREO   IS NOT NULL;
CREATE INDEX IX_CRM_CONTACTOS_TELEFONO ON dbo.CRM_CONTACTOS(CONT_TELEFONO) WHERE CONT_TELEFONO IS NOT NULL;
```

(Filtered index — no pesa sobre las filas sin correo/teléfono.)

---

## Parte E — El Constructor muestra la ramificación

Con `RESP_GENERA` / `NODO_GENERA` en el payload de `getFlujo`, cada caja del
canvas gana un distintivo:

- borde/chip **verde "→ oportunidad"** en las cajas que generan opp
- chip **gris "→ contacto"** en las que solo registran
- las `ninguno` sin chip

Y el panel lateral (`NodoEditorPanel`) gana un selector "Al dejar sus datos
aquí, el bot crea: [Solo contacto ▾ / Oportunidad / Nada]".

Así el flujo ramificado se ve: un vistazo dice qué caminos son comerciales.

---

## Archivos

**Backend:**
- `services/schemaService.js` — 3 columnas + 2 índices filtrados (aditivo,
  idempotente).
- `controllers/crmLeadMarketingController.js` — `recibirLeadChatbot`
  reescrito con dedup + decisión contacto/oportunidad.
- `controllers/chatbotFlujoController.js` — `getFlujo` expone `genera` por
  nodo; `createNodo`/`updateNodo` lo aceptan.
- `controllers/chatbotController.js` — `getRespuestasPublicas` expone
  `genera`; migración `RESP_SENAL_INTERES=1 → RESP_GENERA='contacto'`.

**Frontend:**
- `pages/chatbot/FlujoVisualTab.tsx` — chip "→ oportunidad / → contacto" en
  las cajas; selector en el panel.
- `pages/chatbot/ChatbotPage.tsx` — el modal de respuesta gana el selector
  "genera".
- `types/`, `services/` — el campo nuevo.

**Widget (`extra/Pagina de Intranet_1/index.html`):**
- `leadData.generaOportunidad` + `caminoNodos`, seteados al pasar por nodos
  marcados y al dar presupuesto.
- `enviarLead` los manda.
- Mensaje final según `creoOportunidad`.

---

## Fases

| Fase | Entregable | Riesgo |
|---|---|---|
| **1** | Dedup en `recibirLeadChatbot` (sin `genera` todavía: contacto siempre se deduplica; oportunidad se crea si el contacto es nuevo O si `generaOportunidad` del payload, que de momento = el `senalInteres` actual). + índices. | Bajo — el widget no cambia aún; solo deja de duplicar contactos |
| **2** | Columnas `*_GENERA` + migración conservadora + `getFlujo`/`getRespuestasPublicas` las exponen. El widget acumula `generaOportunidad` y lo manda. Backend lo respeta. | Medio — toca el widget |
| **3** | El Constructor muestra los chips y el selector; el admin reclasifica las ~15 respuestas comerciales. | Bajo |

Fase 1 sola ya resuelve el "no se duplique" que pediste. Fases 2-3 son la
ramificación contacto/oportunidad.

---

## Verificación

**Fase 1:**
- Lead de chatbot con email nuevo → 1 contacto + (opp si señal). 
- Mismo email otra vez → **0 contactos nuevos**, se actualiza el existente,
  interacción registrada.
- Mismo email, ya con opp abierta chatbot-web → **0 opps nuevas**, interacción
  en la existente.
- Contacto que es cliente → su ejecutivo recibe notificación.
- `node scripts` de conteo antes/después.

**Fases 2-3:** E2E por camino del widget (info → solo contacto; "quiero
cotización" → contacto + opp; dio presupuesto → opp).
