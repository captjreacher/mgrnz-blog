@echo off
echo 🚀 RELIABLE DEPLOYMENT SYSTEM
echo ========================================

:: Generate timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "SS=%dt:~12,2%"
set "TIMESTAMP=%YYYY%-%MM%-%DD% %HH%:%Min%:%SS%"

:: Get current commit hash
for /f %%i in ('git rev-parse --short HEAD') do set "COMMIT=%%i"

echo 📝 Updating deployment tracking files...

:: Update deployment tracking files
(
echo DEPLOYMENT TIMESTAMP: %TIMESTAMP%
echo COMMIT: %COMMIT%
echo STATUS: RELIABLE DEPLOYMENT ACTIVE
echo HUGO_VERSION: 0.150.1
echo BUILD_COMMAND: hugo --gc --minify
echo CACHE_BUSTER: %RANDOM%
) > static/deployment-timestamp.txt

(
echo 🔧 BUILD INFO: %TIMESTAMP%
echo ========================================
echo 📅 Last Deploy: %TIMESTAMP%
echo 🔧 Build: Hugo Static Site
echo 🌐 CDN: Cloudflare Pages
echo 📍 Commit: %COMMIT%
echo ✅ Status: RELIABLE DEPLOYMENT
echo 🚀 Hugo Version: 0.150.1
echo ⚡ Cache Buster: %RANDOM%
echo 🔄 Auto-deploy: ACTIVE
echo ========================================
) > static/build-info.txt

:: Cache buster
(
echo CACHE-BUSTER: %TIMESTAMP%
echo FORCE-REBUILD: %COMMIT%
echo RANDOM: %RANDOM%
echo DEPLOYMENT: RELIABLE
) > static/CACHE-BUSTER.txt

:: Test Hugo build locally first
echo 🧪 Testing Hugo build...
hugo --gc --minify --quiet
if %errorlevel% neq 0 (
    echo ❌ Hugo build failed! Fix errors before deploying.
    echo.
    echo Check for:
    echo - Missing theme files
    echo - Invalid markdown syntax
    echo - Configuration errors
    echo.
    pause
    exit /b 1
)
echo ✅ Hugo build successful

:: Show git status
echo.
echo 📋 Current changes:
git status --porcelain

:: Commit and deploy
echo.
echo 💾 Committing changes...
git add .
if not "%~1"=="" (
    git commit -m "%~1"
) else (
    git commit -m "Deploy: %TIMESTAMP% [%COMMIT%] - Reliable deployment system"
)

if %errorlevel% neq 0 (
    echo ⚠️  No changes to commit, pushing existing changes...
)

echo 🚀 Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo ❌ Push failed!
    echo.
    echo Possible issues:
    echo - Network connectivity
    echo - Authentication problems
    echo - Repository access
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ DEPLOYMENT INITIATED SUCCESSFULLY
echo ========================================
echo.
echo 🔍 Verification URLs (check in 3-5 minutes):
echo   📊 Build Info: https://mgrnz.com/build-info.txt
echo   ⏰ Timestamp: https://mgrnz.com/deployment-timestamp.txt
echo   🏠 Main Site: https://mgrnz.com/
echo   🔧 Admin: https://mgrnz.com/admin/
echo.
echo 💡 Expected Results:
echo   - Build info shows: %TIMESTAMP%
echo   - Timestamp shows: %COMMIT%
echo   - All changes are live
echo.
echo ⚡ RELIABLE DEPLOYMENT COMPLETE
echo ========================================

:: Optional: Wait and verify
echo.
set /p verify="🔍 Wait 3 minutes and verify deployment? (y/n): "
if /i "%verify%"=="y" (
    echo.
    echo ⏳ Waiting 3 minutes for deployment...
    timeout /t 180 /nobreak >nul
    echo.
    echo 🧪 Testing deployment...
    powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/build-info.txt' -UseBasicParsing; if ($response.Content -match '%TIMESTAMP%') { Write-Host '✅ DEPLOYMENT SUCCESSFUL' -ForegroundColor Green } else { Write-Host '❌ Deployment may still be processing' -ForegroundColor Yellow } } catch { Write-Host '❌ Site unreachable - check Cloudflare Pages dashboard' -ForegroundColor Red }"
)

pause