<#
    AGYDA - Agente de monitoreo de red
    ----------------------------------
    Corre cada 2 minutos (Tarea Programada). En cada corrida:
      1. Mide latencia / jitter / perdida de paquetes (ping a varios hosts)
      2. Lee el adaptador fisico (estado + velocidad de enlace)
      3. Enumera dispositivos de la red local (ARP / vecinos IPv4)
      4. (Fase 2) Intenta leer la tabla DHCP del router por varios metodos
      5. Cada N minutos: prueba de velocidad (Ookla speedtest CLI)
      6. Envia todo por HTTPS al backend (POST /api/tecnologia/red/ingesta)

    Config: agente-red.config.json (junto a este archivo). Si no existe,
    usa los valores por defecto de abajo. Nunca lanza excepcion sin capturar.
#>

param(
    [switch]$Once  # ignorado; la repeticion la maneja la Tarea Programada
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentVersion = '1.0.0'

# ─────────────────────────────────────────────────────────────
#  Configuracion
# ─────────────────────────────────────────────────────────────
$cfg = [ordered]@{
    ApiUrl            = 'https://intranet.ardabytec.vip:8444/api/tecnologia/red/ingesta'
    ApiKey            = 'PEGAR_AQUI_LA_API_KEY'
    Empresa          = 'agyda'
    EnlaceId          = $null          # id de TI_ENLACES_RED (opcional)
    AgenteNombre      = $env:COMPUTERNAME
    PingHosts         = @('8.8.8.8', '1.1.1.1', 'www.google.com')
    SpeedtestCadaMin  = 30             # el speedtest es pesado: no cada corrida
    SpeedtestExe      = ''             # ruta a speedtest.exe; '' = autodetectar
    HabilitarRouter   = $true          # intentar leer DHCP del router (Fase 2)
    RouterHost        = ''             # '' = usar el gateway por defecto
    RouterUser        = 'admin'
    RouterPass        = ''
    RouterSnmpComunidad = 'public'
    TimeoutSeg        = 30
}
$cfgPath = Join-Path $ScriptDir 'agente-red.config.json'
if (Test-Path $cfgPath) {
    try {
        $j = Get-Content $cfgPath -Raw | ConvertFrom-Json
        foreach ($k in $cfg.Keys.Clone()) { if ($null -ne $j.$k -and $j.$k -ne '') { $cfg[$k] = $j.$k } }
    } catch { }
}

# ─────────────────────────────────────────────────────────────
#  Log rotativo simple
# ─────────────────────────────────────────────────────────────
$LogPath = Join-Path $ScriptDir 'agente-red.log'
function Write-Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    try {
        Add-Content -Path $LogPath -Value $line -Encoding UTF8
        $lines = @(Get-Content $LogPath -ErrorAction SilentlyContinue)
        if ($lines.Count -gt 600) { Set-Content -Path $LogPath -Value ($lines[-500..-1]) -Encoding UTF8 }
    } catch { }
}

# ─────────────────────────────────────────────────────────────
#  1. Latencia / jitter / perdida
# ─────────────────────────────────────────────────────────────
function Measure-Conectividad {
    # Usa System.Net.NetworkInformation.Ping (.NET) directamente — idéntico en
    # Windows PowerShell 5.1 y PowerShell 7+, sin depender de Test-Connection
    # (cuyos parámetros -TargetName / -ComputerName / -TimeoutSeconds cambiaron
    # entre versiones). Da la latencia real en ms.
    $rtts = New-Object System.Collections.Generic.List[double]
    $enviados = 0; $recibidos = 0
    $ping = New-Object System.Net.NetworkInformation.Ping
    foreach ($h in $cfg.PingHosts) {
        for ($i = 0; $i -lt 4; $i++) {
            $enviados++
            try {
                $reply = $ping.Send($h, 2000)   # timeout 2s
                if ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
                    $rtts.Add([double]$reply.RoundtripTime)
                    $recibidos++
                }
            } catch { }
        }
    }
    $ping.Dispose()

    $online   = $recibidos -gt 0
    $perdida  = if ($enviados -gt 0) { [math]::Round((1 - $recibidos / $enviados) * 100, 1) } else { 100 }
    $lat = $null; $jit = $null
    if ($rtts.Count -gt 0) {
        $lat = [math]::Round(($rtts | Measure-Object -Average).Average, 1)
        if ($rtts.Count -gt 1) {
            $difs = for ($i = 1; $i -lt $rtts.Count; $i++) { [math]::Abs($rtts[$i] - $rtts[$i - 1]) }
            $jit = [math]::Round(($difs | Measure-Object -Average).Average, 1)
        }
    }
    [pscustomobject]@{ online = $online; latenciaMs = $lat; jitterMs = $jit; perdidaPct = $perdida }
}

# ─────────────────────────────────────────────────────────────
#  2. Adaptador fisico
# ─────────────────────────────────────────────────────────────
function Get-AdaptadorInfo {
    try {
        $ad = Get-NetAdapter -Physical -ErrorAction Stop |
              Where-Object { $_.Status -eq 'Up' -and $_.Virtual -eq $false } |
              Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1
        if (-not $ad) { return [pscustomobject]@{ adaptadorUp = $false; linkMbps = $null; ipLocal = $null; gateway = $null } }
        $mbps = $null
        if ($ad.LinkSpeed -match '([\d\.]+)\s*Gbps') { $mbps = [double]$Matches[1] * 1000 }
        elseif ($ad.LinkSpeed -match '([\d\.]+)\s*Mbps') { $mbps = [double]$Matches[1] }
        $cfgIp = Get-NetIPConfiguration -InterfaceIndex $ad.ifIndex -ErrorAction SilentlyContinue
        $ip = ($cfgIp.IPv4Address.IPAddress | Select-Object -First 1)
        $gw = ($cfgIp.IPv4DefaultGateway.NextHop | Select-Object -First 1)
        [pscustomobject]@{ adaptadorUp = $true; linkMbps = $mbps; ipLocal = $ip; gateway = $gw }
    } catch {
        [pscustomobject]@{ adaptadorUp = $null; linkMbps = $null; ipLocal = $null; gateway = $null }
    }
}

