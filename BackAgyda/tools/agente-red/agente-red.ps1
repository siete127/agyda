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
    $rtts = New-Object System.Collections.Generic.List[double]
    $enviados = 0; $recibidos = 0
    foreach ($h in $cfg.PingHosts) {
        for ($i = 0; $i -lt 4; $i++) {
            $enviados++
            try {
                $r = Test-Connection -TargetName $h -Count 1 -TimeoutSeconds 2 -ErrorAction Stop
                $ms = $null
                if ($r.Latency)            { $ms = [double]$r.Latency }
                elseif ($r.ResponseTime)   { $ms = [double]$r.ResponseTime }
                elseif ($r.RoundtripTime)  { $ms = [double]$r.RoundtripTime }
                if ($null -ne $ms) { $rtts.Add($ms); $recibidos++ }
            } catch { }
        }
    }
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

    # hostname best-effort (con timeout corto, solo para los primeros ~40)
    $i = 0
    foreach ($d in $out.Values) {
        if ($i++ -ge 40) { break }
        try {
            $n = Resolve-DnsName -Name $d.ip -DnsOnly:$false -QuickTimeout -ErrorAction Stop | Select-Object -First 1
            if ($n.NameHost) { $d.hostname = ($n.NameHost -split '\.')[0] }
        } catch { }
    }
    return @($out.Values)
}

