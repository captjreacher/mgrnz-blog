import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function insertScheduledPost(row: any) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE");
  if (!url || !key) return { ok: false, status: 500, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE" };

  const res = await fetch(`${url}/rest/v1/scheduled_posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

serve(async (req) => {
  try {
    const method = req.method.toUpperCase();
    if (method !== "POST") return json({ ok: true, message: "schedule-post ready" });

    const payload = await req.json().catch(() => ({}));
    const { type = "blog/social", platforms = [], schedule, timezone = "UTC", data = {} } = payload;

    if (!schedule) return json({ ok: false, error: "Missing schedule datetime (ISO)" }, 400);

    const row = {
      type,
      payload: data,
      platforms,
      scheduled_at: new Date(schedule).toISOString(),
      timezone,
      status: "pending",
    };

    const ins = await insertScheduledPost(row);
    if (!ins.ok) return json({ ok: false, step: "insert", status: ins.status, upstream: ins.body?.slice?.(0, 300) }, 502);

    return json({ ok: true, scheduled: JSON.parse(ins.body)[0] });
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
});


