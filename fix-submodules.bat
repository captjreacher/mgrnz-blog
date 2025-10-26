@echo off
echo ========================================
echo    AUTOMATED SUBMODULE FIX
echo ========================================
echo.

echo Checking submodule status...
git submodule status
echo.

echo Updating submodules to latest versions...
git submodule update --remote --merge
if %errorlevel% neq 0 (
    echo ❌ Submodule update failed!
    pause
    exit /b 1
)
echo ✅ Submodules updated successfully
echo.

echo Checking for changes...
git status --porcelain
echo.

echo Adding submodule changes...
git add .
if %errorlevel% neq 0 (
    echo ❌ Git add failed!
    pause
    exit /b 1
)

echo Committing changes...
git commit -m "🤖 AUTO: Fix submodule references"
if %errorlevel% neq 0 (
    echo ℹ️ No changes to commit
) else (
    echo ✅ Changes committed
    
    echo Pushing to GitHub...
    git push
    if %errorlevel% neq 0 (
        echo ❌ Git push failed!
        pause
        exit /b 1
    )
    echo ✅ Pushed to GitHub successfully
)

echo.
echo ========================================
echo    SUBMODULE FIX COMPLETE
echo ========================================
echo.
echo This script:
echo - Updates all submodules to latest versions
echo - Commits any changes automatically
echo - Pushes to GitHub to trigger rebuild
echo.
echo Run this anytime you see submodule errors!
echo.
pause