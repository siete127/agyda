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
que ve por ARP). La clase `RouterProbe` prueba, en orden, varios métodos:

| Método | Router |
|---|---|
| RouterOS REST API | MikroTik v7+ |
| API de UniFi / UDM | Ubiquiti |
| ubus / LuCI RPC | OpenWrt / LEDE |
| REST `/api/v2/monitor` | FortiGate (API key en `RouterPass`) |
| REST FauxAPI | pfSense |
| scrape de `lancfg.asp` | Huawei HG8245 / HG659 |
| endpoint JSON o scrape | TP-Link Archer / EAP |
| SNMP `ipNetToMediaPhysAddress` | cualquiera con SNMP (necesita `snmpwalk` en PATH) |
| SSDP / UPnP | identifica marca/modelo cuando el resto falla |
| endpoints JSON comunes de DHCP | último recurso genérico |

El primero que devuelva dispositivos gana. Si ninguno funciona, el agente sigue
reportando lo que ve por ARP local (nada se rompe).

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
