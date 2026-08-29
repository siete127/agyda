<#
    AGYDA - Instalador del agente de monitoreo de red
    -------------------------------------------------
    Uso rapido (una linea, como administrador):
        irm https://intranet.ardabytec.vip/agente-red/install.ps1 | iex

    O local:
        powershell -ExecutionPolicy Bypass -File .\install.ps1

    Hace:
      1. Crea C:\AGYDA\agente-red\ y copia/descarga agente-red.ps1
      2. Instala Ookla Speedtest CLI (winget, o descarga el zip)
      3. Pregunta API key / EnlaceId / nombre del agente y escribe el config
      4. Registra la Tarea Programada "AGYDA - Monitor de Red" (cada 2 min, SYSTEM)
      5. Corre una prueba y muestra el resultado
#>

$ErrorActionPreference = 'Stop'
$InstallDir = 'C:\AGYDA\agente-red'
$TaskName   = 'AGYDA - Monitor de Red'
$BaseUrl    = 'https://intranet.ardabytec.vip/agente-red'   # de donde bajar el .ps1 si no esta local

function Assert-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "Este instalador necesita ejecutarse como Administrador." -ForegroundColor Red
        Write-Host "Click derecho en PowerShell -> 'Ejecutar como administrador' y vuelve a correrlo." -ForegroundColor Yellow
        exit 1
    }
}

function Ensure-Dir {
    if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
}

function Get-Agente {
    $localSrc = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'agente-red.ps1'
    $dst = Join-Path $InstallDir 'agente-red.ps1'
    if (Test-Path $localSrc) {
        Copy-Item $localSrc $dst -Force
        Write-Host "  agente-red.ps1 copiado desde la carpeta local." -ForegroundColor Green
    } else {
        Write-Host "  descargando agente-red.ps1 desde $BaseUrl ..." -ForegroundColor Gray
        Invoke-WebRequest -Uri "$BaseUrl/agente-red.ps1" -OutFile $dst -UseBasicParsing
        Write-Host "  agente-red.ps1 descargado." -ForegroundColor Green
    }
}

function Install-Speedtest {
    if (Get-Command speedtest -ErrorAction SilentlyContinue) {
        Write-Host "  Speedtest CLI ya instalado." -ForegroundColor Green
        return
    }
    # 1) winget
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try {
            Write-Host "  instalando Speedtest CLI con winget ..." -ForegroundColor Gray
            winget install --id Ookla.Speedtest.CLI --silent --accept-package-agreements --accept-source-agreements | Out-Null
            if (Get-Command speedtest -ErrorAction SilentlyContinue) {
                Write-Host "  Speedtest CLI instalado (winget)." -ForegroundColor Green
                return
            }
        } catch { }
    }
    # 2) descarga directa del zip de Ookla
    try {
        Write-Host "  descargando Speedtest CLI de ookla.com ..." -ForegroundColor Gray
        $zip = Join-Path $env:TEMP 'speedtest.zip'
        Invoke-WebRequest -Uri 'https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-win64.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $InstallDir -Force
        Remove-Item $zip -Force
        if (Test-Path (Join-Path $InstallDir 'speedtest.exe')) {
            Write-Host "  speedtest.exe colocado en $InstallDir." -ForegroundColor Green
            return
        }
    } catch { }
    Write-Host "  No se pudo instalar Speedtest CLI. El agente seguira reportando" -ForegroundColor Yellow
    Write-Host "  latencia/dispositivos; la velocidad quedara sin datos hasta instalarlo." -ForegroundColor Yellow
}

function Write-Config {
    $cfgPath = Join-Path $InstallDir 'agente-red.config.json'
    if (Test-Path $cfgPath) {
        Write-Host "  Ya existe un config. Se conserva. (Borralo si quieres reconfigurar.)" -ForegroundColor Yellow
        return
    }
    Write-Host ""
    Write-Host "  Configuracion del agente:" -ForegroundColor Cyan
    $apiKey  = Read-Host "   API Key (de Configuracion -> API Keys)"
    $empresa = Read-Host "   Empresa (enter = agyda)"
    if (-not $empresa) { $empresa = 'agyda' }
    $enlace  = Read-Host "   EnlaceId (numero; enter = ninguno)"
    $nombre  = Read-Host "   Nombre del agente (enter = $env:COMPUTERNAME)"
    if (-not $nombre) { $nombre = $env:COMPUTERNAME }
    $rHabil  = Read-Host "   Leer tabla DHCP del router? (s/N)"
    $rUser = ''; $rPass = ''; $rHost = ''
    $habilR = $false
    if ($rHabil -match '^[sSyY]') {
        $habilR = $true
        $rHost = Read-Host "     IP del router (enter = gateway por defecto)"
        $rUser = Read-Host "     Usuario del router (enter = admin)"
        if (-not $rUser) { $rUser = 'admin' }
        $rPassSec = Read-Host "     Password del router" -AsSecureString
        $rPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($rPassSec))
    }

    $cfg = [ordered]@{
        ApiUrl              = 'https://intranet.ardabytec.vip:8444/api/tecnologia/red/ingesta'
        ApiKey              = $apiKey
        Empresa             = $empresa
        EnlaceId            = if ($enlace) { [int]$enlace } else { $null }
        AgenteNombre        = $nombre
        PingHosts           = @('8.8.8.8', '1.1.1.1', 'www.google.com')
        SpeedtestCadaMin    = 30
        SpeedtestExe        = ''
        HabilitarRouter     = $habilR
        RouterHost          = $rHost
        RouterUser          = $rUser
        RouterPass          = $rPass
        RouterSnmpComunidad = 'public'
        TimeoutSeg          = 30
    }
    $cfg | ConvertTo-Json | Set-Content -Path $cfgPath -Encoding UTF8
    Write-Host "  config escrito en $cfgPath" -ForegroundColor Green
}

function Register-Task {
    $ps1 = Join-Path $InstallDir 'agente-red.ps1'
    $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes 2)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "  tarea programada '$TaskName' registrada (cada 2 min, como SYSTEM)." -ForegroundColor Green
}

function Test-Run {
    Write-Host ""
    Write-Host "  Corriendo una prueba..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 12
    $log = Join-Path $InstallDir 'agente-red.log'
    if (Test-Path $log) {
        Write-Host "  --- ultimas lineas del log ---" -ForegroundColor Gray
        Get-Content $log -Tail 5 | ForEach-Object { Write-Host "   $_" }
    } else {
        Write-Host "  (aun sin log; revisa en 1-2 min: $log)" -ForegroundColor Yellow
    }
}

# ── main ──
Assert-Admin
Write-Host "== AGYDA - Instalador del agente de monitoreo de red ==" -ForegroundColor Cyan
Ensure-Dir
Get-Agente
Install-Speedtest
Write-Config
Register-Task
Test-Run
Write-Host ""
Write-Host "Listo. A los 2-4 minutos deberia aparecer la primera medicion en" -ForegroundColor Green
Write-Host "Intranet -> Internet y redes -> Monitoreo en vivo." -ForegroundColor Green
Write-Host ""
Write-Host "Desinstalar:  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor Gray
