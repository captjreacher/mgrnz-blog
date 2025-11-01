# 🔗 MailerLite API Integration Setup

## Overview

This setup replaces the embedded form approach with a proper MailerLite API integration that ensures all signups are properly sent to your MailerLite account.

## ✅ What's Been Created

1. **Supabase Function**: `supabase/functions/mailerlite-subscribe/index.ts`
2. **Updated Subscribe Form**: `content/subscribe.md` with API-based form
3. **Proper Error Handling**: User-friendly messages and validation

## 🔧 Setup Steps

### Step 1: Get Your MailerLite API Token

1. Go to: https://dashboard.mailerlite.com/integrations/api
2. Click "Generate new token"
3. Name it: "Blog Subscription API"
4. Copy the token (starts with `ml-`)

### Step 2: Configure Supabase Secrets

```bash
# Add MailerLite API token to Supabase
supabase secrets set MAILERLITE_API_TOKEN=ml-your-token-here

# Verify it's set
supabase secrets list
```

### Step 3: Deploy the Supabase Function

```bash
# Deploy the new MailerLite subscription function
supabase functions deploy mailerlite-subscribe

# Test the function
curl -X POST https://your-project.supabase.co/functions/v1/mailerlite-subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

### Step 4: Update the Subscribe Form URL

In `content/subscribe.md`, update the Supabase URL:

```javascript
// Change this line:
const response = await fetch('https://your-project.supabase.co/functions/v1/mailerlite-subscribe', {

// To your actual Supabase URL:
const response = await fetch('https://YOUR_PROJECT_ID.supabase.co/functions/v1/mailerlite-subscribe', {
```

### Step 5: Test the Integration

1. **Local Testing**:
   ```bash
   hugo server -D
   # Go to: http://localhost:1313/subscribe/
   # Test with your email
   ```

2. **Live Testing**:
   ```bash
   git add .
   git commit -m "Add MailerLite API integration"
   git push
   # Test at: https://mgrnz.com/subscribe/
   ```

## 🔍 How It Works

### API Flow:
1. **User submits form** → Frontend validation
2. **JavaScript calls** → Supabase function
3. **Supabase function** → MailerLite API
4. **MailerLite API** → Creates/updates subscriber
5. **Response back** → User sees success/error message

### MailerLite API Endpoint:
- **URL**: `https://connect.mailerlite.com/api/subscribers`
- **Method**: POST
- **Auth**: Bearer token
- **Data**: Email, name, groups, status

## 🧪 Testing Checklist

- [ ] Supabase function deploys successfully
- [ ] API token is configured in Supabase secrets
- [ ] Form submits without JavaScript errors
- [ ] New subscribers appear in MailerLite dashboard
- [ ] Error messages display for invalid emails
- [ ] Success message shows after subscription
- [ ] Duplicate email handling works correctly

## 🚨 Troubleshooting

### Function Not Found (404)
```bash
# Redeploy the function
supabase functions deploy mailerlite-subscribe
```

### API Token Error (401)
```bash
# Check if token is set correctly
supabase secrets list
# Update if needed
supabase secrets set MAILERLITE_API_TOKEN=ml-your-new-token
```

### CORS Errors
- The function includes proper CORS headers
- Make sure you're calling the correct Supabase URL

### Subscribers Not Appearing
1. Check MailerLite dashboard → Subscribers
2. Look in "Unconfirmed" if double opt-in is enabled
3. Check the API response in browser dev tools

## 📊 Monitoring

### Check Function Logs:
```bash
supabase functions logs mailerlite-subscribe
```

### Check MailerLite API Status:
- Dashboard: https://dashboard.mailerlite.com/subscribers
- API Docs: https://developers.mailerlite.com/docs/

## 🔗 Useful Links

- **MailerLite API Docs**: https://developers.mailerlite.com/docs/
- **Supabase Functions**: https://supabase.com/docs/guides/functions
- **Your MailerLite Dashboard**: https://dashboard.mailerlite.com/
- **Your Supabase Dashboard**: https://supabase.com/dashboard/

## 🎯 Benefits of This Approach

1. **✅ Reliable**: Direct API calls ensure subscribers are added
2. **✅ Secure**: API token stored securely in Supabase
3. **✅ Flexible**: Easy to customize form fields and validation
4. **✅ Trackable**: Full error logging and monitoring
5. **✅ Fast**: No iframe loading delays
6. **✅ Mobile-friendly**: Responsive form design

---

**Next Steps**: Once deployed, test the form and monitor the MailerLite dashboard to confirm subscribers are being added properly.