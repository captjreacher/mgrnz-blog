# MailerLite Subscribe Form Setup

## ✅ What's Done
- MailerLite Universal script added to site head
- Subscribe page ready for form embed
- Script loads on every page (enables popups, embedded forms, etc.)

## 📋 Next Steps

### 1. Get Your Form ID

1. Go to: https://dashboard.mailerlite.com/forms
2. Find your signup form (or create a new one)
3. Click on the form to edit it
4. Look at the URL - it will be something like:
   ```
   https://dashboard.mailerlite.com/forms/123456/edit
   ```
   The number `123456` is your Form ID

### 2. Update Subscribe Page

Open `content/subscribe.md` and replace `YOUR_FORM_ID` with your actual form ID:

```html
<!-- Change this: -->
<div class="ml-embedded" data-form="YOUR_FORM_ID"></div>

<!-- To this (example): -->
<div class="ml-embedded" data-form="123456"></div>
```

### 3. Alternative: Use Full Embed Code

If you prefer, you can replace the entire form section with MailerLite's full embed code:

1. In MailerLite dashboard, go to your form
2. Click "Publish" → "Embedded form"
3. Copy the entire embed code
4. Replace the `<div class="ml-embedded"...>` line in `content/subscribe.md`

## 🎨 Customizing the Form

You can customize the form appearance in MailerLite dashboard:
- Colors to match your brand (orange: #ff4f00)
- Button text
- Success message
- Fields (email, name, etc.)

## 🧪 Testing

1. Restart Hugo server: `hugo server -D`
2. Go to: http://localhost:1313/subscribe/
3. The form should now appear
4. Test subscribing with your email
5. Check MailerLite dashboard to confirm subscriber was added

## 🚀 Going Live

Once tested locally:
1. Commit changes: `git add . && git commit -m "Add MailerLite subscribe form"`
2. Push to GitHub: `git push`
3. Cloudflare Pages will auto-deploy
4. Test on live site: https://mgrnz.com/subscribe/

## 📧 Additional Features

With MailerLite Universal script loaded, you can also:
- Add popup forms (configure in MailerLite dashboard)
- Add inline forms anywhere on your site
- Track subscriber behavior
- Show targeted forms based on user actions

## 🔗 Useful Links

- MailerLite Forms: https://dashboard.mailerlite.com/forms
- MailerLite Docs: https://www.mailerlite.com/help
- Your Account: https://dashboard.mailerlite.com/
