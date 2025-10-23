import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  const headers = { "Content-Type": "application/json" };

  try {
    // Parse JSON body (if any)
    const payload = await req.json().catch(() => ({}));

    // 🔐 Auth: token from query OR JSON body OR headers
    const url = new URL(req.url);
    const bodyToken = (payload?.token as string) ?? "";
    const queryToken = url.searchParams.get("token") ?? "";
    const headerToken =
      req.headers.get("x-ml-token") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    const got = bodyToken || queryToken || headerToken;

    const expected = Deno.env.get("WEBHOOK_TOKEN") ?? "";
    if (!expected || got !== expected) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers,
      });
    }

    // 🔗 Trigger Cloudflare Pages deploy hook
    const hook = Deno.env.get("HUGO_WEBHOOK_URL");
    if (!hook) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing HUGO_WEBHOOK_URL secret" }),
        { status: 500, headers },
      );
    }

    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        triggered_by: "supabase-ml-to-hugo",
        timestamp: new Date().toISOString(),
      }),
    });

    const upstream = await res.text();
    return new Response(
      JSON.stringify({
        ok: res.ok,
        status: res.status,
        message: res.ok
          ? "Cloudflare Pages build triggered successfully"
          : "Failed to trigger build",
        upstream: upstream.slice(0, 300),
      }),
      { status: res.ok ? 200 : 502, headers },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? String(err) }),
      { status: 500, headers },
    );
  }
});