# ─────────────────────────────────────────────────────────────
#  4. RouterProbe — clase grande de deteccion del router (Fase 2)
#     Intenta, en orden, todos los metodos posibles y devuelve
#     los dispositivos que pueda leer + metadatos del gateway.
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

    RouterProbe([string]$h, [string]$u, [string]$p, [string]$snmp, [int]$t, [bool]$skipCert) {
        $this.RHost = $h; $this.User = $u; $this.Pass = $p
        $this.SnmpComunidad = $snmp; $this.TimeoutSeg = $t
        $this.SkipCert = $skipCert
        $this.Dispositivos = [System.Collections.Generic.List[object]]::new()
        $this.Meta = @{}
        $this.Metodo = 'ninguno'
    }

    [void] Run() {
        if (-not $this.RHost) { return }
        # 1) Identidad del router por HTTP (marca / modelo por banners)
        $this.SondearBanner()
        # 2) Metodos ordenados de mas fiable a mas generico
        $tries = @(
            { $this.TryMikroTikRest() },
            { $this.TryUniFi() },
            { $this.TryOpenWrtUbus() },
            { $this.TryFortiGate() },
            { $this.TryPfSense() },
            { $this.TryHuaweiHG() },
            { $this.TryTpLink() },
            { $this.TrySnmp() },
            { $this.TryUpnp() },
            { $this.TryGenericJson() }
        )
        foreach ($t in $tries) {
            if ($this.Dispositivos.Count -gt 0) { break }
            try { & $t } catch { }
        }
    }

    [pscustomobject] _http([string]$url, [hashtable]$headers, [string]$method, $body) {
        $p = @{ Uri = $url; Method = $method; TimeoutSec = $this.TimeoutSeg; ErrorAction = 'Stop' }
        if ($headers) { $p.Headers = $headers }
        if ($body)    { $p.Body = $body; $p.ContentType = 'application/json' }
        # ignora certificados self-signed de routers (solo PS 6+)
        if ($this.SkipCert) { $p.SkipCertificateCheck = $true }
        return Invoke-RestMethod @p
    }

    [void] SondearBanner() {
        foreach ($scheme in @('https', 'http')) {
            try {
                $r = Invoke-WebRequest -Uri "$scheme`://$($this.RHost)/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
                $txt = "$($r.Headers.Server) $($r.Content)".ToLower()
                if ($txt -match 'mikrotik|routeros') { $this.Meta.marca = 'MikroTik' }
                elseif ($txt -match 'unifi|ubnt|ubiquiti') { $this.Meta.marca = 'Ubiquiti' }
                elseif ($txt -match 'openwrt|luci') { $this.Meta.marca = 'OpenWrt' }
                elseif ($txt -match 'fortigate|fortinet') { $this.Meta.marca = 'Fortinet' }
                elseif ($txt -match 'pfsense|netgate') { $this.Meta.marca = 'pfSense' }
                elseif ($txt -match 'huawei') { $this.Meta.marca = 'Huawei' }
                elseif ($txt -match 'tp-link|tplink|archer') { $this.Meta.marca = 'TP-Link' }
                elseif ($txt -match 'dd-wrt') { $this.Meta.marca = 'DD-WRT' }
                if ($r.Headers.Server) { $this.Meta.server = "$($r.Headers.Server)" }
                break
            } catch { }
        }
    }

    [void] _add([string]$mac, [string]$ip, [string]$hn) {
        if (-not $mac) { return }
        $m = ($mac.ToUpper() -replace '-', ':')
        $this.Dispositivos.Add([pscustomobject]@{ mac = $m; ip = $ip; hostname = $hn; fabricante = $null; origen = 'router' })
    }

    # ── MikroTik RouterOS REST API (v7+) ──
    [void] TryMikroTikRest() {
        $pair = "$($this.User):$($this.Pass)"
        $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
        $h = @{ Authorization = "Basic $b64" }
        $lease = $this._http("https://$($this.RHost)/rest/ip/dhcp-server/lease", $h, 'GET', $null)
        foreach ($l in $lease) { $this._add($l.'mac-address', $l.address, $l.'host-name') }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'mikrotik-rest'; $this.Meta.marca = 'MikroTik' }
    }

    # ── UniFi Controller / UDM API ──
    [void] TryUniFi() {
        $body = @{ username = $this.User; password = $this.Pass } | ConvertTo-Json
        # UDM (integrado)
        try {
            $null = $this._http("https://$($this.RHost)/api/auth/login", @{}, 'POST', $body)
            $cli = $this._http("https://$($this.RHost)/proxy/network/api/s/default/stat/sta", @{}, 'GET', $null)
            foreach ($c in $cli.data) { $hn = if ($c.hostname) { $c.hostname } else { $c.name }; $this._add($c.mac, $c.ip, $hn) }
        } catch {
            # Controller clasico
            $null = $this._http("https://$($this.RHost):8443/api/login", @{}, 'POST', $body)
            $cli = $this._http("https://$($this.RHost):8443/api/s/default/stat/sta", @{}, 'GET', $null)
            foreach ($c in $cli.data) { $hn = if ($c.hostname) { $c.hostname } else { $c.name }; $this._add($c.mac, $c.ip, $hn) }
        }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'unifi'; $this.Meta.marca = 'Ubiquiti' }
    }

    # ── OpenWrt / LEDE via ubus (LuCI RPC) ──
    [void] TryOpenWrtUbus() {
        $login = @{ jsonrpc = '2.0'; id = 1; method = 'call'
                    params = @('00000000000000000000000000000000', 'session', 'login',
                               @{ username = $this.User; password = $this.Pass }) } | ConvertTo-Json -Depth 6
        $r = $this._http("http://$($this.RHost)/ubus", @{}, 'POST', $login)
        $sid = $r.result[1].ubus_rpc_session
        if (-not $sid) { return }
        $q = @{ jsonrpc = '2.0'; id = 2; method = 'call'
                params = @($sid, 'luci-rpc', 'getDHCPLeases', @{}) } | ConvertTo-Json -Depth 6
        $d = $this._http("http://$($this.RHost)/ubus", @{}, 'POST', $q)
        foreach ($l in $d.result[1].dhcp_leases) { $this._add($l.macaddr, $l.ipaddr, $l.hostname) }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'openwrt-ubus'; $this.Meta.marca = 'OpenWrt' }
    }

    # ── FortiGate REST API (API key en RouterPass) ──
    [void] TryFortiGate() {
        $h = @{ Authorization = "Bearer $($this.Pass)" }
        $d = $this._http("https://$($this.RHost)/api/v2/monitor/user/device/query", $h, 'GET', $null)
        foreach ($x in $d.results) { $this._add($x.mac, $x.ipv4_address, $x.hostname) }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'fortigate'; $this.Meta.marca = 'Fortinet' }
    }

    # ── pfSense (FauxAPI / REST paquete) ──
    [void] TryPfSense() {
        $h = @{ Authorization = "$($this.User) $($this.Pass)" }
        $d = $this._http("https://$($this.RHost)/api/v1/services/dhcpd/lease", $h, 'GET', $null)
        foreach ($l in $d.data) { $this._add($l.mac, $l.ip, $l.hostname) }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'pfsense'; $this.Meta.marca = 'pfSense' }
    }

    # ── Huawei HG8245/HG659 (form login + tabla) ──
    [void] TryHuaweiHG() {
        $r = Invoke-WebRequest -Uri "http://$($this.RHost)/html/bbsp/common/lancfg.asp" -TimeoutSec $this.TimeoutSeg -UseBasicParsing -ErrorAction Stop
        $rx = [regex]::Matches($r.Content, '([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}).{0,120}?(\d{1,3}(\.\d{1,3}){3})')
        foreach ($m in $rx) { $this._add($m.Groups[1].Value, $m.Groups[3].Value, $null) }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'huawei-scrape'; $this.Meta.marca = 'Huawei' }
    }

    # ── TP-Link (Archer / EAP) — endpoint JSON o scrape ──
    [void] TryTpLink() {
        try {
            $d = $this._http("http://$($this.RHost)/cgi-bin/luci/;stok=/admin/dhcps?form=client", @{}, 'GET', $null)
            foreach ($c in $d) { $this._add($c.macaddr, $c.ipaddr, $c.name) }
        } catch {
            $r = Invoke-WebRequest -Uri "http://$($this.RHost)/" -TimeoutSec $this.TimeoutSeg -UseBasicParsing
            $rx = [regex]::Matches($r.Content, '([0-9A-Fa-f]{2}(-[0-9A-Fa-f]{2}){5}).{0,80}?(\d{1,3}(\.\d{1,3}){3})')
            foreach ($m in $rx) { $this._add($m.Groups[1].Value, $m.Groups[3].Value, $null) }
        }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'tplink'; $this.Meta.marca = 'TP-Link' }
    }

    # ── SNMP: ipNetToMediaPhysAddress (1.3.6.1.2.1.4.22.1.2) ──
    [void] TrySnmp() {
        # Requiere utilitario snmpwalk en PATH (Net-SNMP) o modulo SNMP.
        $snmpwalk = Get-Command snmpwalk -ErrorAction SilentlyContinue
        if (-not $snmpwalk) { return }
        $raw = & snmpwalk -v2c -c $this.SnmpComunidad -t 2 -r 1 $this.RHost 1.3.6.1.2.1.4.22.1.2 2>$null
        foreach ($line in $raw) {
            if ($line -match '1\.4\.22\.1\.2\.\d+\.(\d+\.\d+\.\d+\.\d+)\s.*(([0-9A-Fa-f]{1,2}[ :]){5}[0-9A-Fa-f]{1,2})') {
                $ip = $Matches[1]
                $mac = ($Matches[2] -replace ' ', ':' -replace '^:', '')
                $this._add($mac, $ip, $null)
            }
        }
        if ($this.Dispositivos.Count -gt 0) { $this.Metodo = 'snmp' }
    }

    # ── UPnP / SSDP: descubre el IGD y lee su modelo (no da clientes,
    #    pero identifica marca/modelo cuando el banner HTTP falla) ──
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
                $loc = $Matches[1]
                $xml = Invoke-RestMethod -Uri $loc -TimeoutSec 5 -ErrorAction Stop
                $this.Meta.upnpModelo = "$($xml.root.device.manufacturer) $($xml.root.device.modelName)".Trim()
                if (-not $this.Meta.marca -and $xml.root.device.manufacturer) { $this.Meta.marca = "$($xml.root.device.manufacturer)" }
            }
        } catch { }
    }

    # ── Ultimo recurso: probar endpoints JSON comunes de DHCP ──
    [void] TryGenericJson() {
        $paths = @('/api/dhcp/leases', '/dhcp-leases.json', '/status_dhcp.json',
                   '/cgi-bin/dhcp_leases', '/data/dhcp_lease.json', '/api/hosts')
        foreach ($scheme in @('https', 'http')) {
            foreach ($p in $paths) {
                try {
                    $d = $this._http("$scheme`://$($this.RHost)$p", @{}, 'GET', $null)
                    $items = if ($d -is [array]) { $d } elseif ($d.leases) { $d.leases } elseif ($d.data) { $d.data } else { @() }
                    foreach ($x in $items) {
                        $mac = @($x.mac, $x.macaddr, $x.hwaddr, $x.'mac-address') | Where-Object { $_ } | Select-Object -First 1
                        $ip  = @($x.ip, $x.ipaddr, $x.address, $x.'ip-address') | Where-Object { $_ } | Select-Object -First 1
                        $hn  = @($x.hostname, $x.name, $x.'host-name') | Where-Object { $_ } | Select-Object -First 1
                        if ($mac) { $this._add($mac, $ip, $hn) }
                    }
                    if ($this.Dispositivos.Count -gt 0) { $this.Metodo = "generic:$p"; return }
                } catch { }
            }
        }
    }
}

