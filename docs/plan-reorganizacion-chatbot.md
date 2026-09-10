# Plan — Reorganización de la configuración del Chatbot (UX/IA)

## Contexto

Hoy `/chatbot` (y su gemelo en Configuración → Tecnología) expone **5 pestañas
paralelas** sin jerarquía:

| Pestaña | Contenido | Tabla |
|---|---|---|
| Respuestas | 200 items en lista plana, cada uno con `RESP_ID` técnico, ~15 keywords, texto ES/EN, botones de texto libre, flag "señal de interés" | `CHATBOT_RESPUESTAS` (200) |
| Menú del Widget | 4 botones que ve el visitante al abrir | `CHATBOT_ETIQUETAS_MENU` (4) |
| Dashboard | métricas + tabla de leads del CRM | — (lee CRM) |
| Árbol de Diagnóstico | nodos + opciones, otro editor | `CHATBOT_NODOS` (6) / `CHATBOT_NODO_OPCIONES` (5) |
| Flujo Visual | canvas React Flow: cajas de respuesta/etiqueta/nodo/campaña | `CHATBOT_FLUJO_CONEXIONES` (0) |

**Problemas concretos:**

1. **Lista plana de 200.** Sin categorías, sin buscador, sin señal de cuáles
   fallan. Scroll infinito.
2. **El `RESP_ID` técnico** (`saludo_hola`, `como_funciona_bot`) es un campo que
   el usuario escribe a mano. Jerga expuesta.
3. **Piezas del mismo bot editadas por separado.** El menú inicial es *lo primero
   que ve el cliente* pero vive en la 2ª pestaña. El árbol es un 3er paradigma
   de edición. Para responder "¿qué pasa si preguntan el precio?" hay que cruzar
   4 pestañas.
4. **Flujo Visual es read-heavy** (mueves cajas, no editas contenido) y las
   conexiones de árbol son read-only ahí. `CHATBOT_FLUJO_CONEXIONES` tiene 0
   filas — nadie lo usa.
5. **Dashboard solo cuenta.** No dice *qué* respuesta falló ni *dónde* abandona
   la gente. No hay feedback 👍/👎 ni captura de "preguntas sin match".
6. **Reglas de escalamiento hardcodeadas** en el HTML de la página pública
   (`turnosSinLead >= 3`, `PRESUPUESTO_VALORES`, textos del saludo).

## Objetivo

Reorganizar el **frontend** en 3 secciones que reflejen *cómo se piensa un bot*,
no cómo está la BD. Cambios de backend mínimos y aditivos (columnas nuevas +
2 tablas de telemetría). **No se toca el flujo del widget público** salvo para
enviar eventos de telemetría.

---

## Arquitectura nueva — 3 secciones

```
/chatbot
├── Conversación   (Saludo + Menú inicial + Temas + Diagnóstico guiado)
├── Escalamiento   (reglas de paso a humano + campañas + horario)
└── Rendimiento    (embudo + respuestas que fallan + preguntas sin match + leads)

    [+ "Mapa completo" — el Flujo Visual actual, como vista avanzada opcional]
```

---

### SECCIÓN 1 — Conversación

**Reemplaza:** pestañas "Respuestas" + "Menú del Widget" + "Árbol de Diagnóstico".

Una sola pantalla que se lee de arriba abajo, en el orden en que el bot conversa.
Cada bloque es colapsable.

#### 1a. Saludo
Tarjeta simple con el texto del saludo ES/EN, editable inline.
- **Fuente hoy:** hardcodeado en `index.html` (`TEXTOS.es.saludo`).
- **Cambio:** nueva tabla `CHATBOT_CONFIG` (clave/valor) o reusar una fila
  especial. El widget lo lee de `GET /api/chatbot/config/publica`.

#### 1b. Menú inicial
Los botones que ve el visitante al abrir el chat. Drag para reordenar, toggle
activo, editar texto + acción.
- **Fuente:** `CHATBOT_ETIQUETAS_MENU` (ya existe, ya tiene `ETQ_ORDEN`,
  `ETQ_ACTIVA`, `ETQ_TIPO`).
- **Cambio de UI:** mover el editor de etiquetas aquí tal cual. El wizard "nueva
  campaña web" (hoy enterrado en el modal) se mueve a la sección Escalamiento y
  aquí solo se elige una campaña ya creada.

