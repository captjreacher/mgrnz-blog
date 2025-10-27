@echo off
echo ========================================
echo    DEPLOYMENT FIX VERIFICATION
echo ========================================
echo.

echo 🚨 NUCLEAR DEPLOYMENT INITIATED
echo.
echo Expected Results:
echo - Live site shows commit: 44702ff
echo - Deployment timestamp: 2025-10-27 14:35:00
echo - Admin authentication working
echo - Dark theme create form live
echo - All latest changes deployed
echo.

echo ⏰ Checking deployment status...
echo.

:: Wait 30 seconds then check
timeout /t 30 /nobreak >nul

echo 🔍 Testing live site...
echo.

:: Test deployment timestamp
echo 1. Checking deployment timestamp:
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/deployment-timestamp.txt' -UseBasicParsing; if ($response.Content -match '44702ff') { Write-Host '✅ DEPLOYMENT SUCCESSFUL - Latest commit live' -ForegroundColor Green } else { Write-Host '❌ Still showing old commit' -ForegroundColor Red } } catch { Write-Host '❌ Site unreachable' -ForegroundColor Red }"

echo.
echo 2. Checking build info:
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/build-info.txt' -UseBasicParsing; if ($response.Content -match 'NUCLEAR DEPLOYMENT') { Write-Host '✅ FORCE DEPLOY SUCCESSFUL' -ForegroundColor Green } else { Write-Host '❌ Force deploy not detected' -ForegroundColor Red } } catch { Write-Host '❌ Build info unreachable' -ForegroundColor Red }"

echo.
echo 3. Testing admin authentication:
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://mgrnz.com/admin/' -UseBasicParsing; if ($response.Content -match 'Admin Access Required') { Write-Host '✅ ADMIN AUTH DEPLOYED' -ForegroundColor Green } else { Write-Host '❌ Admin auth not live' -ForegroundColor Red } } catch { Write-Host '❌ Admin page unreachable' -ForegroundColor Red }"

echo.
echo ========================================
echo    VERIFICATION COMPLETE
echo ========================================
echo.
echo If all tests show ✅ GREEN: Deployment pipeline FIXED
echo If any tests show ❌ RED: Manual Cloudflare intervention needed
echo.
pause