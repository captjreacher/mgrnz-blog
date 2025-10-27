@echo off
echo ========================================
echo    STARTING ADMIN API SERVER
echo ========================================
echo.

:: Check if Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js is available
echo.

:: Check if admin-api.js exists
if not exist admin-api.js (
    echo ❌ admin-api.js not found!
    echo Make sure you're in the correct directory
    pause
    exit /b 1
)

echo ✅ Admin API file found
echo.

:: Install dependencies if needed
if not exist node_modules (
    echo 📦 Installing dependencies...
    npm install express cors
    echo.
)

echo 🚀 Starting Admin API Server...
echo.
echo ========================================
echo    SERVER RUNNING
echo ========================================
echo.
echo 🌐 Admin API: http://localhost:3002
echo 📝 Direct Admin: http://localhost:3000/admin-direct.html
echo 🚀 Auto Admin: http://localhost:3000/admin-auto.html
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

:: Start the server
node admin-api.js