#### 1c. Temas  ← las 200 respuestas, agrupadas
Acordeón por **categoría**. Buscador arriba (por título, texto o keyword).

```
🔍 [ buscar tema o palabra clave... ]

▸ Servicios (12)
▸ Precios y cotización (8)
▸ La empresa (5)
▸ Soporte y diagnóstico (23)
▾ Sin categoría (152)  ⚠️ organiza estas
    ┌────────────────────────────────────────────
    │ 💬 Saludo inicial                    [👍 —  · editar · ⋮]
    │    Responde a: hola, buenas, buenos días… (+12)
    │    Sin botón de acción
    ├────────────────────────────────────────────
    │ 💬 Costo de un proyecto              [👍 87% · editar · ⋮]
    │    Responde a: precio, costo, cuánto cuesta… (+6)
    │    🎯 Señal de interés — al responder, pide datos de contacto
    │    → botón "Quiero cotización" → captura de lead
    └────────────────────────────────────────────
```

Cambios:
- **`RESP_CATEGORIA`** (`NVARCHAR(60) NULL`) — columna nueva. Acordeón colapsable.
  "Sin categoría" resaltado, se vacía a medida que el usuario clasifica.
- **`RESP_TITULO`** (`NVARCHAR(120) NULL`) — nombre legible. Si está vacío, se usa
  las primeras palabras del texto. El `RESP_ID` se **autogenera** del título al
  crear (slug), deja de ser un campo del formulario (se sigue mostrando en modo
  edición como "id técnico", solo lectura).
- El modal de edición de respuesta agrega: selector de categoría (con opción
  "nueva categoría…"), y un campo **título**. Todo lo demás igual.
- Cada fila muestra **inline**: a qué keywords responde (colapsado con "+N"), si
  es señal de interés, y a dónde lleva su botón (resolviendo
  `CHATBOT_FLUJO_CONEXIONES` o el texto libre `RESP_BOTONES`). Ya no hace falta
  ir a Flujo Visual.
- La tasa 👍 sale de la sección Rendimiento (feature 2b).

