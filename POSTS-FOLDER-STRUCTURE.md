# Posts Folder Structure Configuration

## Overview
The blog posts are now organized using a hierarchical folder structure that follows the pattern:
```
content/posts/[YYYY]/[DD-MMMM]/Post-name.md
```

## Current Structure
```
content/posts/
└── 2025/
    ├── 01-July/
    │   └── my-cv.md
    ├── 07-July/
    │   └── bootstrapping-the-ai-evolution.md
    ├── 09-July/
    │   └── this-automation-was-made-for-you.md
    └── 20-July/
        └── demystifying-ai-to-empower-your-business.md
```

## Folder Naming Convention
- **Year**: 4-digit year (e.g., `2025`)
- **Month**: 2-digit day + full month name (e.g., `01-July`, `20-December`)
- **Post**: Kebab-case filename matching the post slug (e.g., `my-awesome-post.md`)

## Post Frontmatter
Each post should include proper frontmatter with the correct date:

```yaml
---
title: "Post Title"
date: 2025-07-20
draft: false
categories: ["Technology", "Business", "AI"]
tags: ["AI", "business", "automation"]
image: "/images/post-image.webp"
summary: "Brief description of the post"
---
```

## Hugo Configuration
The Hugo configuration in `config.yaml` is set up to handle this structure:
- Posts are located in `content/posts/`
- Taxonomies include `tags` and `categories`
- List pages group posts by year
- Pagination is set to 10 posts per page

## MailerLite Integration
The Supabase webhook functions have been updated to create new posts using this folder structure:
- `supabase/functions/ml-to-hugo/index.ts` - Creates posts in the correct YYYY/DD-MMMM format
- Environment variable `HUGO_CONTENT_DIR=content/posts` points to the posts directory

## Validation
Use the validation script to check folder structure:
```bash
node validate-posts-structure.js
```

This script will:
- ✅ Verify all posts are in the correct folder structure
- ✅ Check that folder names match post dates
- ✅ Validate frontmatter format
- ✅ Report any misplaced posts

## Benefits
1. **Chronological Organization**: Easy to find posts by date
2. **Scalability**: Structure works for any number of posts
3. **SEO Friendly**: Clean URLs with date structure
4. **Automation Ready**: Webhook functions create posts in correct structure
5. **Hugo Compatible**: Works seamlessly with Hugo's content organization

## Migration Complete
All existing posts have been successfully migrated to the new structure:
- ✅ My CV (2025-07-01) → `2025/01-July/my-cv.md`
- ✅ Bootstrapping the AI Evolution (2025-07-07) → `2025/07-July/bootstrapping-the-ai-evolution.md`
- ✅ This Automation Was Made For You (2025-07-09) → `2025/09-July/this-automation-was-made-for-you.md`
- ✅ Demystifying AI to Empower Your Business (2025-07-20) → `2025/20-July/demystifying-ai-to-empower-your-business.md`

## Next Steps
1. Test the site build with `hugo server`
2. Verify all posts are accessible at their URLs
3. Update any internal links if necessary
4. Test the MailerLite webhook integration with the new structure