@echo off
echo ========================================
echo    FORCE SYNC WITH GITHUB
echo ========================================
echo.

echo Step 1: Pulling latest changes from GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo ❌ Git pull failed!
    pause
    exit /b 1
)
echo ✅ Git pull successful
echo.

echo Step 2: Updating submodules...
git submodule update --init --recursive
echo ✅ Submodules updated
echo.

echo Step 3: Building Hugo site locally...
hugo --gc --minify
if %errorlevel% neq 0 (
    echo ❌ Hugo build failed!
    pause
    exit /b 1
)
echo ✅ Hugo build successful
echo.

echo Step 4: Checking content directory...
echo Posts in content/posts/:
dir content\posts /b
echo.

echo Step 5: Triggering GitHub Actions deployment...
echo Creating empty commit to trigger rebuild...
git commit --allow-empty -m "Force rebuild - sync with deletions"
git push origin main
echo ✅ Deployment triggered
echo.

echo ========================================
echo    SYNC COMPLETE
echo ========================================
echo.
echo Your site should rebuild in 2-3 minutes.
echo Check: https://github.com/captjreacher/mgrnz-blog/actions
echo.
pause