# OUI -> fabricante (subset comun; el backend puede enriquecer despues)
$script:OUI = @{
    '00:1A:11' = 'Google'; '3C:5A:B4' = 'Google'; 'F4:F5:E8' = 'Google'
    'B8:27:EB' = 'Raspberry Pi'; 'DC:A6:32' = 'Raspberry Pi'
    '00:1B:63' = 'Apple'; 'AC:BC:32' = 'Apple'; 'F0:18:98' = 'Apple'; '3C:22:FB' = 'Apple'
    '00:50:56' = 'VMware'; '00:0C:29' = 'VMware'; '08:00:27' = 'VirtualBox'
    '00:15:5D' = 'Microsoft Hyper-V'; '00:1D:D8' = 'Microsoft'
    'D8:3A:DD' = 'Samsung'; '5C:0A:5B' = 'Samsung'
    '00:24:D7' = 'Intel'; '3C:97:0E' = 'Intel'; '9C:B6:D0' = 'Intel'
    '00:E0:4C' = 'Realtek'; '52:54:00' = 'QEMU/KVM'
    'C8:3A:35' = 'TP-Link'; '50:C7:BF' = 'TP-Link'; 'D8:0D:17' = 'TP-Link'
    '18:E8:29' = 'Ubiquiti'; '24:5A:4C' = 'Ubiquiti'; 'F0:9F:C2' = 'Ubiquiti'
    'DC:2C:6E' = 'MikroTik'; '4C:5E:0C' = 'MikroTik'; '48:8F:5A' = 'MikroTik'
    '00:1E:C2' = 'Apple'; 'E4:8D:8C' = 'Routerboard'
}
function Resolve-Fabricante([string]$mac) {
    if (-not $mac) { return $null }
    $p = ($mac.ToUpper() -replace '-', ':').Substring(0, 8)
    return $script:OUI[$p]
}

# ─────────────────────────────────────────────────────────────
#  3. Dispositivos por ARP / vecinos IPv4
# ─────────────────────────────────────────────────────────────
function Get-DispositivosLocales {
    $out = @{}
    try {
        Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.State -in 'Reachable', 'Stale', 'Permanent' -and $_.LinkLayerAddress -and
                           $_.LinkLayerAddress -ne '00-00-00-00-00-00' -and $_.LinkLayerAddress -ne 'ff-ff-ff-ff-ff-ff' -and
                           $_.IPAddress -notmatch '^(224\.|239\.|255\.|169\.254\.|0\.0\.0\.0)' } |
            ForEach-Object {
                $mac = $_.LinkLayerAddress.ToUpper() -replace '-', ':'
                $out[$mac] = [pscustomobject]@{ mac = $mac; ip = $_.IPAddress; hostname = $null; fabricante = (Resolve-Fabricante $mac); origen = 'arp' }
            }
    } catch { }

    if ($out.Count -eq 0) {
        # Fallback: arp -a
        try {
            (arp -a) 2>$null | Select-String -Pattern '^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})\s+(\w+)' |
                ForEach-Object {
                    $ip = $_.Matches[0].Groups[1].Value
                    $mac = ($_.Matches[0].Groups[2].Value.ToUpper() -replace '-', ':')
                    if ($ip -notmatch '^(224\.|239\.|255\.|169\.254\.)' -and $mac -ne 'FF:FF:FF:FF:FF:FF') {
                        $out[$mac] = [pscustomobject]@{ mac = $mac; ip = $ip; hostname = $null; fabricante = (Resolve-Fabricante $mac); origen = 'arp' }
                    }
                }
        } catch { }
    }

    # hostname best-effort: NetBIOS/PTR con tope global de 15s
    $deadline = (Get-Date).AddSeconds(15)
    foreach ($d in $out.Values) {
        if ((Get-Date) -gt $deadline) { break }
        try {
            $n = Resolve-DnsName -Name $d.ip -LlmnrNetbiosOnly -QuickTimeout -ErrorAction Stop | Select-Object -First 1
            if ($n.NameHost) { $d.hostname = ($n.NameHost -split '\.')[0] }
        } catch { }
    }
    return @($out.Values)
}

# ─────────────────────────────────────────────────────────────
#  4. RouterProbe — deteccion del router y su tabla DHCP (Fase 2)
#     Prueba, en orden de fiabilidad, muchos metodos por marca; el
#     primero que devuelva dispositivos gana. Mantiene sesion/cookies
#     entre requests (WebSession), timeout por metodo, y reporta que
#     marca/modelo/metodo funciono en $this.Meta / $this.Metodo.
# ─────────────────────────────────────────────────────────────
class RouterProbe {
    [string]$RHost
    [string]$User
    [string]$Pass
    [string]$SnmpComunidad
    [int]$TimeoutSeg
    [bool]$SkipCert
    [System.Collections.Generic.List[object]]$Dispositivos
    [hashtable]$Meta
    [string]$Metodo
    [string]$Estado           # 'ok' | 'sin-acceso' | 'no-intentado' | 'sin-respuesta'
    [datetime]$Deadline       # tope global: no seguir sondeando despues de esto
    $Session                  # Microsoft.PowerShell.Commands.WebRequestSession

