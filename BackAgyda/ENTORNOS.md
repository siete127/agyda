# Entornos: Desarrollo ↔ Producción

Runbook de referencia para moverse entre desarrollo (esta máquina local) y producción
(Windows Server real). Generado tras dejar el sistema funcionando en desarrollo el
2026-08-07, conectado a la misma BD y SMTP de producción (a propósito, no son datos
de prueba).

---

## Estado actual (2026-08-07): desarrollo, funcionando

- Backend `back-intra` corriendo en PM2, en este equipo, con `NODE_ENV=development`.
- Carga `.env.development` (no `.env`) gracias al cambio en `server.js`.
- Puerto backend: **8444** (coincide con el proxy de Vite en `intranet-react/vite.config.ts`).
- Base de datos: la misma de producción, pero apuntando a la **IP** `74.208.195.73`
  en vez del hostname `WIN-NRURD70NF62` (ese hostname no resuelve por DNS fuera de
  la red del servidor).
- SMTP: el mismo de producción (Gmail `tecardaby@gmail.com`), sin cambios.
- CORS: ampliado para aceptar cualquier IP privada de LAN (`192.168.x.x`, `10.x.x.x`,
  `172.16-31.x.x`) **solo cuando `NODE_ENV !== 'production'`**. Necesario porque el
  frontend a veces se accede desde `http://192.168.100.5:5173` (IP de LAN) y no solo
  `localhost`.

---

## Archivos que se tocaron

| Archivo | Qué se hizo | Toca producción? |
|---|---|---|
| `BackIntranet/server.js` | Carga `.env.{NODE_ENV}` si existe, si no cae a `.env` | No — con fallback seguro |
| `BackIntranet/.env.development` | **Nuevo.** Copia de `.env` con `NODE_ENV=development`, `PORT=8444` y `DB_SERVER` por IP | No — archivo nuevo, `.env` original intacto |
| `BackIntranet/.env` | Sin tocar | — |
| `BackIntranet/config/cors.js` | Agregada excepción de IP privada de LAN, gateada por `!isProd` | No — la excepción no aplica si `NODE_ENV=production` |
| `intranet-react/src/pages/dashboard/DashboardPage.tsx` | Fix de bug: `id_evento` faltante en `parseEvento`, y endpoint cambiado de `/eventos` a `/eventos/proximos` | No — solo frontend, bug real no relacionado con entorno |

---

## Cómo volver a PRODUCCIÓN

Producción vive en el **Windows Server real** (no en esta máquina), gestionado por su
propio PM2 allá. Esta máquina local normalmente **no debería tener `back-intra`
corriendo** al mismo tiempo que trabajas — es solo para desarrollo/pruebas.

### 1. Apagar el backend local (esta máquina)

```bash
pm2 delete back-intra
pm2 save
```

Esto evita que quede un proceso de desarrollo corriendo sin que te des cuenta.

### 2. Verificar que no se tocó nada en el servidor real

Los cambios de esta sesión fueron **solo en tu máquina local** (`.env.development` es
nuevo, `.env` de producción no se tocó). Si en algún momento se despliega código nuevo
al Windows Server (`git pull` / copia manual allá), confirma que:

- `BackIntranet/.env` en el servidor real sigue con `NODE_ENV=production` y el
  `DB_SERVER=WIN-NRURD70NF62` (el hostname sí resuelve *dentro* de la red del server).
- `server.js` (con el cambio de carga de env) es compatible: si no existe
  `.env.production` en el servidor, cae automáticamente a `.env` — no requiere crear
  nada nuevo allá.
- `config/cors.js`: la excepción de LAN nueva **no se activa en producción** porque
  está condicionada a `!isProd` (`isProd = NODE_ENV === 'production'`). No hace falta
  revertir nada de seguridad ahí.

### 3. Confirmar producción sigue sana

Desde cualquier máquina:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://intranet.ardabytec.vip/
```
Debe responder `200`.

### 4. Si necesitas replicar el fix de eventos duplicados en producción

El bug de `DashboardPage.tsx` (key `id_evento` faltante + endpoint `/eventos` en vez
de `/eventos/proximos`) es un bug real, no algo de solo-desarrollo. Cuando hagas
release normal a producción, ese fix va incluido — no requiere pasos especiales.

---

## Cómo volver a poner el sistema en DESARROLLO (como está ahorita)

Si el día de mañana esto se vuelve a romper o alguien más necesita levantarlo:

### 1. Backend

```bash
cd "INTRANET V2.3/intranet - copia/BackIntranet"
```

Confirma que existe `.env.development` con:
- `NODE_ENV=development`
- `PORT=8444`
- `DB_SERVER=74.208.195.73` (IP, **no** `WIN-NRURD70NF62`)
- El resto de variables (`DB_*`, `SMTP_*`) igual que `.env` de producción — a propósito.

Si no existe, créalo copiando `.env` y aplicando esos dos cambios (`NODE_ENV`, `PORT`,
`DB_SERVER`).

Arrancar con PM2:
```bash
pm2 delete back-intra 2>/dev/null
NODE_ENV=development pm2 start server.js --name back-intra --env development
pm2 save
```

Verificar que levantó bien:
```bash
curl -s http://localhost:8444/
# Debe responder 200 con el HTML de login de Ventas
```

Ver logs si algo falla:
```bash
pm2 logs back-intra --lines 50 --nostream
```

### 2. Frontend

```bash
cd intranet-react
npm run dev
```

Vite corre en el puerto **5173** y proxea `/api`, `/uploads`, `/audio` hacia
`http://localhost:8444` (ver `vite.config.ts`). Si cambias el `PORT` del backend,
tienes que cambiar también el `target` en `vite.config.ts` para que coincidan.

### 3. Checklist rápido si el login vuelve a fallar

1. **502 Bad Gateway** → el backend no está escuchando en el puerto que Vite espera
   (8444). Revisa `pm2 list` y `.env.development` → `PORT`.
2. **500 Internal Server Error** al hacer login →
   - Si el log dice `Not allowed by CORS`: estás entrando desde una IP que no está en
     la whitelist. Confirma que `NODE_ENV=development` esté realmente aplicado al
     proceso PM2 (`pm2 env 0 | grep NODE_ENV`), porque la excepción de LAN de
     `cors.js` solo aplica fuera de producción.
   - Si el log dice `ENOTFOUND WIN-NRURD70NF62`: `.env.development` no se está
     cargando (revisa `server.js`) o `DB_SERVER` quedó con el hostname en vez de la
     IP.
3. **Puerto ocupado (`EADDRINUSE`) que reaparece solo** → hay otro proceso PM2 con el
   mismo `server.js` corriendo (`pm2 list`). Bórralo con `pm2 delete <nombre>` antes
   de levantar uno nuevo, o vas a estar peleando contra el auto-restart de PM2.

Comando único para verificar todo de un jalón:
```bash
pm2 list
pm2 env 0 | grep -E "NODE_ENV|PORT|DB_SERVER"
curl -s -o /dev/null -w "backend: %{http_code}\n" http://localhost:8444/
```