#### 1d. Diagnóstico guiado
El árbol, presentado como un sub-flujo colapsado con resumen ("8 nodos ·
termina en: crear caso / escalar a chat"). Botón "editar el árbol" abre el
editor actual (`ArbolDiagnosticoTab`) — **sin cambios de fondo**, solo deja de
ser pestaña de primer nivel.
- Mejora menor: el nodo terminal de tipo "crear ticket" gana la opción "crear
  **caso** de Atención al Cliente" (aprovecha el módulo Casos unificado). Fuera
  de alcance de este plan si se quiere acotar — se puede dejar como está.

---

### SECCIÓN 2 — Escalamiento

**Nuevo.** Junta todo lo relacionado con pasar a un humano, hoy disperso entre
el HTML, el modal de etiquetas y Configuración → Contact Center.

| Bloque | Qué | Fuente hoy → después |
|---|---|---|
| Regla de rendición | "Tras N respuestas sin entender, ofrecer agente" (N configurable, hoy fijo en 3) | `index.html` → `CHATBOT_CONFIG` |
| Mensaje de sugerencia | El texto que usa esa regla | `index.html` → `CHATBOT_CONFIG` |
| Campañas de Chat en Vivo | Qué campañas/skills atienden el chat escalado + el wizard "nueva campaña web" | Modal de etiqueta → aquí |
| Horario de atención | Rango + mensaje fuera de horario (hoy no existe) | nuevo, `CHATBOT_CONFIG` |
| Rangos de presupuesto | Los 4 rangos + su valor `OPO_VALOR` representativo | `index.html` (`PRESUPUESTO_VALORES`) → `CHATBOT_CONFIG` (JSON) |

Todo esto es una pantalla de formulario simple. El widget lee
`GET /api/chatbot/config/publica` al iniciar.

---

### SECCIÓN 3 — Rendimiento

**Evoluciona el Dashboard actual.**

#### 3a. Embudo de conversación
```
Abrieron el chat        1,240  ████████████████████ 100%
Interactuaron             890  ██████████████       72%
Dieron un dato            310  █████                25%
Lead enviado              180  ███                  15%
```
- Requiere telemetría de sesión (feature 3d).

#### 3b. Respuestas que fallan
Tabla ordenada por 👎 o por "no entendí después de mostrarla":
```
Respuesta              👍    👎   veces
Costo de proyecto      12    47   59    [mejorar]
Horario de oficina      3    22   25    [mejorar]
```
- **`CHATBOT_FEEDBACK`** — tabla nueva:
  `FBK_ID, FBK_RESP_PK, FBK_SESION_TOKEN, FBK_UTIL BIT, FBK_FECHA`.
- El widget muestra 👍/👎 discretos bajo cada respuesta enlatada
  (`mostrarRespuesta`); al tocar → `POST /api/chatbot/feedback` (público).

#### 3c. Preguntas sin respuesta
Lo que la gente escribió y **no hizo match** — la mina de oro para mejorar el bot:
```
"cuanto tardan en entregar"      8 veces   [crear respuesta]
"tienen sucursal en monterrey"   5 veces   [crear respuesta]
```
- **`CHATBOT_SIN_MATCH`** — tabla nueva:
  `SNM_ID, SNM_TEXTO_NORM, SNM_TEXTO_EJEMPLO, SNM_VECES, SNM_ULTIMA_FECHA, SNM_RESUELTO BIT`.
- El widget, cuando `buscarRespuesta` devuelve null en estado `explorar`, hace
  `POST /api/chatbot/sin-match` con el texto. El backend hace UPSERT por
  `SNM_TEXTO_NORM` (normalizado: minúsculas, sin acentos, sin signos).
- "Crear respuesta" abre el modal de nueva respuesta con el texto como primera
  keyword y marca `SNM_RESUELTO=1`.

#### 3d. Telemetría de sesión (para el embudo)
- **`CHATBOT_EVENTOS`** — tabla nueva y ligera:
  `EVT_ID, EVT_SESION_TOKEN, EVT_TIPO, EVT_FECHA`.
  Tipos: `abrio`, `interactuo`, `dio_dato`, `lead_enviado`, `escalo_humano`,
  `abrio_arbol`.
- El widget dispara `POST /api/chatbot/evento` en cada hito (fire-and-forget, no
  bloquea la UI). Token = un uuid por pestaña, ya existe la lógica de sesión.
- Retención: un cron mensual borra eventos > 90 días (o se deja crecer — son
  filas de ~40 bytes).

#### 3e. Leads
La tabla que ya existe (`chatbotService.getLeads`), sin cambios.

---

## Flujo Visual → "Mapa completo"

Se conserva `FlujoVisualTab` **tal cual**, pero:
- Deja de ser pestaña de primer nivel.
- Se accede por un botón "Ver mapa completo del bot" desde la sección
  Conversación.
- Se reencuadra en la UI como herramienta de **auditoría** ("así se conecta
  todo"), no de edición diaria.

---

## Cambios de backend (todos aditivos)

### Migraciones en `ensureChatbotSchema` (patrón `IF COL_LENGTH(...) IS NULL ALTER TABLE ADD`)

```sql
-- CHATBOT_RESPUESTAS
ALTER TABLE dbo.CHATBOT_RESPUESTAS ADD RESP_CATEGORIA NVARCHAR(60) NULL;
ALTER TABLE dbo.CHATBOT_RESPUESTAS ADD RESP_TITULO    NVARCHAR(120) NULL;
```

### Tablas nuevas

```sql
CHATBOT_CONFIG      (CFG_CLAVE PK, CFG_VALOR NVARCHAR(MAX), CFG_FECHA)
CHATBOT_FEEDBACK    (FBK_ID PK, FBK_RESP_PK FK, FBK_SESION_TOKEN, FBK_UTIL BIT, FBK_FECHA)
CHATBOT_SIN_MATCH   (SNM_ID PK, SNM_TEXTO_NORM UNIQUE, SNM_TEXTO_EJEMPLO, SNM_VECES, SNM_ULTIMA_FECHA, SNM_RESUELTO BIT)
CHATBOT_EVENTOS     (EVT_ID PK, EVT_SESION_TOKEN, EVT_TIPO, EVT_FECHA)   -- índice en (EVT_TIPO, EVT_FECHA)
```

### Endpoints nuevos

| Método | Ruta | Auth | Uso |
|---|---|---|---|
| GET | `/api/chatbot/config/publica` | pública | widget lee saludo, reglas, presupuesto, horario |
| GET/PUT | `/api/chatbot/config` | admin + `configuracion:configurar` | editor |
| POST | `/api/chatbot/feedback` | pública | 👍/👎 |
| POST | `/api/chatbot/sin-match` | pública | pregunta sin respuesta (UPSERT) |
| POST | `/api/chatbot/evento` | pública | hito del embudo |
| GET | `/api/chatbot/rendimiento` | admin + `chatbot:ver` | embudo + fallos + sin-match |
| PATCH | `/api/chatbot/respuestas/:pk` | admin | ya existe, +acepta `categoria`, `titulo` |
| GET | `/api/chatbot/categorias` | admin | lista distinct de `RESP_CATEGORIA` para el selector |

### Cambios en el widget (`extra/Pagina de Intranet_1/index.html`)

- Al iniciar: `fetch('/api/chatbot/config/publica')` y usar esos valores en vez
  de las constantes `TEXTOS.es.saludo`, `PRESUPUESTO_VALORES`, `turnosSinLead>=3`.
  Fallback a los valores actuales si el fetch falla (mismo patrón que ya usa
  para el menú).
- `mostrarRespuesta`: añadir 👍/👎 → `POST /feedback`.
- `handleUserMessageInterno` estado `explorar` sin match → `POST /sin-match`.
- Hitos → `POST /evento` (abrió, interactuó, dio dato, lead, escaló).
- **Nada más cambia del flujo conversacional.**

---

## Fases y esfuerzo

| Fase | Entregable | Backend | Frontend | Riesgo |
|---|---|---|---|---|
| **1** | Sección Conversación: `RESP_CATEGORIA` + `RESP_TITULO`, acordeón por categoría, buscador, autogenerar id, unir Saludo/Menú/Árbol en una pantalla. Flujo Visual pasa a "Mapa completo". | 2 columnas + `CHATBOT_CONFIG` + 3 endpoints config | pantalla nueva `ConversacionTab`, refactor de `ChatbotPage` | Bajo — aditivo |
| **2** | Feedback 👍/👎 + preguntas sin match. Widget envía ambos. | `CHATBOT_FEEDBACK`, `CHATBOT_SIN_MATCH` + 2 endpoints públicos + widget | tabla "respuestas que fallan" + "preguntas sin match" en Rendimiento | Medio — toca el HTML público |
| **3** | Embudo + telemetría. | `CHATBOT_EVENTOS` + 2 endpoints + widget hitos | gráfico de embudo | Medio |
| **4** | Sección Escalamiento: mover reglas hardcodeadas del HTML a `CHATBOT_CONFIG`, horario de atención, rangos de presupuesto configurables. | endpoints config (ya de fase 1) | pantalla `EscalamientoTab` + widget lee config | Medio — cambia comportamiento del widget |

Fase 1 es el salto de UX más grande y el más seguro. Fases 2-4 agregan la parte
de "saber qué mejorar" y requieren tocar el `index.html` público.

---

## Verificación por fase

**Fase 1:**
1. `/chatbot` muestra 3 secciones (Conversación / Escalamiento / Rendimiento) +
   botón "Mapa completo".
2. En Conversación: Saludo editable, Menú inicial con drag, Temas en acordeón
   por categoría con buscador.
3. Crear una respuesta nueva: no pide "id", pide título; el id se ve
   autogenerado en modo edición.
4. Asignar categoría a una respuesta "Sin categoría" → se mueve de grupo.
5. El widget público sigue funcionando idéntico (el saludo ahora viene de
   `/config/publica`, con fallback).
6. `tsc -b`, `vite build`, sin nuevos errores de eslint. Schema bootstrap
   idempotente (correr 2 veces, sin error).

**Fases 2-4:** cada una con su E2E contra el widget + backend.

---

## Fuera de alcance (otra conversación)

- Matching por intención / tolerancia a typos / embeddings — el buscador por
  substring se queda; este plan es de organización, no de motor de NLU.
- Deduplicar el lead del chatbot contra `CRM_CONTACTOS` (era la propuesta "A/B"
  anterior) — complementa esto pero es independiente.
- Reconocer al cliente logueado en el widget — idem.