    RouterProbe([string]$h, [string]$u, [string]$p, [string]$snmp, [int]$t, [bool]$skipCert) {
        $this.RHost = $h; $this.User = $u; $this.Pass = $p
        $this.SnmpComunidad = $snmp
        # cap agresivo: cada request al router no debe pasar de 6s
        $this.TimeoutSeg = [math]::Min([math]::Max($t, 3), 6)
        $this.SkipCert = $skipCert
        $this.Dispositivos = [System.Collections.Generic.List[object]]::new()
        $this.Meta = @{ marca = $null; modelo = $null }
        $this.Metodo = 'ninguno'
        $this.Estado = 'no-intentado'
        $this.Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    }

    [bool] _tiempoAgotado() { return (Get-Date) -gt $this.Deadline }

    # ¿el router responde en algun puerto de admin? (evita 20 metodos con timeout)
    [bool] _responde() {
        foreach ($port in @(443, 80, 8443, 8080, 8043)) {
            try {
                $c = New-Object System.Net.Sockets.TcpClient
                $iar = $c.BeginConnect($this.RHost, $port, $null, $null)
                $ok = $iar.AsyncWaitHandle.WaitOne(1200, $false)
                if ($ok -and $c.Connected) {
                    $c.EndConnect($iar); $c.Close()
                    if ($port -in 443, 8443, 8043) { $this.Meta.scheme = 'https' } else { $this.Meta.scheme = 'http' }
                    return $true
                }
                $c.Close()
            } catch { }
        }
        return $false
    }

    [void] Run() {
        if (-not $this.RHost) { $this.Estado = 'no-intentado'; return }
        # Tope global de 45s para toda la sonda del router.
        $this.Deadline = (Get-Date).AddSeconds(45)

        $this.TryUpnp()   # UDP, rapido; solo identidad
        if (-not $this._responde()) {
            $this.Estado = if (Get-Command snmpwalk -ErrorAction SilentlyContinue) { 'probando-snmp' } else { 'sin-respuesta' }
            try { $this.TrySnmp() } catch { }
            if ($this.Dispositivos.Count -gt 0) { $this.Estado = 'ok'; $this.Metodo = 'snmp' }
            elseif ($this.Estado -eq 'probando-snmp') { $this.Estado = 'sin-acceso' }
            return
        }

        $this.Estado = 'sin-acceso'
        $this.SondearBanner()

        # Orden: primero el metodo de la marca detectada, luego el resto.
        $todos = [ordered]@{
            'MikroTik'  = { $this.TryMikroTikRest();  $this.TryMikroTikApi() }
            'Ubiquiti'  = { $this.TryUniFi();          $this.TryEdgeOS() }
            'OpenWrt'   = { $this.TryOpenWrtUbus();    $this.TryOpenWrtLuci() }
            'Fortinet'  = { $this.TryFortiGate() }
            'pfSense'   = { $this.TryPfSense();        $this.TryOpnSense() }
            'Huawei'    = { $this.TryHuaweiHG() }
            'TP-Link'   = { $this.TryTpLink();         $this.TryOmada() }
            'Cisco'     = { $this.TryMeraki();         $this.TryCiscoRv() }
            'Zyxel'     = { $this.TryZyxel() }
            'Asus'      = { $this.TryAsus() }
            'DD-WRT'    = { $this.TryDdWrt() }
            'MercadoISP'= { $this.TryIspGenerico() }   # Arris/Askey (Telmex), etc.
        }

        $orden = @()
        if ($this.Meta.marca -and $todos.Contains($this.Meta.marca)) { $orden += $this.Meta.marca }
        foreach ($k in $todos.Keys) { if ($k -ne $this.Meta.marca) { $orden += $k } }

        foreach ($k in $orden) {
            if ($this.Dispositivos.Count -gt 0 -or $this._tiempoAgotado()) { break }
            try { & $todos[$k] } catch { }
        }
        if ($this.Dispositivos.Count -eq 0 -and -not $this._tiempoAgotado()) { try { $this.TrySnmp() }        catch { } }
        if ($this.Dispositivos.Count -eq 0 -and -not $this._tiempoAgotado()) { try { $this.TryGenericJson() } catch { } }

        if ($this.Dispositivos.Count -gt 0) { $this.Estado = 'ok' }
    }

    # ── helpers HTTP con sesion compartida ──
    [pscustomobject] _http([string]$url, [hashtable]$headers, [string]$method, $body) {
        $p = @{ Uri = $url; Method = $method; TimeoutSec = $this.TimeoutSeg
                WebSession = $this.Session; ErrorAction = 'Stop' }
        if ($headers) { $p.Headers = $headers }
        if ($null -ne $body) {
            if ($body -is [string]) { $p.Body = $body; $p.ContentType = 'application/json' }
            else { $p.Body = $body }   # hashtable => form-urlencoded
        }
        if ($this.SkipCert) { $p.SkipCertificateCheck = $true }
        return Invoke-RestMethod @p
    }
    [object] _web([string]$url, [string]$method, $body) {
        $p = @{ Uri = $url; Method = $method; TimeoutSec = $this.TimeoutSeg
                WebSession = $this.Session; UseBasicParsing = $true; ErrorAction = 'Stop' }
        if ($null -ne $body) { $p.Body = $body }
        if ($this.SkipCert) { $p.SkipCertificateCheck = $true }
        return Invoke-WebRequest @p
    }
    [string] _base() {
        # http o https segun lo que respondio el banner
        if ($this.Meta.scheme) { return "$($this.Meta.scheme)://$($this.RHost)" }
        return "http://$($this.RHost)"
    }

