@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ est requis. Installe-le depuis https://nodejs.org/
  pause
  exit /b 1
)
echo Lancement du relais local Riftbound...
node server.mjs
echo.
echo Le relais est arrete.
pause
