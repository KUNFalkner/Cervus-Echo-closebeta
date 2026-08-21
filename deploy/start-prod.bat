@echo off
setlocal

rem  Cervus Echo - production preview launcher
rem    backend uvicorn 127.0.0.1:8000  +  nginx reverse proxy on :80
rem    open http://localhost/ when finished
rem
rem  NOTE: this file is intentionally ASCII-only. cmd.exe parses .bat with the
rem  system OEM codepage (GBK here); UTF-8 Chinese comments corrupt the parser
rem  and even break %VAR% expansion.

set "ROOT=%~dp0.."
set "NGINX=%LOCALAPPDATA%\Microsoft\WinGet\Packages\nginxinc.nginx_Microsoft.Winget.Source_8wekyb3d8bbwe\nginx-1.31.3"

if not exist "%NGINX%\nginx.exe" (
    echo [ERROR] nginx not found. Run: winget install --id nginxinc.nginx
    exit /b 1
)

echo [1/4] stopping existing services ...
"%NGINX%\nginx.exe" -p "%NGINX%" -c conf\cervus\nginx.conf -s stop >nul 2>&1
powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force }"

rem nginx cannot read paths containing non-ASCII characters, and this project
rem lives under a Chinese path, so copy the config to an ASCII-only location.
echo [2/4] syncing nginx config ...
if not exist "%NGINX%\conf\cervus" mkdir "%NGINX%\conf\cervus"
copy /Y "%ROOT%\deploy\nginx.conf" "%NGINX%\conf\cervus\nginx.conf" >nul

echo [3/4] starting backend on 127.0.0.1:8000 ...
start "cervus-backend" /D "%ROOT%\backend" /MIN cmd /c "uvicorn app.main:app --host 127.0.0.1 --port 8000"
rem use PowerShell to sleep: when launched from Git Bash, the Unix `timeout`
rem shadows the cmd builtin and errors out
powershell -NoProfile -Command "Start-Sleep -Seconds 5"

echo [4/4] starting nginx on :80 ...
"%NGINX%\nginx.exe" -p "%NGINX%" -c conf\cervus\nginx.conf -t >nul 2>&1
if errorlevel 1 (
    echo [ERROR] nginx config test failed:
    "%NGINX%\nginx.exe" -p "%NGINX%" -c conf\cervus\nginx.conf -t
    exit /b 1
)
start "" /D "%NGINX%" "%NGINX%\nginx.exe" -p "%NGINX%" -c conf\cervus\nginx.conf
powershell -NoProfile -Command "Start-Sleep -Seconds 2"

echo.
echo   Ready. Open http://localhost/
echo   Stop nginx: "%NGINX%\nginx.exe" -p "%NGINX%" -c conf\cervus\nginx.conf -s stop
echo.
endlocal