    [void] SondearBanner() {
        foreach ($scheme in @('https', 'http')) {
            try {
                $r = $this._web("$scheme`://$($this.RHost)/", 'GET', $null)
                $this.Meta.scheme = $scheme
                $txt = ("$($r.Headers.Server) $($r.Headers.'WWW-Authenticate') $($r.Content)").ToLower()
                $this.Meta.marca = $(
                    if     ($txt -match 'mikrotik|routeros')            { 'MikroTik' }
                    elseif ($txt -match 'unifi|ubnt|ubiquiti|edgeos|edgemax') { 'Ubiquiti' }
                    elseif ($txt -match 'openwrt|lede|luci')            { 'OpenWrt' }
                    elseif ($txt -match 'fortigate|fortinet')           { 'Fortinet' }
                    elseif ($txt -match 'pfsense|netgate|opnsense')     { 'pfSense' }
                    elseif ($txt -match 'huawei|hg8|hg6|echolife')      { 'Huawei' }
                    elseif ($txt -match 'tp-link|tplink|archer|omada|tether') { 'TP-Link' }
                    elseif ($txt -match 'cisco|meraki|rv\d{3}')         { 'Cisco' }
                    elseif ($txt -match 'zyxel|zyxelcom')               { 'Zyxel' }
                    elseif ($txt -match 'asuswrt|asus')                 { 'Asus' }
                    elseif ($txt -match 'dd-wrt')                       { 'DD-WRT' }
                    elseif ($txt -match 'arris|askey|technicolor|zte|nokia|sagemcom') { 'MercadoISP' }
                    else { $null }
                )
                if ($r.Headers.Server) { $this.Meta.server = "$($r.Headers.Server)" }
                # titulo de la pagina como pista de modelo
                if ($r.Content -match '<title>([^<]{2,80})</title>') { $this.Meta.titulo = $Matches[1].Trim() }
                break
            } catch { }
        }
    }

    [void] _add([string]$mac, [string]$ip, [string]$hn) {
        if (-not $mac) { return }
        $m = ($mac.ToUpper() -replace '[-\.]', ':')
        if ($m -notmatch '^([0-9A-F]{2}:){5}[0-9A-F]{2}$') { return }
        if ($m -eq 'FF:FF:FF:FF:FF:FF' -or $m -eq '00:00:00:00:00:00') { return }
        $this.Dispositivos.Add([pscustomobject]@{
            mac = $m; ip = $ip; hostname = $hn; fabricante = $null; origen = 'router'
        })
    }
    # recolector generico de leases desde JSON de forma variada
    [void] _absorberLeases($items) {
        foreach ($x in @($items)) {
            $mac = @($x.mac, $x.macaddr, $x.hwaddr, $x.'mac-address', $x.'mac_address', $x.MAC, $x.clientMac) | Where-Object { $_ } | Select-Object -First 1
            $ip  = @($x.ip, $x.ipaddr, $x.address, $x.'ip-address', $x.'ip_address', $x.IP, $x.clientIp) | Where-Object { $_ } | Select-Object -First 1
            $hn  = @($x.hostname, $x.name, $x.'host-name', $x.'host_name', $x.clientName, $x.deviceName) | Where-Object { $_ } | Select-Object -First 1
            if ($mac) { $this._add($mac, $ip, $hn) }
        }
    }
    # extrae pares MAC..IP de HTML/texto crudo (scraping)
    [void] _absorberTexto([string]$html) {
        $rx = [regex]::Matches($html, '([0-9A-Fa-f]{2}([:\-][0-9A-Fa-f]{2}){5})[\s\S]{0,160}?(\d{1,3}(\.\d{1,3}){3})')
        foreach ($m in $rx) { $this._add($m.Groups[1].Value, $m.Groups[3].Value, $null) }
        if ($this.Dispositivos.Count -eq 0) {
            $rx2 = [regex]::Matches($html, '(\d{1,3}(\.\d{1,3}){3})[\s\S]{0,160}?([0-9A-Fa-f]{2}([:\-][0-9A-Fa-f]{2}){5})')
            foreach ($m in $rx2) { $this._add($m.Groups[3].Value, $m.Groups[1].Value, $null) }
        }
    }
    [void] _ok([string]$metodo, [string]$marca) {
        if ($this.Dispositivos.Count -gt 0) {
            $this.Metodo = $metodo
            if ($marca) { $this.Meta.marca = $marca }
        }
    }

    # ─────────── MikroTik ───────────
    [void] TryMikroTikRest() {
        $pair = "$($this.User):$($this.Pass)"
        $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
        $h = @{ Authorization = "Basic $b64"; Accept = 'application/json' }
        foreach ($sch in @('https', 'http')) {
            try {
                $lease = $this._http("$sch`://$($this.RHost)/rest/ip/dhcp-server/lease", $h, 'GET', $null)
                foreach ($l in $lease) { $this._add($l.'mac-address', $l.'active-address', $l.'host-name') }
                if ($this.Dispositivos.Count -eq 0) {
                    $arp = $this._http("$sch`://$($this.RHost)/rest/ip/arp", $h, 'GET', $null)
                    foreach ($a in $arp) { $this._add($a.'mac-address', $a.address, $null) }
                }
                $this._ok('mikrotik-rest', 'MikroTik'); if ($this.Dispositivos.Count) { return }
            } catch { }
        }
    }
    [void] TryMikroTikApi() {
        # RouterOS < v7 no tiene REST; el API binario (8728) requiere libreria.
        # Fallback: webfig print de /ip/dhcp-server/lease via www.
        try {
            $h = @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($this.User):$($this.Pass)")) }
            $r = $this._web("http://$($this.RHost)/webfig/", 'GET', $null)  # solo confirma que responde
            if ($r.StatusCode -eq 200) { $this.Meta.marca = 'MikroTik' }
        } catch { }
    }

