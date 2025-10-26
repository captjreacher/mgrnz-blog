# mgrnz.com — Hugo Blog (No Theme)

Minimal Hugo blog scaffold with custom layouts (no external theme).
- Dark UI with orange/blue accents
- Header logo at `static/images/logo.png`
- List + single post templates
- Starter post at `content/posts/hello-maxai.md`

## Run locally
1) Extract this zip to a folder, e.g. `C:\DEV_LOCAL\maxai-blog`
2) From that folder run:
   ```powershell
   hugo server -D --ignoreCache --disableFastRender
   ```
3) Open http://localhost:1313

## Customise
- Colours/spacing: `assets/css/main.css`
- Logo: replace `static/images/logo.png`
- Title: `config/_default/hugo.toml`
- New posts: `hugo new posts/my-post.md` (set `draft: false` to publish)
