@echo off
cd /d "%~dp0"
set "LC_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "LC_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
"%LC_NODE%" -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)" >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then run this file again.
  pause
  exit /b 1
)
echo.
echo The Love Channels - local preview
echo Open http://127.0.0.1:4173/?look=blue-trio in your browser.
echo Keep this window open while using the website.
echo.
"%LC_NODE%" server/index.mjs --demo
pause
