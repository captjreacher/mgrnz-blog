@echo off
echo ========================================
echo    WEBHOOK INTEGRATION TEST
echo ========================================
echo.

:: Get current timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%-%MM%-%DD% %HH%:%Min%:%Sec%"

echo Testing webhook integration at %timestamp%
echo.

:: Update webhook test file
(
echo ---
echo title: "🔗 WEBHOOK TEST"
echo date: 2025-10-27
echo draft: false
echo ---
echo.
echo ## Test Commit: %timestamp%
echo.
echo This file tests if GitHub webhooks trigger Cloudflare Pages builds.
echo.
echo ### Expected Behavior:
echo 1. Commit this file to GitHub
echo 2. GitHub webhook should trigger Cloudflare Pages build
echo 3. Site should update within 3-5 minutes
echo.
echo ### Test Results:
echo - ⏳ Test initiated at %timestamp%
echo - 🔍 Check https://mgrnz.com/webhook-test/ in 5 minutes
echo - ✅ If you see this timestamp, webhooks are working
echo - ❌ If timestamp is old, webhooks are broken
echo.
echo ### Troubleshooting:
echo 1. Check Cloudflare Pages dashboard for build logs
echo 2. Verify GitHub webhook is active in repository settings
echo 3. Ensure .env file has correct HUGO_WEBHOOK_URL
echo.
echo **Last test**: %timestamp%
) > content/webhook-test.md

echo ✅ Updated webhook-test.md with timestamp: %timestamp%
echo.

echo Committing and pushing test...
git add content/webhook-test.md
git commit -m "🧪 WEBHOOK TEST: %timestamp%"
git push

echo.
echo ========================================
echo           TEST INITIATED
echo ========================================
echo.
echo 🎯 Check these URLs in 5 minutes:
echo.
echo 1. Test file: https://mgrnz.com/webhook-test/
echo 2. Build logs: Cloudflare Pages dashboard
echo 3. Main site: https://mgrnz.com/
echo.
echo ✅ If webhook-test shows current timestamp = WORKING
echo ❌ If webhook-test shows old timestamp = BROKEN
echo.
pause