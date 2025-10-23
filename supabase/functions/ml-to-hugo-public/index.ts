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

    // 🔗 Cloudflare deploy hook URL
    const hook = Deno.env.get("HUGO_WEBHOOK_URL");
    if (!hook) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing HUGO_WEBHOOK_URL secret" }),
        { headers, status: 500 },
      );
    }

    // 🚀 Trigger Cloudflare Pages build
    const res = await fetch(hook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        triggered_by: "supabase-ml-to-hugo",
        payload,
        timestamp: new Date().toISOString(),
      }),
    });

    const text = await res.text();

    return new Response(
      JSON.stringify({
        ok: res.ok,
        status: res.status,
        hook,
        message: res.ok
          ? "Cloudflare Pages build triggered successfully 🎉"
          : "Failed to trigger build ❌",
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

