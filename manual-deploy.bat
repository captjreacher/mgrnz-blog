@echo off
echo ========================================
echo    MANUAL CLOUDFLARE PAGES DEPLOYMENT
echo ========================================
echo.

echo Step 1: Building Hugo site locally...
hugo --gc --minify
if %errorlevel% neq 0 (
    echo ❌ Hugo build failed!
    pause
    exit /b 1
)
echo ✅ Hugo build successful
echo.

echo Step 2: Checking generated files...
dir public
echo.

echo Step 3: Manual deployment instructions:
echo.
echo 1. Go to: https://dash.cloudflare.com/
echo 2. Navigate to: Pages → your project
echo 3. Click: "Create deployment"
echo 4. Upload the 'public' folder contents
echo 5. Or check if auto-deploy is working
echo.

echo ========================================
echo    DEPLOYMENT DIAGNOSTICS
echo ========================================
echo.
echo If auto-deploy isn't working, check:
echo.
echo 1. Repository connection in Cloudflare Pages
echo 2. Webhook settings in GitHub
echo 3. Build settings (branch: main, command: hugo --gc --minify)
echo 4. Recent deployment logs for errors
echo.

echo Current commit:
git log --oneline -1
echo.

echo Recent commits:
git log --oneline -5
echo.

pause