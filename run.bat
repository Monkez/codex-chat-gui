@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo Dependencies are missing. Running setup first...
  call setup.bat
  if errorlevel 1 exit /b 1
)

echo Starting Codex Chat UI at http://127.0.0.1:5173
echo Press Ctrl+C to stop both the UI and local bridge.
call npm.cmd run dev

