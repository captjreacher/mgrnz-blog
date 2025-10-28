@echo off
echo 🔄 Validating Automatic Deployment Configuration
echo.

echo Checking if commits will trigger automatic site rebuilds...
echo.

echo 1. Checking workflow trigger configuration...
findstr /C:"push:" .github\workflows\deploy-gh-pages.yml >nul
if %errorlevel% equ 0 (
    echo ✅ Push trigger configured
    findstr /C:"branches: [main]" .github\workflows\deploy-gh-pages.yml >nul
    if %errorlevel% equ 0 (
        echo ✅ Main branch trigger configured
    ) else (
        echo ❌ Main branch trigger not found
    )
) else (
    echo ❌ Push trigger not configured
)

echo.
echo 2. Checking workflow_dispatch for manual triggers...
findstr /C:"workflow_dispatch:" .github\workflows\deploy-gh-pages.yml >nul
if %errorlevel% equ 0 (
    echo ✅ Manual dispatch enabled
) else (
    echo ❌ Manual dispatch not configured
)

echo.
echo 3. Checking for conflicting workflows...
if exist ".github\workflows\deploy.yml" (
    echo ⚠️  Conflicting workflow detected: deploy.yml
    echo    This may interfere with GitHub Pages deployment
) else (
    echo ✅ No conflicting workflows found
)

echo.
echo 4. Validating workflow permissions...
findstr /C:"pages: write" .github\workflows\deploy-gh-pages.yml >nul
if %errorlevel% equ 0 (
    echo ✅ Pages write permission configured
) else (
    echo ❌ Pages write permission missing
)

echo.
echo 5. Testing commit trigger simulation...
echo Creating test commit to verify auto-deployment...

echo DEPLOYMENT_TEST_%date%_%time% > static\deployment-test.txt
git add static\deployment-test.txt

echo.
echo Test file created. When you commit and push this change:
echo.
echo Expected behavior:
echo 1. 🔄 GitHub Actions will trigger automatically
echo 2. 🏗️  Hugo site will build with new test file
echo 3. 🚀 Site will deploy to https://mgrnz.com  
echo 4. ✅ Test file will be visible in deployed site
echo.

echo Verification steps:
echo 1. Check GitHub Actions tab for new workflow run
echo 2. Monitor build logs for successful completion
echo 3. Visit https://mgrnz.com/deployment-test.txt
echo 4. Confirm file contains today's timestamp
echo.

echo Ready to commit test file and verify auto-deployment? (Y/N)
set /p choice="Enter choice: "

if /i "%choice%"=="Y" (
    git commit -m "🧪 Test automatic deployment trigger

This commit tests that GitHub Actions automatically triggers
when changes are pushed to the main branch.

Expected: Site should rebuild and deploy to https://mgrnz.com"
    
    if %errorlevel% neq 0 (
        echo ❌ Commit failed!
        pause
        exit /b 1
    )
    
    echo.
    echo ✅ Test commit created successfully!
    echo.
    echo Next steps:
    echo 1. Push this commit: git push origin main
    echo 2. Watch GitHub Actions: https://github.com/YOUR_USERNAME/mgrnz-blog/actions
    echo 3. Verify deployment: https://mgrnz.com/deployment-test.txt
    echo.
) else (
    echo.
    echo Test cancelled. Removing test file...
    git reset HEAD static\deployment-test.txt
    del static\deployment-test.txt
    echo Test file removed.
    echo.
)

echo.
echo 📋 Auto-deployment validation complete!
pause