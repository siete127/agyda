@echo off
cd /d %~dp0
py -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if not exist .env copy .env.example .env
echo.
echo Configura el archivo .env y despues ejecuta:
echo call .venv\Scripts\activate.bat
echo python main.py --desde 2026-07-13 --hasta 2026-07-13
pause
