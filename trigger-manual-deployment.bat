@echo off
echo 🎯 Manual GitHub Actions Deployment Trigger
echo.

echo This script will help you trigger a manual GitHub Actions deployment.
echo.

echo Prerequisites:
echo 1. ✅ GitHub Actions workflow configured
echo 2. ✅ Repository permissions set correctly  
echo 3. ✅ Local changes committed and pushed
echo.

echo To trigger manual deployment:
echo.
echo 1. Go to: https://github.com/YOUR_USERNAME/mgrnz-blog/actions
echo 2. Click on "Deploy Hugo to GitHub Pages" workflow
echo 3. Click "Run workflow" button
echo 4. Select "main" branch
echo 5. Add optional trigger reason (e.g., "Manual test deployment")
echo 6. Click "Run workflow"
echo.

echo The workflow will:
echo - Checkout code and submodules
echo - Setup Hugo 0.150.1
echo - Build the site
echo - Deploy to GitHub Pages
echo - Make site available at https://mgrnz.com
echo.

echo 📊 Monitor progress:
echo - Check the Actions tab for real-time logs
echo - Look for any error messages in the build output
echo - Verify deployment completes successfully
echo.

echo 🔍 If deployment fails:
echo 1. Check the Actions logs for specific error messages
echo 2. Verify GitHub Pages is enabled in repository settings
echo 3. Confirm custom domain (mgrnz.com) is configured
echo 4. Check repository permissions for GitHub Actions
echo.

echo Ready to commit current changes and trigger deployment? (Y/N)
set /p choice="Enter choice: "

if /i "%choice%"=="Y" (
    echo.
    echo Committing GitHub Actions fixes...
    git add .
    git commit -m "🔧 Fix GitHub Actions deployment pipeline

- Fixed CNAME domain consistency (mgrnz.com)
- Cleaned up deployment configuration  
- Updated workflow permissions and error handling
- Removed invalid --verbose flag from Hugo build
- Added comprehensive testing and validation

Ready for production deployment to https://mgrnz.com"
    
    if %errorlevel% neq 0 (
        echo ❌ Commit failed!
        pause
        exit /b 1
    )
    
    echo.
    echo Pushing to GitHub...
    git push origin main
    
    if %errorlevel% neq 0 (
        echo ❌ Push failed!
        pause
        exit /b 1
    )
    
    echo.
    echo ✅ Changes pushed successfully!
    echo.
    echo 🚀 GitHub Actions should now trigger automatically.
    echo    Check: https://github.com/YOUR_USERNAME/mgrnz-blog/actions
    echo.
) else (
    echo.
    echo Manual deployment trigger cancelled.
    echo You can run this script again when ready.
    echo.
)

pause