    # ─────────── Ubiquiti ───────────
    [void] TryUniFi() {
        $body = @{ username = $this.User; password = $this.Pass } | ConvertTo-Json
        $bases = @("https://$($this.RHost)", "https://$($this.RHost):8443", "https://$($this.RHost):443")
        foreach ($b in $bases) {
            foreach ($login in @('/api/auth/login', '/api/login')) {
                try {
                    $null = $this._http("$b$login", @{}, 'POST', $body)
                    $paths = @('/proxy/network/api/s/default/stat/sta', '/api/s/default/stat/sta',
                               '/proxy/network/v2/api/site/default/clients/active')
                    foreach ($p in $paths) {
                        try {
                            $cli = $this._http("$b$p", @{}, 'GET', $null)
                            $arr = if ($cli.data) { $cli.data } else { $cli }
                            foreach ($c in $arr) {
                                $hn = @($c.hostname, $c.name, $c.display_name) | Where-Object { $_ } | Select-Object -First 1
                                $this._add($c.mac, $c.ip, $hn)
                            }
                            if ($this.Dispositivos.Count) { $this._ok('unifi', 'Ubiquiti'); return }
                        } catch { }
                    }
                } catch { }
            }
        }
    }
    [void] TryEdgeOS() {
        # EdgeRouter (EdgeOS): /api/edge/data.json?data=dhcp_leases con auth por form
        try {
            $null = $this._web("https://$($this.RHost)/", 'POST', @{ username = $this.User; password = $this.Pass })
            $d = $this._http("https://$($this.RHost)/api/edge/data.json?data=dhcp_leases", @{}, 'GET', $null)
            $leases = $d.output.'dhcp-server-leases'
            foreach ($net in $leases.PSObject.Properties) {
                foreach ($ipEntry in $net.Value.PSObject.Properties) {
                    $this._add($ipEntry.Value.mac, $ipEntry.Name, $ipEntry.Value.'client-hostname')
                }
            }
            $this._ok('edgeos', 'Ubiquiti')
        } catch { }
    }

    # ─────────── OpenWrt ───────────
    [void] TryOpenWrtUbus() {
        foreach ($sch in @('http', 'https')) {
            try {
                $login = @{ jsonrpc = '2.0'; id = 1; method = 'call'
                            params = @('00000000000000000000000000000000', 'session', 'login',
                                       @{ username = $this.User; password = $this.Pass }) } | ConvertTo-Json -Depth 8
                $r = $this._http("$sch`://$($this.RHost)/ubus", @{}, 'POST', $login)
                $sid = $r.result[1].ubus_rpc_session
                if (-not $sid) { continue }
                $q = @{ jsonrpc = '2.0'; id = 2; method = 'call'
                        params = @($sid, 'luci-rpc', 'getDHCPLeases', @{}) } | ConvertTo-Json -Depth 8
                $d = $this._http("$sch`://$($this.RHost)/ubus", @{}, 'POST', $q)
                foreach ($l in @($d.result[1].dhcp_leases) + @($d.result[1].dhcp6_leases)) {
                    $this._add($l.macaddr, $l.ipaddr, $l.hostname)
                }
                $this._ok('openwrt-ubus', 'OpenWrt'); if ($this.Dispositivos.Count) { return }
            } catch { }
        }
    }
    [void] TryOpenWrtLuci() {
        # LuCI clasico: login por form -> pagina de DHCP leases
        try {
            $null = $this._web("http://$($this.RHost)/cgi-bin/luci/", 'POST', @{ luci_username = $this.User; luci_password = $this.Pass })
            $r = $this._web("http://$($this.RHost)/cgi-bin/luci/admin/network/dhcp", 'GET', $null)
            $this._absorberTexto($r.Content)
            $this._ok('openwrt-luci', 'OpenWrt')
        } catch { }
    }

    # ─────────── Fortinet ───────────
    [void] TryFortiGate() {
        # RouterPass = API token
        $h = @{ Authorization = "Bearer $($this.Pass)" }
        foreach ($p in @('/api/v2/monitor/system/dhcp', '/api/v2/monitor/user/device/query',
                         '/api/v2/monitor/user/detected-device')) {
            try {
                $d = $this._http("https://$($this.RHost)$p", $h, 'GET', $null)
                $rows = @($d.results) + @($d.results.list)
                foreach ($x in $rows) {
                    $mac = @($x.mac, $x.hardware_address) | Where-Object { $_ } | Select-Object -First 1
                    $ip  = @($x.ip, $x.ipv4_address, $x.'ip-address') | Where-Object { $_ } | Select-Object -First 1
                    $hn  = @($x.hostname, $x.host_name) | Where-Object { $_ } | Select-Object -First 1
                    $this._add($mac, $ip, $hn)
                }
                $this._ok('fortigate', 'Fortinet'); if ($this.Dispositivos.Count) { return }
            } catch { }
        }
    }

    # ─────────── pfSense / OPNsense ───────────
    [void] TryPfSense() {
        $h = @{ Authorization = "$($this.User) $($this.Pass)" }  # FauxAPI: "<apikey> <apisecret-hash>"
        try {
            $d = $this._http("https://$($this.RHost)/api/v1/services/dhcpd/lease", $h, 'GET', $null)
            $this._absorberLeases($d.data)
            $this._ok('pfsense-api', 'pfSense')
        } catch { }
    }
    [void] TryOpnSense() {
        # OPNsense: API key/secret como Basic auth
        $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($this.User):$($this.Pass)"))
        try {
            $d = $this._http("https://$($this.RHost)/api/dhcpv4/leases/searchLease", @{ Authorization = "Basic $b64" }, 'GET', $null)
            foreach ($l in $d.rows) { $this._add($l.mac, $l.address, $l.hostname) }
            $this._ok('opnsense', 'pfSense')
        } catch { }
    }

