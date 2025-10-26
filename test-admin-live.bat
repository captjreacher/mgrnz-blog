@echo off
echo ========================================
echo 🎯 TESTING LIVE ADMIN FORM
echo ========================================
echo.

echo 🌐 Testing main admin URLs:
echo.

echo 📋 Admin Dashboard:
curl -I https://mgrnz.com/admin/ 2>nul | findstr "HTTP\|CF-Cache-Status"
echo.

echo 📝 Create Post Form:
curl -I https://mgrnz.com/admin/create/ 2>nul | findstr "HTTP\|CF-Cache-Status"
echo.

echo 🎯 URLs to test in browser:
echo   🏠 Dashboard: https://mgrnz.com/admin/
echo   📝 Create Form: https://mgrnz.com/admin/create/
echo   🧪 Standalone v2: https://mgrnz.com/admin-form-v2.html
echo.

echo 💡 Expected features:
echo   ✅ Orange borders on all form fields
echo   ✅ Live slug preview with /year/month/slug format
echo   ✅ Auto-slug generation from title
echo   ✅ Clean interface without debug banners
echo   ✅ ZIP file download with post package
echo.

echo ⏰ Deployment time: ~3-5 minutes from commit
echo 📍 Latest commit: 0ece9da - Clean admin form
echo.

echo ========================================
echo 🚀 READY TO TEST!
echo Wait 3-5 minutes then visit the URLs above
echo ========================================

pause