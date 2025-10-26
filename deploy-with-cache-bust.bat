@echo off
echo ========================================
echo 🚀 DEPLOY WITH CACHE BUSTING
echo ========================================
echo.

echo 📝 Current git status:
git status --porcelain
echo.

if not "%1"=="" (
    echo 💾 Committing changes: %*
    git add .
    git commit -m "%*"
    echo.
)

echo 🔄 Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo ❌ Push failed!
    pause
    exit /b 1
)
echo.

echo ⏰ Deployment initiated at: %DATE% %TIME%
echo.

echo 🎯 TESTING DEPLOYMENT STATUS...
timeout /t 10 /nobreak >nul

echo.
echo 🌐 Testing site response:
curl -I https://mgrnz.com/ 2>nul | findstr "HTTP\|CF-Cache-Status\|Last-Modified"
echo.

echo 📋 URLs to test after 3-5 minutes:
echo   🏠 Main site: https://mgrnz.com/
echo   📝 Admin form: https://mgrnz.com/admin-form-v2.html
echo   🧪 Cache bypass: https://mgrnz.com/admin-form-v2.html?v=%RANDOM%
echo.

echo 💡 If pages show old content:
echo   1. Go to Cloudflare Dashboard
echo   2. Navigate to Caching ^> Purge Cache
echo   3. Click "Purge Everything"
echo   4. Wait 30 seconds and test again
echo.

echo ========================================
echo ✅ DEPLOYMENT COMPLETE
echo Wait 3-5 minutes then test your URLs
echo ========================================

pause