function Get-DispositivosRouter([string]$gateway) {
    if (-not $cfg.HabilitarRouter) { return @() }
    $rHost = if ($cfg.RouterHost) { $cfg.RouterHost } else { $gateway }
    if (-not $rHost) { return @() }
    try {
        $skipCert = $PSVersionTable.PSVersion.Major -ge 6
        $probe = [RouterProbe]::new($rHost, $cfg.RouterUser, $cfg.RouterPass, $cfg.RouterSnmpComunidad, [int]$cfg.TimeoutSeg, $skipCert)
        $probe.Run()
        if ($probe.Metodo -ne 'ninguno' -and $probe.Metodo -ne '') {
            Write-Log "Router: metodo=$($probe.Metodo) marca=$($probe.Meta.marca) modelo=$($probe.Meta.upnpModelo) dispositivos=$($probe.Dispositivos.Count)"
        }
        return @($probe.Dispositivos)
    } catch {
        Write-Log "Router: fallo la sonda ($($_.Exception.Message))"
        return @()
    }
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

    # merge por MAC: el router gana (mas fiable) pero conserva hostname del local
    $mapa = @{}
    foreach ($d in $locales) { $mapa[$d.mac] = $d }
    foreach ($d in $router) {
        if ($mapa.ContainsKey($d.mac)) {
            if (-not $d.hostname) { $d.hostname = $mapa[$d.mac].hostname }
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
