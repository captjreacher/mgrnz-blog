import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/* ----------------------- helpers ----------------------- */
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}
function toBase64UTF8(s: string) {
  // btoa expects latin1; encode first so non-ASCII survives
  return btoa(unescape(encodeURIComponent(s)));
}

/* ------------------------ main ------------------------- */
serve(async (req) => {
  try {
    /* 0) Auth via shared token (header, query, or JSON body) */
    const url = new URL(req.url);
    const body = await req.clone().json().catch(() => ({} as any));
    const provided =
      req.headers.get("X-Webhook-Token") ??
      url.searchParams.get("token") ??
      (body?.token as string | undefined);
    const expected = Deno.env.get("WEBHOOK_TOKEN");
    if (!expected || provided !== expected) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    /* 1) Identify event + campaign id (accept variants) */
    const rawEvent = (body?.event ?? body?.type ?? "") as string;
    const event = rawEvent.toLowerCase();
    const campaignId =
      body?.data?.id ??
      body?.campaign_id ??
      body?.id ??
      "";

    // Manual test path (no MailerLite / GitHub work; just ping CF)
    if (!event && !campaignId && (body?.reason || body?.manual)) {
      const hook = Deno.env.get("HUGO_WEBHOOK_URL");
      if (!hook) return jsonResponse({ ok: false, error: "Missing HUGO_WEBHOOK_URL" }, 500);
      const cf = await fetch(hook, { method: "POST" });
      const t = await cf.text();
      return jsonResponse(
        { ok: cf.ok, status: cf.status, message: "Manual trigger → Cloudflare deploy hook", upstream: t.slice(0, 300) },
        cf.ok ? 200 : 502,
      );
    }

    // Only react to “campaign sent” family
    const allowedEvents = new Set(["campaign.sent", "campaign_send", "campaign.sent_event"]);
    if (!allowedEvents.has(event)) {
      return jsonResponse({ ok: true, skipped: `not a campaign.sent (${rawEvent})` }, 200);
    }
    if (!campaignId) return jsonResponse({ ok: false, error: "missing campaign id" }, 400);

    /* 2) Fetch campaign details & verify target includes your intake group */
    const mlKey = Deno.env.get("MAILERLITE_API_KEY");
    const intakeGroupId = String(Deno.env.get("ML_INTAKE_GROUP_ID") ?? "");
    if (!mlKey || !intakeGroupId) {
      return jsonResponse({ ok: false, error: "missing MAILERLITE_API_KEY or ML_INTAKE_GROUP_ID" }, 500);
    }
    const ml = (path: string) =>
      fetch(`https://connect.mailerlite.com/api${path}`, {
        headers: { Authorization: `Bearer ${mlKey}`, Accept: "application/json" },
      });

    const campRes = await ml(`/campaigns/${campaignId}`);
    if (!campRes.ok) {
      const t = await campRes.text();
      return jsonResponse({ ok: false, step: "campaign", status: campRes.status, upstream: t.slice(0, 300) }, 502);
    }
    const campJson = await campRes.json();
    const campaign = campJson?.data ?? campJson; // tolerate {data:{...}} or plain

    // Robust group detection (ML payloads differ by plan/workspace)
    const includedGroupIds: string[] = [
      ...(campaign?.groups ?? []).map((g: any) => String(g?.id)),
      ...(campaign?.recipients?.groups ?? []).map((g: any) => String(g?.id)),
      ...(campaign?.basic_filter_for_humans?.included_groups ?? []).map((g: any) => String(g?.id)),
      ...(() => {
        try {
          const ids = campaign?.filter?.[0]?.[0]?.args?.[1];
          return Array.isArray(ids) ? ids.map((x: any) => String(x)) : [];
        } catch { return []; }
      })(),
    ].filter(Boolean);

    if (!includedGroupIds.includes(intakeGroupId)) {
      return jsonResponse({
        ok: true,
        skipped: "campaign not for intake group",
        seen: includedGroupIds,
        expecting: intakeGroupId,
      }, 200);
    }

    /* 3) Get campaign HTML: endpoint first, then fallbacks */
    let html = "";
    const contentRes = await ml(`/campaigns/${campaignId}/content`);
    if (contentRes.ok) {
      const contentJson = await contentRes.json();
      html = contentJson?.data?.html ?? contentJson?.html ?? "";
    } else if (contentRes.status === 404) {
      // Fallbacks (common on some MailerLite plans)
      html = campaign?.emails?.[0]?.content ?? "";
      if (!html) {
        const previewUrl = campaign?.emails?.[0]?.preview_url ?? campaign?.preview_url ?? null;
        if (previewUrl) {
          try {
            const previewRes = await fetch(previewUrl, { headers: { Accept: "text/html" } });
            if (previewRes.ok) html = await previewRes.text();
          } catch { /* ignore */ }
        }
      }
      if (!html) {
        return jsonResponse(
          { ok: false, step: "content", status: 404, upstream: "No HTML: endpoint 404 and no emails[0].content/preview" },
          502,
        );
      }
    } else {
      const t = await contentRes.text();
      return jsonResponse({ ok: false, step: "content", status: contentRes.status, upstream: t.slice(0, 300) }, 502);
    }

    // Compose Hugo markdown (front matter + raw HTML shortcode)
    const subject =
      campaign?.emails?.[0]?.subject ?? campaign?.subject ?? campaign?.name ?? "Untitled";
    const title = (String(subject).trim() || "Untitled").replace(/\s+/g, " ");
    const slug = slugify(title) || `post-${Date.now()}`;
    const dateISO = new Date().toISOString();
    const tagsDefault = (Deno.env.get("HUGO_DEFAULT_TAGS") ?? "blog,ml")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const frontMatter =
      `---\n` +
      `title: "${title.replace(/"/g, '\\"')}"\n` +
      `date: "${dateISO}"\n` +
      `slug: "${slug}"\n` +
      `tags: [${tagsDefault.map((t) => `"${t}"`).join(", ")}]\n` +
      `draft: false\n` +
      `---\n\n`;
    const bodyMd = html ? `{{< rawhtml >}}\n${html}\n{{< /rawhtml >}}\n` : `*(empty)*\n`;
    const markdown = frontMatter + bodyMd;

    /* 4) Commit to GitHub */
    const owner = Deno.env.get("GITHUB_OWNER");
    const repo = Deno.env.get("GITHUB_REPO");
    const ghToken = Deno.env.get("GITHUB_TOKEN"); // required
    const authorName = Deno.env.get("GIT_AUTHOR_NAME") ?? "Automator";
    const authorEmail = Deno.env.get("GIT_AUTHOR_EMAIL") ?? "automator@example.com";
    const contentDir = Deno.env.get("HUGO_CONTENT_DIR") ?? "content/blog";

    if (!owner || !repo || !ghToken) {
      return jsonResponse(
        { ok: false, step: "github", status: 500, upstream: "Missing GITHUB_OWNER, GITHUB_REPO or GITHUB_TOKEN" },
        500,
      );
    }

    const path = `${contentDir}/${slug}/index.md`;
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          message: `Add post from MailerLite: ${title}`,
          content: toBase64UTF8(markdown),
          committer: { name: authorName, email: authorEmail },
        }),
      },
    );
    if (!commitRes.ok) {
      const t = await commitRes.text();
      return jsonResponse({ ok: false, step: "github", status: commitRes.status, upstream: t.slice(0, 300) }, 502);
    }

    /* 5) Trigger Cloudflare Pages build hook */
    const hook = Deno.env.get("HUGO_WEBHOOK_URL");
    if (!hook) return jsonResponse({ ok: false, error: "Missing HUGO_WEBHOOK_URL" }, 500);

    const cf = await fetch(hook, { method: "POST" });
    const cfText = await cf.text();

    return jsonResponse(
      {
        ok: cf.ok,
        status: cf.status,
        processed_campaign: String(campaignId),
        created: path,
        message: cf.ok ? "Cloudflare Pages build triggered 🎉" : "Cloudflare trigger failed ❌",
        upstream: cfText.slice(0, 300),
      },
      cf.ok ? 200 : 502,
    );
  } catch (err: any) {
    // Make 500s actionable
    return jsonResponse({ ok: false, error: err?.message ?? String(err), stack: err?.stack ?? null }, 500);
  }
});