    # ─────────── Huawei (ONT de ISP) ───────────
    [void] TryHuaweiHG() {
        foreach ($p in @('/html/bbsp/common/lancfg.asp', '/html/status/lancfg.asp',
                         '/html/network/dhcp.asp', '/html/bbsp/dev/devinfo.asp')) {
            try {
                $r = $this._web("http://$($this.RHost)$p", 'GET', $null)
                $this._absorberTexto($r.Content)
                if ($this.Dispositivos.Count) { $this._ok('huawei-scrape', 'Huawei'); return }
            } catch { }
        }
    }

    # ─────────── TP-Link ───────────
    [void] TryTpLink() {
        # Archer nuevo: JSON RPC; viejo: scrape.
        try {
            $body = @{ method = 'do'; login = @{ password = $this.Pass } } | ConvertTo-Json
            $tok = $this._http("http://$($this.RHost)/cgi-bin/luci/;stok=/login?form=login", @{}, 'POST', $body)
            $stok = $tok.stok
            if ($stok) {
                $d = $this._http("http://$($this.RHost)/cgi-bin/luci/;stok=$stok/admin/dhcps?form=client", @{}, 'GET', $null)
                $this._absorberLeases($d.data)
            }
        } catch { }
        if ($this.Dispositivos.Count -eq 0) {
            foreach ($p in @('/', '/userRpm/AssignedIpAddrListRpm.htm', '/DHCPClientList.htm')) {
                try { $this._absorberTexto((($this._web("http://$($this.RHost)$p", 'GET', $null)).Content)) } catch { }
                if ($this.Dispositivos.Count) { break }
            }
        }
        $this._ok('tplink', 'TP-Link')
    }
    [void] TryOmada() {
        # TP-Link Omada controller (SDN)
        $body = @{ name = $this.User; password = $this.Pass } | ConvertTo-Json
        foreach ($b in @("https://$($this.RHost):8043", "https://$($this.RHost)", "http://$($this.RHost):8088")) {
            try {
                $lg = $this._http("$b/api/v2/login", @{}, 'POST', $body)
                $tok = $lg.result.token
                $h = @{ 'Csrf-Token' = $tok }
                $sites = $this._http("$b/api/v2/sites?token=$tok", $h, 'GET', $null)
                $sid = $sites.result.data[0].id
                $cli = $this._http("$b/api/v2/sites/$sid/clients?token=$tok", $h, 'GET', $null)
                foreach ($c in $cli.result.data) { $this._add($c.mac, $c.ip, $c.name) }
                if ($this.Dispositivos.Count) { $this._ok('omada', 'TP-Link'); return }
            } catch { }
        }
    }

    # ─────────── Cisco ───────────
    [void] TryMeraki() {
        # Meraki Dashboard API — RouterPass = API key, RHost = <networkId>@api.meraki.com (o red local no aplica)
        if ($this.RHost -notmatch 'meraki|^[A-Za-z0-9_-]+@') { return }
        try {
            $netId = ($this.RHost -split '@')[0]
            $h = @{ 'X-Cisco-Meraki-API-Key' = $this.Pass; Accept = 'application/json' }
            $d = $this._http("https://api.meraki.com/api/v1/networks/$netId/clients?perPage=1000", $h, 'GET', $null)
            foreach ($c in $d) { $this._add($c.mac, $c.ip, $c.description) }
            $this._ok('meraki', 'Cisco')
        } catch { }
    }
    [void] TryCiscoRv() {
        # Cisco RV series: pagina de DHCP status (scrape tras Basic auth)
        $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($this.User):$($this.Pass)"))
        foreach ($p in @('/scgi-bin/dynaform/dhcp_status.html', '/DHCPTable.htm', '/StatusLanDhcp.asp')) {
            try {
                $r = $this._web("https://$($this.RHost)$p", 'GET', $null)
                $this._absorberTexto($r.Content)
                if ($this.Dispositivos.Count) { $this._ok('cisco-rv', 'Cisco'); return }
            } catch { }
        }
    }

