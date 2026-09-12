@echo off
setlocal EnableExtensions
rem  Cervus Echo - start nginx reverse proxy on :8088 only (backend assumed running on :8000)
rem  Native Windows paths only. nginx self-daemonizes on Windows, so no `start` needed.
set "NGINX=C:\Users\FXK\AppData\Local\Microsoft\WinGet\Packages\nginxinc.nginx_Microsoft.Winget.Source_8wekyb3d8bbwe\nginx-1.31.3"
set "CONF=%NGINX%\conf\treehole\nginx.conf"
if not exist "%NGINX%\logs" mkdir "%NGINX%\logs"
"%NGINX%\nginx.exe" -p "%NGINX%" -c "%CONF%" -t
if errorlevel 1 (
  echo [ERROR] nginx config test failed
  exit /b 1
)
"%NGINX%\nginx.exe" -p "%NGINX%" -c "%CONF%"
echo nginx started on :8088
endlocal
