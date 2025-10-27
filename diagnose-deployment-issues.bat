@echo off
echo ========================================
echo    DEPLOYMENT ISSUES DIAGNOSTIC
echo ========================================
echo.

echo 🔍 CHECKING CONFIGURATION FILES...
echo.

:: Check .env file
echo 1. CHECKING .env CONFIGURATION:
echo ----------------------------------------
if exist .env (
    echo ✅ .env file exists
    findstr /C:"REPLACE_WITH_" .env >nul
    if %errorlevel%==0 (
        echo ❌ .env contains placeholder values - NEEDS CONFIGURATION
        echo    Run setup-env.bat for instructions
    ) else (
        echo ✅ .env appears configured
    )
) else (
    echo ❌ .env file missing
    echo    Run setup-env.bat to create from template
)
echo.

:: Check Hugo config
echo 2. CHECKING HUGO CONFIGURATION:
echo ----------------------------------------
if exist config.yaml (
    echo ✅ config.yaml exists
    findstr /C:"theme:" config.yaml
) else (
    echo ❌ config.yaml missing
)
echo.

:: Check Cloudflare config
echo 3. CHECKING CLOUDFLARE CONFIGURATION:
echo ----------------------------------------
if exist wrangler.toml (
    echo ✅ wrangler.toml exists
    findstr /C:"command" wrangler.toml
) else (
    echo ❌ wrangler.toml missing
)
echo.

:: Check admin files
echo 4. CHECKING ADMIN SYSTEM:
echo ----------------------------------------
if exist admin-api.js (
    echo ✅ admin-api.js exists
) else (
    echo ❌ admin-api.js missing
)

if exist static\admin-form-v2.html (
    echo ✅ admin-form-v2.html exists
) else (
    echo ❌ admin-form-v2.html missing
)
echo.

:: Check git status
echo 5. CHECKING GIT STATUS:
echo ----------------------------------------
git status --porcelain >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Git repository detected
    git remote -v | findstr origin
) else (
    echo ❌ Not a git repository or git not available
)
echo.

:: Test Hugo build
echo 6. TESTING HUGO BUILD:
echo ----------------------------------------
hugo version >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Hugo is available
    hugo --version
    echo.
    echo Testing build...
    hugo --gc --minify --quiet
    if %errorlevel%==0 (
        echo ✅ Hugo build successful
    ) else (
        echo ❌ Hugo build failed
    )
) else (
    echo ❌ Hugo not found in PATH
)
echo.

echo ========================================
echo           DIAGNOSTIC SUMMARY
echo ========================================
echo.
echo IDENTIFIED ISSUES:
echo.
echo 1. 🔧 WEBHOOK CONFIGURATION
echo    - .env file needs real API keys and webhook URLs
echo    - Run: setup-env.bat for instructions
echo.
echo 2. 🔄 AUTO-DEPLOYMENT
echo    - Admin forms create files locally only
echo    - Need to commit/push changes to trigger rebuild
echo    - Use: deploy-test-post.bat for manual deployment
echo.
echo 3. 🧪 WEBHOOK TESTING
echo    - Run: test-webhook-integration.bat to verify
echo    - Check Cloudflare Pages dashboard for build logs
echo.
echo NEXT STEPS:
echo 1. Configure .env with real values (setup-env.bat)
echo 2. Test webhook integration (test-webhook-integration.bat)
echo 3. Deploy Supabase functions with new config
echo 4. Test admin form with auto-deployment
echo.
pause