    # ─────────── Zyxel / Asus / DD-WRT ───────────
    [void] TryZyxel() {
        try {
            $lg = $this._http("https://$($this.RHost)/UserLogin", @{}, 'POST',
                (@{ Input_Account = $this.User; Input_Passwd = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($this.Pass)) } | ConvertTo-Json))
            $d = $this._http("https://$($this.RHost)/cgi-bin/DAL?oid=lanhosts", @{}, 'GET', $null)
            $this._absorberLeases($d.Object)
            $this._ok('zyxel', 'Zyxel')
        } catch { }
    }
    [void] TryAsus() {
        # ASUSWRT: login por Basic, luego update.cgi / appGet.cgi?hook=get_clientlist()
        $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($this.User):$($this.Pass)"))
        try {
            $d = $this._http("http://$($this.RHost)/appGet.cgi?hook=get_clientlist()", @{ Authorization = "Basic $b64" }, 'GET', $null)
            $lst = $d.get_clientlist
            foreach ($p in $lst.PSObject.Properties) {
                $c = $p.Value
                if ($c.mac) { $this._add($c.mac, $c.ip, $c.nickName) }
            }
            $this._ok('asuswrt', 'Asus')
        } catch { }
    }
    [void] TryDdWrt() {
        $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($this.User):$($this.Pass)"))
        try {
            $r = $this._web("http://$($this.RHost)/Status_Lan.live.asp", 'GET', $null)
            # dhcp_leases='hostname','ip','mac','expires','num'|...
            $rx = [regex]::Matches($r.Content, "'([^']*)','(\d{1,3}(\.\d{1,3}){3})','([0-9A-Fa-f:]{17})'")
            foreach ($m in $rx) { $this._add($m.Groups[4].Value, $m.Groups[2].Value, $m.Groups[1].Value) }
            $this._ok('dd-wrt', 'DD-WRT')
        } catch { }
    }

    # ─────────── Routers de ISP mexicanos (Arris/Askey Telmex, ZTE/Nokia Totalplay, etc.) ───────────
    [void] TryIspGenerico() {
        $paths = @(
            '/cgi-bin/dhcpinfo.cgi', '/cgi-bin/DHCPTable', '/DHCPTable.htm', '/dhcpinfo.html',
            '/RgDhcp.asp', '/VmDhcp.asp', '/connected_devices_computers.php',
            '/getDeviceList.cgi', '/network_setup.php', '/deviceManage.cmd',
            '/cgi-bin/status_deviceinfo.asp', '/html/network/wlanaccess.asp'
        )
        foreach ($sch in @('http', 'https')) {
            foreach ($p in $paths) {
                if ($this._tiempoAgotado()) { return }
                try {
                    $r = $this._web("$sch`://$($this.RHost)$p", 'GET', $null)
                    $this._absorberTexto($r.Content)
                    if ($this.Dispositivos.Count) { $this._ok("isp:$p", $this.Meta.marca); return }
                } catch { }
            }
        }
    }

    # ─────────── SNMP (agnostico) ───────────
    [void] TrySnmp() {
        $snmpwalk = Get-Command snmpwalk -ErrorAction SilentlyContinue
        if (-not $snmpwalk) { return }
        # ipNetToMediaPhysAddress .1.3.6.1.2.1.4.22.1.2  (ARP del router)
        $raw = & snmpwalk -v2c -c $this.SnmpComunidad -Oq -t 2 -r 1 $this.RHost 1.3.6.1.2.1.4.22.1.2 2>$null
        foreach ($line in $raw) {
            if ($line -match '1\.4\.22\.1\.2\.\d+\.(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+"?([0-9A-Fa-f]{1,2}([ :][0-9A-Fa-f]{1,2}){5})"?') {
                $ip = $Matches[1]
                $mac = (($Matches[2] -split '[ :]') | ForEach-Object { $_.PadLeft(2, '0') }) -join ':'
                $this._add($mac, $ip, $null)
            }
        }
        $this._ok('snmp', $this.Meta.marca)
    }

    # ─────────── UPnP / SSDP (solo identidad) ───────────
    [void] TryUpnp() {
        try {
            $msg = "M-SEARCH * HTTP/1.1`r`nHOST: 239.255.255.250:1900`r`nMAN: `"ssdp:discover`"`r`nMX: 2`r`nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1`r`n`r`n"
            $udp = New-Object System.Net.Sockets.UdpClient
            $udp.Client.ReceiveTimeout = 3000
            $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse('239.255.255.250'), 1900)
            $bytes = [Text.Encoding]::ASCII.GetBytes($msg)
            $null = $udp.Send($bytes, $bytes.Length, $ep)
            $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
            $resp = [Text.Encoding]::ASCII.GetString($udp.Receive([ref]$remote))
            $udp.Close()
            if ($resp -match 'LOCATION:\s*(\S+)') {
                $xml = Invoke-RestMethod -Uri $Matches[1] -TimeoutSec 5 -ErrorAction Stop
                $man = "$($xml.root.device.manufacturer)".Trim()
                $mod = "$($xml.root.device.modelName)".Trim()
                if ($man -or $mod) { $this.Meta.modelo = ("$man $mod").Trim() }
                if (-not $this.Meta.marca -and $man) {
                    $this.Meta.marca = $(
                        if     ($man -match 'mikrotik')        { 'MikroTik' }
                        elseif ($man -match 'ubiquiti|ubnt')   { 'Ubiquiti' }
                        elseif ($man -match 'tp-link')         { 'TP-Link' }
                        elseif ($man -match 'huawei')          { 'Huawei' }
                        elseif ($man -match 'cisco')           { 'Cisco' }
                        elseif ($man -match 'zyxel')           { 'Zyxel' }
                        elseif ($man -match 'asus')            { 'Asus' }
                        elseif ($man -match 'arris|askey|zte|nokia|technicolor|sagemcom') { 'MercadoISP' }
                        else { $null }
                    )
                }
            }
        } catch { }
    }

    # ─────────── endpoints JSON genericos ───────────
    [void] TryGenericJson() {
        $paths = @('/api/dhcp/leases', '/api/hosts', '/api/devices', '/dhcp-leases.json',
                   '/status_dhcp.json', '/cgi-bin/dhcp_leases', '/data/dhcp_lease.json',
                   '/goform/getDHCPClientList', '/api/v1/dhcp/leases')
        $sch = if ($this.Meta.scheme) { $this.Meta.scheme } else { 'http' }
        foreach ($p in $paths) {
            if ($this._tiempoAgotado()) { return }
            try {
                $d = $this._http("$sch`://$($this.RHost)$p", @{}, 'GET', $null)
                $items = if ($d -is [array]) { $d }
                         elseif ($d.leases)  { $d.leases }
                         elseif ($d.data)    { $d.data }
                         elseif ($d.clients) { $d.clients }
                         elseif ($d.hosts)   { $d.hosts }
                         else { @() }
                $this._absorberLeases($items)
                if ($this.Dispositivos.Count) { $this._ok("generic:$p", $this.Meta.marca); return }
            } catch { }
        }
    }
}

