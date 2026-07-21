@echo off
setlocal
cd /d "%~dp0"

echo Running project verification...
call npm.cmd test
if errorlevel 1 (
  echo.
  echo Verification failed. Review the message above.
  pause
  exit /b 1
)

echo.
echo All checks passed.
