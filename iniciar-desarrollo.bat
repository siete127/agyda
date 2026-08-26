@echo off
REM ============================================================
REM  Levanta el sistema completo de Intranet ArdaBytec en modo
REM  desarrollo: Backend + Frontend (panel interno) + Pagina
REM  publica. Cada uno en su propia ventana.
REM
REM  Backend      -> http://localhost:8445
REM  Frontend     -> http://localhost:5173
REM  Pagina web   -> http://localhost:8080
REM ============================================================

set ROOT=%~dp0

echo Iniciando Backend (BackAgyda) en puerto 8445...
start "Backend - BackAgyda (8445)" cmd /k "cd /d "%ROOT%BackAgyda" && set "NODE_ENV=development" && npm run dev"

echo Esperando a que el backend levante...
timeout /t 6 /nobreak >nul

echo Iniciando Frontend (FrontAgyda) en puerto 5173...
start "Frontend - FrontAgyda (5173)" cmd /k "cd /d "%ROOT%FrontAgyda" && npm run dev"

echo Iniciando Pagina publica (extra\Pagina de Intranet_1) en puerto 8080...
start "Pagina publica (8080)" cmd /k "cd /d "%ROOT%extra\Pagina de Intranet_1" && set DEV_PORT=8080 && set BACKEND_TARGET=http://127.0.0.1:8445 && npm run dev"

echo.
echo ============================================================
echo  Sistema iniciado. Abriendo en 3 ventanas separadas:
echo    Backend    -> http://localhost:8445
echo    Frontend   -> http://localhost:5173
echo    Pagina web -> http://localhost:8080
echo ============================================================
echo.
pause
