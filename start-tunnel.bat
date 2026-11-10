@echo off
setlocal
cd /d "%~dp0"
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo Cloudflared non trouve. Installe Cloudflare Tunnel depuis :
  echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)
echo.
echo ATTENTION : ce tunnel rend l'interface locale joignable depuis Internet.
echo Garde le jeton affiche par start-local.bat prive.
echo Ouvre d'abord start-local.bat dans un autre terminal.
echo.
pause
cloudflared tunnel --url http://127.0.0.1:8787
echo.
echo Tunnel termine. L'adresse temporaire n'est plus active.
pause
