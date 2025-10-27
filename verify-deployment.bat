@echo off
echo 🔍 DEPLOYMENT VERIFICATION SYSTEM
echo ========================================

:: Get current commit for comparison
for /f %%i in ('git rev-parse --short HEAD') do set "LOCAL_COMMIT=%%i"

echo 📋 Local Information:
echo   Commit: %LOCAL_COMMIT%
echo   Time: %DATE% %TIME%
echo.

echo 🌐 Testing live site...
echo.

:: Test 1: Build Info
echo 1. 📊 Checking build info:
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/build-info.txt' -UseBasicParsing; Write-Host $response.Content; if ($response.Content -match '%LOCAL_COMMIT%') { Write-Host '✅ BUILD INFO: Latest commit deployed' -ForegroundColor Green } else { Write-Host '⚠️  BUILD INFO: May be outdated' -ForegroundColor Yellow } } catch { Write-Host '❌ BUILD INFO: Unreachable' -ForegroundColor Red }"

echo.
echo 2. ⏰ Checking deployment timestamp:
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/deployment-timestamp.txt' -UseBasicParsing; Write-Host $response.Content; if ($response.Content -match '%LOCAL_COMMIT%') { Write-Host '✅ TIMESTAMP: Latest commit deployed' -ForegroundColor Green } else { Write-Host '⚠️  TIMESTAMP: May be outdated' -ForegroundColor Yellow } } catch { Write-Host '❌ TIMESTAMP: Unreachable' -ForegroundColor Red }"

echo.
echo 3. 🏠 Checking main site:
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/' -UseBasicParsing; if ($response.StatusCode -eq 200) { Write-Host '✅ MAIN SITE: Accessible' -ForegroundColor Green } else { Write-Host '⚠️  MAIN SITE: Status ' + $response.StatusCode -ForegroundColor Yellow } } catch { Write-Host '❌ MAIN SITE: Unreachable' -ForegroundColor Red }"

echo.
echo 4. 🔧 Checking admin system:
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/admin/' -UseBasicParsing; if ($response.StatusCode -eq 200) { Write-Host '✅ ADMIN: Accessible' -ForegroundColor Green } else { Write-Host '⚠️  ADMIN: Status ' + $response.StatusCode -ForegroundColor Yellow } } catch { Write-Host '❌ ADMIN: Unreachable' -ForegroundColor Red }"

echo.
echo ========================================
echo 📊 VERIFICATION SUMMARY
echo ========================================
echo.
echo If all tests show ✅ GREEN:
echo   - Deployment pipeline is working correctly
echo   - All changes are live
echo   - System is functioning normally
echo.
echo If any tests show ⚠️  YELLOW:
echo   - Deployment may still be processing
echo   - Wait 5 minutes and run again
echo   - Check Cloudflare Pages dashboard
echo.
echo If any tests show ❌ RED:
echo   - Network connectivity issues
echo   - Cloudflare Pages service problems
echo   - Manual intervention may be required
echo.
echo 🔗 Useful Links:
echo   - Cloudflare Pages: https://dash.cloudflare.com/
echo   - GitHub Repository: https://github.com/your-repo
echo   - Live Site: https://mgrnz.com/
echo.
pause