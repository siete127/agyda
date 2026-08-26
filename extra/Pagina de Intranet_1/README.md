# Página pública — Ardaby Tec

Sitio web público de la empresa (landing, contacto, sección de Vacantes con
postulación, chatbot). Copiado desde `Downloads\INTRANET\INTRANET\Pagina de
Intranet_1` el 2026-08-14 para integrarlo con el backend fusionado en
`AGYDA_desarrollo\BackAgyda`.

No es la intranet interna (esa es `FrontAgyda`) — es el sitio de cara al
público que un candidato o visitante vería.

---

## Cómo levantarla

**No abras `index.html` directo con doble clic ni `file://`.** La sección de
Vacantes y el Chatbot hacen peticiones `fetch('/api/...')` que necesitan un
servidor real haciendo de proxy hacia el backend — con `file://` esas
llamadas fallan silenciosamente.

### 1. Backend primero

El backend (`BackAgyda`) debe estar corriendo en el puerto **8445** antes de
levantar este sitio — aquí solo vive la interfaz, todos los datos (vacantes,
respuestas del chatbot, chat en vivo) vienen de ahí.

```bash
cd AGYDA_desarrollo/BackAgyda
NODE_ENV=development npm run dev
```

### 2. Esta página

```bash
cd AGYDA_desarrollo/extra/"Pagina de Intranet_1"
DEV_PORT=8080 BACKEND_TARGET=http://127.0.0.1:8445 npm run dev
```

Abrir **http://localhost:8080** en el navegador (no `index.html` directo).

> El default de `BACKEND_TARGET` en `scripts/dev-server.js` es
> `http://127.0.0.1:8444`, pero `BackAgyda` corre en **8445** — por eso hay
> que pasar la variable explícita cada vez. Si en el futuro cambia el puerto
> del backend, ajustar aquí también.

### Verificar que quedó bien

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
curl -s http://localhost:8080/api/vacantes
```

Debe responder `200` y la segunda debe traer un JSON con las vacantes reales.

---

## Qué hace `scripts/dev-server.js`

Sirve los archivos estáticos del sitio (`index.html`, `contacto.html`,
`login.html`, `assets/`, `css/`) y reenvía `/api/*`, `/uploads/*` y
`/socket.io/*` hacia el backend — el mismo comportamiento que hace
`web.config` vía IIS URL Rewrite en producción real.

También resuelve URLs limpias (`/contacto` → `contacto.html`) y redirige
enlaces con `.html` explícito a su versión limpia.
