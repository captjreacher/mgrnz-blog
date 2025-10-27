import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const payload = await req.json().catch(() => ({}));

    // 🔐 Check shared secret token (optional)
    const expected = Deno.env.get("WEBHOOK_TOKEN");
    if (!expected || payload.token !== expected) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized" }),
        { headers, status: 401 },
      );
    }

    // 🔗 GitHub repository details
    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const githubRepo = Deno.env.get("GITHUB_REPO") || "captjreacher/mgrnz-blog";
    
    if (!githubToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing GITHUB_TOKEN secret" }),
        { headers, status: 500 },
      );
    }

    // 🚀 Trigger GitHub Actions workflow dispatch
    const workflowUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/deploy-gh-pages.yml/dispatches`;
    
    const res = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          triggered_by: "supabase-ml-to-hugo",
          timestamp: new Date().toISOString(),
        },
      }),
    });

    const text = await res.text();

    return new Response(
      JSON.stringify({
        ok: res.ok,
        status: res.status,
        repo: githubRepo,
        message: res.ok
          ? "GitHub Actions deployment triggered successfully 🎉"
          : "Failed to trigger GitHub Actions ❌",
        upstream: text.slice(0, 300),
      }),
      { headers, status: res.ok ? 200 : 502 },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err.message || String(err),
      }),
      { headers, status: 500 },
    );
  }
});

