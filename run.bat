@echo off
set PORT=%1
if "%PORT%"=="" set PORT=3000
echo Starting server on port %PORT%...
rem Start server in new CMD window so it stays running
start "Server" cmd /k "set PORT=%PORT% && node server.js"
timeout /t 1 >nul
start "" "http://localhost:%PORT%"
