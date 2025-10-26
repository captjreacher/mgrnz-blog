@echo off
echo 🚀 Quick Deploy Test
echo.

:: Get timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%"

echo Creating quick test post...
(
echo ---
echo title: "Quick Test %YYYY%-%MM%-%DD% %HH%:%Min%"
echo date: %YYYY%-%MM%-%DD%T%HH%:%Min%:00+12:00
echo draft: false
echo ---
echo.
echo # Quick Deployment Test
echo.
echo Created at: %YYYY%-%MM%-%DD% %HH%:%Min%
echo.
echo Testing Cloudflare Pages deployment...
) > "content/posts/quick-test-%YYYY%-%MM%-%DD%-%HH%-%Min%.md"

echo ✅ Post created
echo.

echo Building and deploying...
hugo --gc --minify
git add .
git commit -m "Quick test %YYYY%-%MM%-%DD% %HH%:%Min%"
git push

echo.
echo ✅ Deployed! Check: https://e35a2fac.mgrnz-blog.pages.dev/posts/
echo.
pause