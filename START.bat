@echo off
setlocal
title SIH Intelligence Platform - Launcher
cd /d "%~dp0"

echo ============================================================
echo   SIH Intelligence Platform
echo ============================================================
echo.

rem ---- 1. Pre-flight checks --------------------------------------------------
if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] Backend virtual environment not found at backend\.venv
    echo         Install Python 3.14 and run:
    echo           cd backend
    echo           py -3.14 -m venv .venv
    echo           .venv\Scripts\python.exe -m pip install -r requirements.txt
    goto :fail
)

"backend\.venv\Scripts\python.exe" -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] The backend venv cannot start Python.
    echo         It needs Python 3.14 installed at C:\Program Files\Python314
    echo         ^(winget install Python.Python.3.14^)
    goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js / npm not found on PATH. Install Node.js 20+.
    goto :fail
)

if not exist "frontend\node_modules" (
    echo [setup] Installing frontend dependencies - first run only...
    pushd frontend
    call npm install
    popd
    if errorlevel 1 goto :fail
)

rem ---- 2. Free the ports -----------------------------------------------------
rem A stale server left on 8000 keeps answering with old code, which makes
rem every change look like it did nothing. Clear both ports before starting.
echo [1/4] Freeing ports 8000 and 3000...
powershell -NoProfile -Command ^
  "Get-NetTCPConnection -LocalPort 8000,3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

rem ---- 3. Backend ------------------------------------------------------------
echo [2/4] Starting backend on http://localhost:8000 ...
start "SIH Backend (port 8000)" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

rem ---- 4. Frontend -----------------------------------------------------------
echo [3/4] Starting frontend on http://localhost:3000 ...
start "SIH Frontend (port 3000)" /D "%~dp0frontend" cmd /k "npm run dev"

rem ---- 5. Wait for the backend, then open the browser ------------------------
echo [4/4] Waiting for the backend to come up ^(models warm in the background^)...
powershell -NoProfile -Command ^
  "$ok=$false; for($i=0;$i -lt 90;$i++){ try { Invoke-WebRequest 'http://127.0.0.1:8000/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; $ok=$true; break } catch { Start-Sleep -Seconds 2 } }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
    echo [WARN] Backend did not answer within 3 minutes - check the "SIH Backend" window.
) else (
    echo        Backend is up.
)

powershell -NoProfile -Command ^
  "for($i=0;$i -lt 60;$i++){ try { Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing -TimeoutSec 5 | Out-Null; break } catch { Start-Sleep -Seconds 2 } }"

start "" "http://localhost:3000"

echo.
echo ============================================================
echo   Running.
echo     Dashboard : http://localhost:3000
echo     API docs  : http://localhost:8000/api/docs
echo     Login     : admin@sih.gov.in / Admin@SIH2026
echo.
echo   The five NLP models finish loading ~2 minutes after start.
echo   To stop: close the "SIH Backend" and "SIH Frontend" windows.
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo Launch aborted.
pause
exit /b 1
