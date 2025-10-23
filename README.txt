# Imported Hugo Post

This package contains a Hugo post converted from your uploaded HTML.

- **Slug**: about-me-career-visual-maximisedai
- **Title**: About Me – Career Visual MaximisedAI
- **Date**: 2025-10-21

## How to install into your repo

1. Copy `content/posts/about-me-career-visual-maximisedai` into your Hugo project.
2. Copy `layouts/shortcodes/rawhtml.html` into your Hugo project (create the folders if missing).
3. Run:
   ```bash
   hugo server -D
   ```
4. Visit `/posts/about-me-career-visual-maximisedai/`.

> If you prefer to allow raw HTML without a shortcode, set the following in `config.yaml`:
>
> ```yaml
> markup:
>   goldmark:
>     renderer:
>       unsafe: true
> ```
> Then remove the `{< rawhtml >}` wrapper from `index.md`.
