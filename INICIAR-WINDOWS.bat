@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Primero instala Node.js LTS desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)
node scripts/start.mjs
pause
