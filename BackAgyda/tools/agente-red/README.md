# Agente de monitoreo de red — AGYDA

Script de PowerShell que corre en una PC de la oficina y cada **2 minutos**
reporta al backend el estado de internet, la velocidad, la latencia y los
dispositivos conectados. Los datos se ven en **Intranet → Internet y redes →
Monitoreo en vivo**.

## Por qué un agente y no el backend

El backend de la intranet vive fuera de la red de la oficina: no puede pinguear
los dispositivos internos ni medir el enlace real. El agente corre *dentro* de
la LAN y le manda las mediciones.

## Instalación (PC Windows de la oficina, siempre encendida)

### Opción A — una línea (recomendado)

Abre **PowerShell como Administrador** y pega:

```powershell
irm https://intranet.ardabytec.vip/agente-red/install.ps1 | iex
```

El instalador:
1. Crea `C:\AGYDA\agente-red\`
2. Instala el **Speedtest CLI de Ookla** (winget o descarga directa)
3. Te pide la **API Key**, el **EnlaceId** y el nombre del agente
4. Registra la tarea programada (cada 2 min, como SYSTEM, arranca al boot)
5. Corre una prueba

### Opción B — manual

1. Copia esta carpeta a `C:\AGYDA\agente-red\`.
2. Instala Speedtest CLI: `winget install Ookla.Speedtest.CLI`
   (o baja `speedtest.exe` de https://www.speedtest.net/apps/cli y ponlo en la carpeta).
3. Copia `agente-red.config.example.json` → `agente-red.config.json` y edítalo
   (pega la `ApiKey`, ajusta `EnlaceId`, `AgenteNombre`, y el bloque `Router*` si
   quieres leer la tabla DHCP del router).
4. Como Administrador:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```
   (solo registra la tarea; salta la config si ya existe).

## De dónde sale la API Key

Intranet → **Configuración → …API Keys** (la misma sección que usan los tickets
por API). Crea una llamada "Agente red oficina" y **cópiala en ese momento** (no
se vuelve a mostrar). O pídele a un dev que corra
`node BackAgyda/scripts/crear-api-key-red.js "Agente red oficina"`.

## De dónde sale el EnlaceId

Intranet → Internet y redes → pestaña **Enlaces**. Crea el enlace de la oficina
(nombre, proveedor, velocidad) y usa su id. Si lo dejas en `null`, las mediciones
se guardan como genéricas (sin asociar a un enlace ni abrir incidentes
automáticos de caída).

## Fase 2 — tabla DHCP del router

Si pones `HabilitarRouter: true` y las credenciales del router, el agente además
intenta leer la **lista completa de dispositivos desde el router** (no solo lo
que ve por ARP). La clase `RouterProbe`:

1. **Identifica la marca** por el banner HTTP, la cabecera `Server`, el
   `WWW-Authenticate`, el `<title>` de la página y por SSDP/UPnP.
2. **Prueba primero el método de esa marca**, luego el resto, en este orden:

| Router | Métodos que intenta |
|---|---|
| MikroTik | RouterOS REST API (`/rest/ip/dhcp-server/lease` y `/rest/ip/arp`) |
| Ubiquiti | UniFi Controller / UDM (varios puertos y rutas), EdgeOS (`/api/edge/data.json`) |
| OpenWrt / LEDE | ubus JSON-RPC (`luci-rpc getDHCPLeases`), LuCI clásico (scrape) |
| FortiGate | REST `/api/v2/monitor/system/dhcp` y `/user/device` (token en `RouterPass`) |
| pfSense / OPNsense | FauxAPI REST, API key/secret |
| Huawei (ONT de ISP) | scrape de `lancfg.asp` / `devinfo.asp` / `dhcp.asp` |
| TP-Link | JSON-RPC de Archer nuevo, scrape de Archer viejo, controlador Omada |
| Cisco | Meraki Dashboard API, scrape de RV series |
| Zyxel | login + `DAL?oid=lanhosts` |
| Asus (ASUSWRT) | `appGet.cgi?hook=get_clientlist()` |
| DD-WRT | `Status_Lan.live.asp` (parseo de `dhcp_leases`) |
| Routers de ISP MX | rutas comunes de Arris/Askey (Telmex), ZTE/Nokia (Totalplay), Technicolor… |
| Cualquiera con SNMP | `ipNetToMediaPhysAddress` (necesita `snmpwalk` en PATH — Net-SNMP) |
| Genérico | endpoints JSON de DHCP más comunes |

El primero que devuelva dispositivos gana. Mantiene la sesión/cookies entre
peticiones (necesario para UniFi, OpenWrt, Omada, etc.). Si ninguno funciona,
el agente sigue reportando lo que ve por ARP local — **nada se rompe**.

En la pestaña **Monitoreo en vivo** cada agente muestra el estado del router:
`Router: MikroTik (RB4011) · vía mikrotik-rest` cuando funciona, o
`Router: sin acceso — usando ARP local` cuando no. Cada dispositivo lleva un
badge **router** o **arp** según de dónde salió.

### Credenciales del router en el config

- `RouterHost` — IP del router. Vacío = usa el gateway por defecto de la PC.
- `RouterUser` / `RouterPass` — usuario y contraseña del panel del router.
  - **FortiGate**: `RouterPass` = API token (deja `RouterUser` vacío).
  - **pfSense FauxAPI**: `RouterUser` = api-key, `RouterPass` = api-secret hash.
  - **Meraki**: `RouterHost` = `<networkId>@api.meraki.com`, `RouterPass` = API key.
- `RouterSnmpComunidad` — comunidad SNMP v2c (por defecto `public`).

## Verificar / operar

```powershell
Get-ScheduledTask "AGYDA - Monitor de Red"          # existe y su estado
Get-Content C:\AGYDA\agente-red\agente-red.log -Tail 20   # últimas corridas
Start-ScheduledTask "AGYDA - Monitor de Red"        # forzar una corrida ahora
```

En la intranet, la pestaña **Monitoreo en vivo** muestra el agente como "activo"
si reportó en los últimos 6 minutos, "sin señal" si no.

## Desinstalar

```powershell
Unregister-ScheduledTask -TaskName "AGYDA - Monitor de Red" -Confirm:$false
Remove-Item C:\AGYDA\agente-red -Recurse -Force
```

## Qué mide cada corrida

| Dato | Cómo |
|---|---|
| Estado (online/caído) | `Test-Connection` a 8.8.8.8, 1.1.1.1, google.com |
| Latencia / jitter / pérdida | promedio y desviación de los RTT de esos pings |
| Velocidad de enlace físico | `Get-NetAdapter` (LinkSpeed del adaptador Up) |
| Velocidad real ↓/↑ | `speedtest.exe --format=json` (cada 30 min, configurable) |
| Dispositivos | `Get-NetNeighbor` / `arp -a` + resolución de nombre + OUI→fabricante |
| Dispositivos (Fase 2) | tabla DHCP del router vía `RouterProbe` |

Retención en BD: las mediciones más viejas de 90 días se purgan solas.
