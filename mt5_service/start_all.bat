@echo off
REM ============================================================================
REM  start_all.bat - bring up the MT5 live-quote bridge + Cloudflare named tunnel
REM
REM  Runs on the Windows trading PC next to the MT5 terminal. Starts two pieces
REM  in their own windows:
REM    1) mt5_service.py        - live-quote HTTP bridge on 127.0.0.1:<port>
REM    2) cloudflared           - named tunnel exposing it at a STABLE public URL
REM
REM  The pusher.py snapshot daemon (dashboards) is NOT started here - it runs
REM  separately. See mt5_service\README.md for the one-time setup.
REM ============================================================================
setlocal EnableDelayedExpansion

REM repo root = this script's folder, one level up
cd /d "%~dp0\.."

REM --- load mt5_service\service.env (KEY=VALUE, '#' comments allowed) ----------
if not exist "mt5_service\service.env" (
    echo ERROR: mt5_service\service.env not found.
    echo        Copy mt5_service\service.env.example to mt5_service\service.env
    echo        and fill it in. See mt5_service\README.md.
    pause
    exit /b 1
)
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("mt5_service\service.env") do (
    set "key=%%A"
    if not "!key!"=="" set "!key!=%%B"
)

if not exist "cloudflared.exe" (
    echo ERROR: cloudflared.exe not found in repo root.
    pause
    exit /b 1
)
if not exist "mt5_service\tunnel.yml" (
    echo ERROR: mt5_service\tunnel.yml not found - run the one-time tunnel setup.
    echo        See mt5_service\README.md.
    pause
    exit /b 1
)

echo.
echo  Starting MT5 live-quote bridge + Cloudflare tunnel...
echo    Port:    %MT5_SERVICE_PORT%
echo    Tunnel:  %TUNNEL_NAME%
echo    Public:  %PUBLIC_URL%
echo.

REM --- 1) live-quote bridge (inherits MT5_SERVICE_KEY/PORT from this env) -------
start "MT5 bridge :%MT5_SERVICE_PORT%" cmd /k "python mt5_service.py"

REM give the bridge a moment to bind before the tunnel points at it
timeout /t 3 /nobreak >nul

REM --- 2) Cloudflare named tunnel -> http://localhost:%MT5_SERVICE_PORT% --------
start "cloudflared tunnel" cmd /k "cloudflared.exe tunnel --config mt5_service\tunnel.yml run %TUNNEL_NAME%"

echo  Both launched in separate windows. Close those windows to stop.
echo.
echo  Health (local):  http://localhost:%MT5_SERVICE_PORT%/health
echo  Health (public): %PUBLIC_URL%/health
echo.
endlocal
