@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)

echo Installing project dependencies...
call npm.cmd install
if errorlevel 1 (
  echo Setup failed. Review the message above and try again.
  pause
  exit /b 1
)

echo.
echo Setup complete. Run run.bat to start Codex Chat UI.
pause

