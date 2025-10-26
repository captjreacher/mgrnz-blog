@echo off
echo ========================================
echo    HUGO BLOG POST DEPLOYMENT TEST
echo ========================================
echo.

:: Get current timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%-%MM%-%DD% %HH%:%Min%:%Sec%"

echo Creating test blog post...
echo.

:: Create the blog post content
(
echo ---
echo title: "🚀 Deployment Test Post"
echo date: %YYYY%-%MM%-%DD%T%HH%:%Min%:%Sec%+12:00
echo draft: false
echo tags: ["test", "deployment"]
echo categories: ["testing"]
echo description: "Test post to verify Cloudflare Pages deployment is working"
echo ---
echo.
echo # 🚀 Deployment Test Success!
echo.
echo **Timestamp**: %timestamp%
echo.
echo This post was created automatically to test the Hugo + Cloudflare Pages deployment pipeline.
echo.
echo ## Test Results
echo.
echo - ✅ Hugo build working
echo - ✅ Git commit successful  
echo - ✅ Cloudflare Pages deployment active
echo - ✅ Custom layouts functioning
echo.
echo ## Expected Features
echo.
echo If you can see this post, the following should also be working:
echo.
echo - Admin button in sidebar footer
echo - Logo in header ^(right side^)
echo - Navigation menu ^(Home, Blog Posts, My CV^)
echo - Orange/yellow/blue brand colors
echo - Dark theme background
echo.
echo ---
echo.
echo **Site URL**: https://mgrnz.com/
echo.
echo **Test completed at**: %timestamp%
) > "content/posts/deployment-test-%YYYY%-%MM%-%DD%-%HH%-%Min%.md"

echo ✅ Test post created: deployment-test-%YYYY%-%MM%-%DD%-%HH%-%Min%.md
echo.

echo Building site locally to verify...
hugo --gc --minify
if %errorlevel% neq 0 (
    echo ❌ Hugo build failed!
    pause
    exit /b 1
)
echo ✅ Local build successful
echo.

echo Adding files to Git...
git add .
if %errorlevel% neq 0 (
    echo ❌ Git add failed!
    pause
    exit /b 1
)
echo ✅ Files added to Git
echo.

echo Committing changes...
git commit -m "🚀 AUTO-DEPLOY: Test post created at %timestamp%"
if %errorlevel% neq 0 (
    echo ❌ Git commit failed!
    pause
    exit /b 1
)
echo ✅ Changes committed
echo.

echo Pushing to GitHub...
git push
if %errorlevel% neq 0 (
    echo ❌ Git push failed!
    pause
    exit /b 1
)
echo ✅ Pushed to GitHub successfully
echo.

echo ========================================
echo           DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo 🎯 Test URLs to check:
echo.
echo 1. Main site: https://mgrnz.com/
echo 2. Blog posts: https://mgrnz.com/posts/
echo 3. New test post: https://mgrnz.com/posts/deployment-test-%YYYY%-%MM%-%DD%-%HH%-%Min%/
echo 4. Build info: https://mgrnz.com/build-info.txt
echo.
echo ⏱️  Wait 2-3 minutes for Cloudflare Pages to build and deploy
echo.
echo 🔍 Look for:
echo   - "🔥 FINAL TEST" in the footer
echo   - New test post in the blog list
echo   - All custom styling and functionality
echo.
pause