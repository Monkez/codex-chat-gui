@echo off
setlocal
cd /d "%~dp0"

echo Building demo application...
call npm.cmd run build
if errorlevel 1 goto :failed

echo Building reusable UI package...
call npm.cmd run build:lib
if errorlevel 1 goto :failed

echo.
echo Build completed successfully.
exit /b 0

:failed
echo.
echo Build failed. Review the message above.
pause
exit /b 1

