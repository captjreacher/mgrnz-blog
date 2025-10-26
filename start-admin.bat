@echo off
echo Starting Hugo Admin System...
echo.

echo Installing dependencies...
call npm install

echo.
echo Starting Admin API server...
start "Admin API" cmd /k "npm start"

echo.
echo Starting Hugo development server...
start "Hugo Server" cmd /k "hugo server"

echo.
echo Admin system started!
echo - Hugo site: http://localhost:1313
echo - Admin API: http://localhost:3001
echo - Admin panel: http://localhost:1313/admin/
echo.
echo Press any key to exit...
pause > nul