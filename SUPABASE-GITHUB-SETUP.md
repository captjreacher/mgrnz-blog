# 🔗 SUPABASE + GITHUB PAGES INTEGRATION

## UPDATED DEPLOYMENT FLOW

**MailerLite** → **Supabase Function** → **GitHub Actions** → **GitHub Pages** → **Live Site**

## CHANGES MADE

### 1. Supabase Function Updated
- ✅ Now triggers GitHub Actions instead of Cloudflare Pages
- ✅ Uses GitHub API to dispatch workflow
- ✅ Requires `GITHUB_TOKEN` instead of `HUGO_WEBHOOK_URL`

### 2. GitHub Actions Workflow
- ✅ Accepts `workflow_dispatch` events
- ✅ Can be triggered manually or via API
- ✅ Builds with Hugo 0.150.1
- ✅ Deploys to GitHub Pages

## SETUP STEPS

### Step 1: Create GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Name: `Hugo Blog Deployment`
4. Scopes needed:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click "Generate token"
6. **Copy the token** (you won't see it again!)

### Step 2: Update Supabase Secrets

Replace the old Cloudflare webhook with GitHub token:

```bash
# Remove old secret (if exists)
supabase secrets unset HUGO_WEBHOOK_URL

# Add new GitHub token
supabase secrets set GITHUB_TOKEN=ghp_your_token_here

# Optional: Set custom repo (defaults to captjreacher/mgrnz-blog)
supabase secrets set GITHUB_REPO=captjreacher/mgrnz-blog

# Keep existing webhook token for security
supabase secrets set WEBHOOK_TOKEN=your_secure_token_here
```

### Step 3: Deploy Updated Supabase Function

```bash
supabase functions deploy ml-to-hugo-public
```

### Step 4: Test the Integration

```bash
# Test the Supabase function
curl -X POST https://your-project.supabase.co/functions/v1/ml-to-hugo-public \
  -H "Content-Type: application/json" \
  -d '{"token":"your_secure_token_here"}'
```

Expected response:
```json
{
  "ok": true,
  "status": 204,
  "repo": "captjreacher/mgrnz-blog",
  "message": "GitHub Actions deployment triggered successfully 🎉"
}
```

### Step 5: Verify GitHub Actions

1. Go to your GitHub repository
2. Click **Actions** tab
3. You should see "Deploy Hugo to GitHub Pages" workflow running
4. Wait for it to complete (1-2 minutes)
5. Check https://mgrnz.com/

## ENVIRONMENT VARIABLES

### Supabase Secrets Needed:
- `GITHUB_TOKEN` - GitHub Personal Access Token (required)
- `GITHUB_REPO` - Repository name (optional, defaults to captjreacher/mgrnz-blog)
- `WEBHOOK_TOKEN` - Shared secret for authentication (required)

### Old Secrets to Remove:
- `HUGO_WEBHOOK_URL` - No longer needed (was for Cloudflare)

## ADVANTAGES

1. ✅ **Reliable** - No more Cloudflare build failures
2. ✅ **Transparent** - See build logs in GitHub Actions
3. ✅ **Controlled** - Hugo 0.150.1 guaranteed
4. ✅ **Free** - GitHub Pages is free for public repos
5. ✅ **Fast** - Builds complete in 1-2 minutes

## TROUBLESHOOTING

### If workflow doesn't trigger:
1. Check GitHub token has `workflow` scope
2. Verify token is set in Supabase: `supabase secrets list`
3. Check Supabase function logs
4. Manually trigger workflow in GitHub Actions tab

### If build fails:
1. Check Actions tab for error logs
2. Verify Hugo version is 0.150.1
3. Test local build: `hugo --gc --minify`

---

**DEPLOYMENT FLOW NOW WORKS:**
MailerLite → Supabase → GitHub Actions → GitHub Pages → Live Site ✅