function Get-DispositivosRouter([string]$gateway) {
    $res = [pscustomobject]@{
        dispositivos = @(); estado = 'deshabilitado'
        marca = $null; modelo = $null; metodo = 'ninguno'; host = $null
    }
    if (-not $cfg.HabilitarRouter) { return $res }
    $rHost = if ($cfg.RouterHost) { $cfg.RouterHost } else { $gateway }
    if (-not $rHost) { $res.estado = 'sin-gateway'; return $res }
    $res.host = $rHost
    try {
        $skipCert = $PSVersionTable.PSVersion.Major -ge 6
        $probe = [RouterProbe]::new($rHost, $cfg.RouterUser, $cfg.RouterPass, $cfg.RouterSnmpComunidad, [int]$cfg.TimeoutSeg, $skipCert)
        $probe.Run()
        $res.dispositivos = @($probe.Dispositivos)
        $res.estado = $probe.Estado
        $res.marca  = $probe.Meta.marca
        $res.modelo = if ($probe.Meta.modelo) { $probe.Meta.modelo } elseif ($probe.Meta.titulo) { $probe.Meta.titulo } else { $null }
        $res.metodo = $probe.Metodo
        Write-Log ("Router: host={0} estado={1} marca={2} modelo={3} metodo={4} disp={5}" -f `
            $rHost, $res.estado, $res.marca, $res.modelo, $res.metodo, $res.dispositivos.Count)
    } catch {
        $res.estado = 'error'
        Write-Log "Router: fallo la sonda ($($_.Exception.Message))"
    }
    return $res
}

# ─────────────────────────────────────────────────────────────
#  5. Speedtest (Ookla CLI) — solo cada N minutos
# ─────────────────────────────────────────────────────────────
$SpeedStamp = Join-Path $ScriptDir '.speedtest.stamp'
function Find-SpeedtestExe {
    if ($cfg.SpeedtestExe -and (Test-Path $cfg.SpeedtestExe)) { return $cfg.SpeedtestExe }
    $local = Join-Path $ScriptDir 'speedtest.exe'
    if (Test-Path $local) { return $local }
    $c = Get-Command speedtest -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}
function Measure-Velocidad {
    $exe = Find-SpeedtestExe
    if (-not $exe) { return $null }
    if (Test-Path $SpeedStamp) {
        $last = (Get-Item $SpeedStamp).LastWriteTime
        if ((Get-Date) - $last -lt [TimeSpan]::FromMinutes([int]$cfg.SpeedtestCadaMin)) { return 'skip' }
    }
    try {
        $json = & $exe --format=json --accept-license --accept-gdpr 2>$null | Out-String
        $r = $json | ConvertFrom-Json
        Set-Content -Path $SpeedStamp -Value (Get-Date -Format o) -Encoding UTF8
        [pscustomobject]@{
            downMbps = [math]::Round($r.download.bandwidth * 8 / 1e6, 1)
            upMbps   = [math]::Round($r.upload.bandwidth * 8 / 1e6, 1)
        }
    } catch {
        Write-Log "Speedtest fallo: $($_.Exception.Message)"
        $null
    }
}

# ─────────────────────────────────────────────────────────────
#  Ejecucion
# ─────────────────────────────────────────────────────────────
try {
    $con = Measure-Conectividad
    $ad  = Get-AdaptadorInfo
    $locales = Get-DispositivosLocales
    $router  = Get-DispositivosRouter $ad.gateway

    # merge por MAC: el router gana (mas fiable) pero conserva hostname/fabricante del local
    $mapa = @{}
    foreach ($d in $locales) { $mapa[$d.mac] = $d }
    foreach ($d in $router.dispositivos) {
        if ($mapa.ContainsKey($d.mac)) {
            if (-not $d.hostname)   { $d.hostname   = $mapa[$d.mac].hostname }
            if (-not $d.fabricante) { $d.fabricante = $mapa[$d.mac].fabricante }
        }
        $mapa[$d.mac] = $d
    }
    $dispositivos = @($mapa.Values)

    $vel = Measure-Velocidad
    $down = $null; $up = $null
    if ($vel -and $vel -ne 'skip') { $down = $vel.downMbps; $up = $vel.upMbps }

    $payload = [ordered]@{
        agente = [ordered]@{
            nombre  = $cfg.AgenteNombre
            version = $AgentVersion
            so      = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
            ipLocal = $ad.ipLocal
            gateway = $ad.gateway
        }
        router = [ordered]@{
            estado = $router.estado    # ok | sin-acceso | deshabilitado | sin-gateway | error | no-intentado
            marca  = $router.marca
            modelo = $router.modelo
            metodo = $router.metodo
            host   = $router.host
        }
        enlaceId    = $cfg.EnlaceId
        online      = $con.online
        latenciaMs  = $con.latenciaMs
        jitterMs    = $con.jitterMs
        perdidaPct  = $con.perdidaPct
        downMbps    = $down
        upMbps      = $up
        linkMbps    = $ad.linkMbps
        adaptadorUp = $ad.adaptadorUp
        dispositivos = @($dispositivos | ForEach-Object {
            [ordered]@{ mac = $_.mac; ip = $_.ip; hostname = $_.hostname; fabricante = $_.fabricante; origen = $_.origen }
        })
    }

    $uri = "$($cfg.ApiUrl)?empresa=$($cfg.Empresa)"
    $res = Invoke-RestMethod -Uri $uri -Method Post `
        -Headers @{ 'X-Api-Key' = $cfg.ApiKey } `
        -Body ($payload | ConvertTo-Json -Depth 6) `
        -ContentType 'application/json' -TimeoutSec ([int]$cfg.TimeoutSeg)

    Write-Log ("OK online={0} lat={1}ms loss={2}% down={3} up={4} disp={5} (med={6})" -f `
        $con.online, $con.latenciaMs, $con.perdidaPct, $down, $up, $dispositivos.Count, $res.data.medicionId)
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
}
exit 0
