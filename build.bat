@echo off
rem Rebuilds the pages in static\ from the React app in lumen-source\ (run after changing anything in lumen-source\src).
setlocal
set "PATH=%~dp0tools\node;%PATH%"
cd /d "%~dp0lumen-source"
if not exist node_modules call npm install --legacy-peer-deps --no-audit --no-fund
call npm run build
endlocal
