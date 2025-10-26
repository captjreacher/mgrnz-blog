@echo off
echo ========================================
echo 🔍 CLOUDFLARE CACHE DIAGNOSTIC TOOL
echo ========================================
echo.

echo 📊 CHECKING SITE STATUS...
echo.

echo 🌐 Testing main site response:
curl -I https://mgrnz.com/ 2>nul | findstr "HTTP\|CF-Cache-Status\|CF-Ray\|Last-Modified\|ETag"
echo.

echo 🎯 Testing admin form v2:
curl -I https://mgrnz.com/admin-form-v2.html 2>nul | findstr "HTTP\|CF-Cache-Status\|CF-Ray\|Last-Modified\|ETag"
echo.

echo 🧪 Testing with cache bypass:
curl -I "https://mgrnz.com/admin-form-v2.html?v=%RANDOM%" 2>nul | findstr "HTTP\|CF-Cache-Status\|CF-Ray"
echo.

echo 📋 CACHE STATUS MEANINGS:
echo   HIT     = Served from Cloudflare cache
echo   MISS    = Not in cache, fetched from origin
echo   EXPIRED = Cache expired, revalidating
echo   BYPASS  = Cache bypassed
echo   DYNAMIC = Dynamic content, not cached
echo.

echo 🚀 CACHE PURGE RECOMMENDATIONS:
echo   1. Purge Everything: Cloudflare Dashboard ^> Caching ^> Purge Everything
echo   2. Purge Specific URLs:
echo      - https://mgrnz.com/admin-form-v2.html
echo      - https://mgrnz.com/admin/
echo      - https://mgrnz.com/
echo.

echo 🔧 DEPLOYMENT STATUS:
git log --oneline -3
echo.

echo ⏰ Current time: %DATE% %TIME%
echo 📍 Latest commit should be visible in 3-5 minutes
echo.

echo ========================================
echo 💡 NEXT STEPS:
echo 1. Wait 3-5 minutes for GitHub Pages deployment
echo 2. Try: https://mgrnz.com/admin-form-v2.html
echo 3. If still cached, purge Cloudflare cache
echo 4. Test with: https://mgrnz.com/admin-form-v2.html?v=123
echo ========================================

pause