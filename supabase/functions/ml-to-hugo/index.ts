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
async function triggerGithubWorkflow({
  owner,
  repo,
  token,
  workflow,
  ref,
  inputs,
}: {
  owner: string;
  repo: string;
  token: string;
  workflow: string;
  ref: string;
  inputs: Record<string, string>;
}) {
  const workflowUrl =
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const res = await fetch(workflowUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ ref, inputs }),
  });

  const text = res.status === 204 ? "" : await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
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

    // Manual test path (no MailerLite campaign; just dispatch workflow)
    if (!event && !campaignId && (body?.reason || body?.manual)) {
      const ghToken = Deno.env.get("GITHUB_TOKEN");
      const repoEnv = Deno.env.get("GITHUB_REPO") ?? "";
      let owner = Deno.env.get("GITHUB_OWNER") ?? "";
      let repo = repoEnv;
      if (repo.includes("/")) {
        const [maybeOwner, maybeRepo] = repo.split("/", 2);
        if (!owner) owner = maybeOwner ?? "";
        repo = maybeRepo ?? "";
      }
      const workflow = Deno.env.get("GITHUB_WORKFLOW") ?? "deploy-gh-pages.yml";
      const workflowRef = Deno.env.get("GITHUB_WORKFLOW_REF") ?? "main";
      if (!owner || !repo || !ghToken) {
        return jsonResponse(
          { ok: false, error: "Missing GITHUB_OWNER, GITHUB_REPO or GITHUB_TOKEN" },
          500,
        );
      }
      const dispatch = await triggerGithubWorkflow({
        owner,
        repo,
        token: ghToken,
        workflow,
        ref: workflowRef,
        inputs: {
          triggered_by: "supabase-manual",
          timestamp: new Date().toISOString(),
          reason: String(body?.reason ?? "manual"),
        },
      });
      return jsonResponse(
        {
          ok: dispatch.ok,
          status: dispatch.status,
          message: dispatch.ok ? "Manual trigger → GitHub Pages workflow" : "GitHub workflow dispatch failed",
          upstream: dispatch.body,
        },
        dispatch.ok ? 200 : 502,
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
    let owner = Deno.env.get("GITHUB_OWNER") ?? "";
    let repo = Deno.env.get("GITHUB_REPO") ?? "";
    if (repo.includes("/")) {
      const [maybeOwner, maybeRepo] = repo.split("/", 2);
      if (!owner) owner = maybeOwner ?? "";
      repo = maybeRepo ?? "";
    }
    const ghToken = Deno.env.get("GITHUB_TOKEN"); // required
    const authorName = Deno.env.get("GIT_AUTHOR_NAME") ?? "Automator";
    const authorEmail = Deno.env.get("GIT_AUTHOR_EMAIL") ?? "automator@example.com";
    const contentDir = Deno.env.get("HUGO_CONTENT_DIR") ?? "content/blog";
    const workflow = Deno.env.get("GITHUB_WORKFLOW") ?? "deploy-gh-pages.yml";
    const workflowRef = Deno.env.get("GITHUB_WORKFLOW_REF") ?? "main";

    if (!owner || !repo || !ghToken) {
      return jsonResponse(
        { ok: false, step: "github", status: 500, upstream: "Missing GITHUB_OWNER, GITHUB_REPO or GITHUB_TOKEN" },
        500,
      );
    }

    // Create folder structure: YYYY/DD-MMMM/post-name.md
    const postDate = new Date();
    const year = postDate.getFullYear();
    const day = String(postDate.getDate()).padStart(2, '0');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[postDate.getMonth()];
    const folderName = `${day}-${monthName}`;
    
    const path = `${contentDir}/${year}/${folderName}/${slug}.md`;
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

    /* 5) Dispatch GitHub Pages workflow */
    const dispatch = await triggerGithubWorkflow({
      owner,
      repo,
      token: ghToken,
      workflow,
      ref: workflowRef,
      inputs: {
        triggered_by: "supabase-ml-to-hugo",
        timestamp: new Date().toISOString(),
        campaign_id: String(campaignId),
        slug,
      },
    });

    return jsonResponse(
      {
        ok: dispatch.ok,
        status: dispatch.status,
        processed_campaign: String(campaignId),
        created: path,
        message: dispatch.ok ? "GitHub Pages workflow dispatched 🎉" : "GitHub workflow dispatch failed ❌",
        upstream: dispatch.body,
      },
      dispatch.ok ? 200 : 502,
    );
  } catch (err: any) {
    // Make 500s actionable
    return jsonResponse({ ok: false, error: err?.message ?? String(err), stack: err?.stack ?? null }, 500);
  }
});
