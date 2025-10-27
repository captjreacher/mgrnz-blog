@echo off
echo ========================================
echo    TEST .env CONFIGURATION
echo ========================================
echo.

:: Check if .env exists
if not exist .env (
    echo ❌ .env file not found
    echo Run: setup-env.bat to create from template
    pause
    exit /b 1
)

echo ✅ .env file exists
echo.

:: Check for placeholder values
echo 🔍 CHECKING CONFIGURATION VALUES:
echo ----------------------------------------

findstr /C:"REPLACE_WITH_" .env >nul
if %errorlevel%==0 (
    echo ❌ Found placeholder values in .env:
    findstr /C:"REPLACE_WITH_" .env
    echo.
    echo Please replace these with actual values.
    echo Use: setup-env.bat for instructions
) else (
    echo ✅ No placeholder values found
)

echo.
echo 🔍 CURRENT .env CONTENTS:
echo ----------------------------------------
type .env
echo.

:: Test Supabase connection
echo 🔍 TESTING SUPABASE CONNECTION:
echo ----------------------------------------
supabase status >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Supabase CLI working
    supabase projects list >nul 2>&1
    if %errorlevel%==0 (
        echo ✅ Connected to Supabase project
    ) else (
        echo ❌ Not connected to Supabase project
        echo Run: supabase login
    )
) else (
    echo ❌ Supabase CLI not working
    echo Install: https://supabase.com/docs/guides/cli
)

echo.
echo ========================================
echo    NEXT STEPS
echo ========================================
echo.
echo 1. If placeholders found: Replace with real values
echo 2. Update Supabase secrets: supabase secrets set KEY=value
echo 3. Deploy functions: supabase functions deploy
echo 4. Test webhook: .\test-webhook-integration.bat
echo.
pause