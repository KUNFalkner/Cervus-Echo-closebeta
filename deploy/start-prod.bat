@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem  Cervus Echo - production preview launcher (robust)
rem    backend uvicorn 127.0.0.1:8000  +  nginx reverse proxy on :8088
rem    open http://localhost:8088/ when finished
rem
rem  NOTE: this file is intentionally ASCII-only. cmd.exe parses .bat with the
rem  system OEM codepage (GBK here); UTF-8 Chinese comments corrupt the parser
rem  and even break %VAR% expansion.
rem
rem  Design notes (why this is not the naive version):
rem    * nginx path is discovered dynamically. The previous script hardcoded
rem      nginx-1.31.3; after a WinGet upgrade the on-disk dir can be emptied
rem      (only the in-memory process survives) and the hardcoded check failed
rem      with exit /b 1, so the backend was never started. We now scan any
rem      nginx-* version under the WinGet packages dir, C:\nginx, and PATH,
rem      and fall back to `winget install` if nothing is found.
rem    * config lives at conf\treehole (matching the convention actually used
rem      in production) and is always re-deployed from deploy\nginx.conf.
rem    * the backend is started with a python that actually has fastapi +
rem      sqlmodel (the hermes venv), not whatever `uvicorn` is first on PATH.
rem    * a service that is already listening is left alone instead of being
rem      killed and restarted (avoids disrupting a healthy running instance).

set "ROOT=%~dp0.."

rem =====================================================================
rem  1. locate nginx.exe (do NOT hardcode a version)
rem =====================================================================
set "NGINX="
rem a) WinGet package dirs (any nginx-* version)
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\nginxinc.nginx_*") do (
    for /d %%V in ("%%~D\nginx-*") do (
        if exist "%%~V\nginx.exe" if not defined NGINX set "NGINX=%%~V"
    )
)
rem b) classic C:\nginx
if not defined NGINX if exist "C:\nginx\nginx.exe" set "NGINX=C:\nginx"
rem c) PATH
if not defined NGINX (
    for /f "delims=" %%P in ('where nginx 2^>nul') do if not defined NGINX set "NGINX=%%~dpP."
)
if not defined NGINX (
    echo [INFO] nginx not found on disk, installing via winget ...
    winget install --id nginxinc.nginx --force --disable-interactivity >nul 2>&1
    rem re-scan after install
    for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\nginxinc.nginx_*") do (
        for /d %%V in ("%%~D\nginx-*") do (
            if exist "%%~V\nginx.exe" if not defined NGINX set "NGINX=%%~V"
        )
    )
)
if not defined NGINX (
    echo [ERROR] nginx still not found. Install manually: winget install --id nginxinc.nginx
    exit /b 1
)
echo [OK] nginx at "%NGINX%\nginx.exe"

rem config dir (standardized to conf\treehole to match production)
set "NGINX_CONF=conf\treehole\nginx.conf"
if not exist "%NGINX%\conf\treehole" mkdir "%NGINX%\conf\treehole"
copy /Y "%ROOT%\deploy\nginx.conf" "%NGINX%\conf\treehole\nginx.conf" >nul

rem =====================================================================
rem  2. ensure backend is listening on 127.0.0.1:8000
rem =====================================================================
powershell -NoProfile -Command "$p=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if($p){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
    echo [3/4] starting backend on 127.0.0.1:8000 ...

    rem pick a python that actually has fastapi + sqlalchemy + jose + bcrypt
    set "BE_PY="
    for %%C in (
        "%ROOT%\backend\.venv\Scripts\python.exe"
        "python"
        "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        "%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\python.exe"
    ) do (
        if not defined BE_PY (
            "%%~C" -c "import fastapi, sqlalchemy, uvicorn, jose, bcrypt" >nul 2>&1
            if not errorlevel 1 set "BE_PY=%%~C"
        )
    )
    if not defined BE_PY (
        echo [ERROR] no python with fastapi+sqlalchemy+uvicorn+jose+bcrypt found.
        exit /b 1
    )
    rem NOTE: !BE_PY! (delayed expansion) - %BE_PY% is expanded at parse time,
    rem before the loop above assigns it, which launched an empty command.
    echo [OK] backend python: !BE_PY!

    rem inner quotes around !BE_PY! matter: the project path contains spaces,
    rem and `start` strips one layer, leaving an unquoted "E:\mimo" otherwise.
    start "cervus-backend" /D "%ROOT%\backend" /MIN cmd /c ""!BE_PY!" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >> uvicorn_run.log 2>&1"
    rem when launched from Git Bash, the Unix `timeout` shadows the cmd builtin
    powershell -NoProfile -Command "Start-Sleep -Seconds 6"
) else (
    echo [3/4] backend already listening on :8000, skip
)

rem =====================================================================
rem  3. ensure nginx is listening on :8088
rem =====================================================================
powershell -NoProfile -Command "$p=Get-NetTCPConnection -LocalPort 8088 -State Listen -ErrorAction SilentlyContinue; if($p){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
    echo [4/4] starting nginx on :8088 ...
    "%NGINX%\nginx.exe" -p "%NGINX%" -c %NGINX_CONF% -t >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] nginx config test failed:
        "%NGINX%\nginx.exe" -p "%NGINX%" -c %NGINX_CONF% -t
        exit /b 1
    )
    start "" /D "%NGINX%" "%NGINX%\nginx.exe" -p "%NGINX%" -c %NGINX_CONF%
    powershell -NoProfile -Command "Start-Sleep -Seconds 2"
) else (
    echo [4/4] nginx already listening on :8088, reload to pick up config changes ...
    "%NGINX%\nginx.exe" -p "%NGINX%" -c %NGINX_CONF% -s reload >nul 2>&1
)

echo.
echo   Ready. Open http://localhost:8088/
echo   Stop nginx: "%NGINX%\nginx.exe" -p "%NGINX%" -c %NGINX_CONF% -s stop
echo.
endlocal
