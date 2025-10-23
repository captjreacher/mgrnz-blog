// supabase/functions/ml-to-hugo/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  const headers = { "Content-Type": "application/json" };
  const payload = await req.json().catch(() => ({}));

  const hook = Deno.env.get("HUGO_WEBHOOK_URL");
  if (!hook) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing HUGO_WEBHOOK_URL secret" }),
      { headers, status: 500 }
    );
  }

  // Forward the payload you receive to the build hook (adjust as needed)
  const r = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const ok = r.ok;
  const status = r.status;
  const text = await r.text().catch(() => "");

  return new Response(
    JSON.stringify({ ok, status, hook, upstream: text.slice(0, 500) }),
    { headers, status: ok ? 200 : 502 }
  );
});
