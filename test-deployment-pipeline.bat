@echo off
echo 🧪 Testing GitHub Pages Deployment Pipeline
echo.

echo 1. Testing Hugo build locally...
hugo --gc --minify --quiet
if %errorlevel% neq 0 (
    echo ❌ Local Hugo build failed!
    pause
    exit /b 1
)
echo ✅ Local build successful

echo.
echo 2. Checking submodules...
git submodule status
if %errorlevel% neq 0 (
    echo ❌ Submodule check failed!
    pause
    exit /b 1
)
echo ✅ Submodules OK

echo.
echo 3. Checking workflow file...
if exist ".github\workflows\deploy-gh-pages.yml" (
    echo ✅ GitHub Pages workflow exists
) else (
    echo ❌ GitHub Pages workflow missing!
    pause
    exit /b 1
)

echo.
echo 4. Checking CNAME configuration...
if exist "static\CNAME" (
    echo ✅ static/CNAME exists
    type static\CNAME
) else (
    echo ❌ static/CNAME missing!
)

echo.
echo 5. Checking for conflicting workflows...
if exist ".github\workflows\deploy.yml" (
    echo ⚠️  Conflicting Cloudflare workflow detected!
    echo    Consider disabling it to avoid conflicts
) else (
    echo ✅ No conflicting workflows
)

echo.
echo 🎯 Pipeline test complete!
echo.
echo Next steps:
echo 1. Commit and push changes to trigger deployment
echo 2. Check GitHub Actions tab for build logs
echo 3. Verify site updates at https://mgrnz.com
echo.
pause