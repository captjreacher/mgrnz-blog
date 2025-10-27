@echo off
echo ========================================
echo    SETUP ENVIRONMENT VARIABLES
echo ========================================
echo.

:: Check if .env already exists
if exist .env (
    echo ⚠️  .env file already exists
    echo.
    choice /C YN /M "Do you want to overwrite it with template"
    if errorlevel 2 goto :skip_copy
)

:: Copy template to .env
copy .env.template .env >nul
echo ✅ Created .env from template
echo.

:skip_copy

echo 🔧 CONFIGURATION REQUIRED:
echo ----------------------------------------
echo.
echo You need to edit .env and replace these placeholder values:
echo.
findstr /C:"REPLACE_WITH_" .env
echo.
echo ========================================
echo    GET YOUR API CREDENTIALS
echo ========================================
echo.
echo 1. CLOUDFLARE PAGES WEBHOOK URL:
echo    → https://dash.cloudflare.com/
echo    → Select mgrnz-blog project
echo    → Settings ^> Build ^& deployments
echo    → Copy Deploy hook URL
echo.
echo 2. MAILERLITE API KEY:
echo    → https://dashboard.mailerlite.com/
echo    → Integrations ^> Developer API
echo    → Copy API key
echo.
echo 3. MAILERLITE GROUP ID:
echo    → MailerLite ^> Subscribers ^> Groups
echo    → Copy Group ID
echo.
echo 4. GITHUB PERSONAL ACCESS TOKEN:
echo    → https://github.com/settings/tokens
echo    → Generate new token (classic)
echo    → Select 'repo' permissions
echo    → Copy token
echo.
echo ========================================
echo    AFTER EDITING .env
echo ========================================
echo.
echo 1. Test configuration: .\test-env-configuration.bat
echo 2. Update Supabase secrets: 
echo    supabase secrets set HUGO_WEBHOOK_URL=your-webhook-url
echo    supabase secrets set MAILERLITE_API_KEY=your-api-key
echo    supabase secrets set ML_INTAKE_GROUP_ID=your-group-id
echo    supabase secrets set GITHUB_TOKEN=your-github-token
echo 3. Deploy functions: supabase functions deploy
echo 4. Test webhook: .\test-webhook-integration.bat
echo.
echo 🔒 SECURITY NOTE: .env is now in .gitignore and won't be committed
echo.
pause