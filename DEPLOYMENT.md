# Deployment Guide

## Fixed Issues

### 1. Build Configuration
- ✅ Added GitHub Pages workflow (`.github/workflows/deploy-gh-pages.yml`)
- ✅ Added `netlify.toml` as backup
- ✅ Specified Hugo version 0.147.8 extended

### 2. Theme Configuration
- ✅ Re-enabled Congo theme in `config.yaml`
- ✅ Fixed CSS asset processing in `layouts/partials/head.html`
- ✅ Custom CSS now uses Hugo Pipes for proper minification

### 3. Missing Elements Fixed
- ✅ Admin link in sidebar footer
- ✅ Logo in header (BLOG-LOGO.png)
- ✅ Header navigation menu (Home, Blog Posts, My CV)
- ✅ Custom brand colors (orange/yellow/blue)
- ✅ Mobile menu functionality

### 4. Build Commands
```bash
# Local development
hugo server -D

# Production build
hugo --gc --minify
```

### 5. Deployment Settings for GitHub Pages
- **Build command**: `hugo --gc --minify`
- **Build output directory**: `public`
- **Hugo version**: `0.147.8`
- **Node version**: `18`
- **Workflow**: `.github/workflows/deploy-gh-pages.yml` (builds and publishes to `gh-pages` branch)

### 6. Deployment Metadata Refresh
- Run `npm run deploy:metadata` before committing to refresh deployment timestamp,
  cache buster, and deployment notes.
- The script writes `static/deployment-timestamp.txt`, `static/build-info.txt`,
  `static/CACHE-BUSTER.txt`, `FORCE-DEPLOY-NOW.md`, and `DEPLOYMENT-MISSING-COMMITS.md`
  so the live site highlights any missing commits.

## Next Steps
1. Commit these changes to your repository
2. Push to the `work` branch (or `main` if used) to trigger a new deployment
3. Verify the GitHub Pages workflow completes without errors
4. Visit https://mgrnz.com after the workflow finishes to confirm updates

## Files Modified/Added
- `.github/workflows/deploy-gh-pages.yml` - GitHub Pages build + deploy
- `netlify.toml` - Backup build config
- `config.yaml` - Re-enabled theme
- `layouts/partials/head.html` - Fixed CSS processing
- `layouts/_default/baseof.html` - Added deployment timestamp
- `static/_redirects` - Admin routing