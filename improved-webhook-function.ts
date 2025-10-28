import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * Improved MailerLite to GitHub webhook function
 * Features enhanced error handling and content processing
 */

interface WebhookPayload {
  token?: string;
  event?: string;
  data?: {
    campaign?: {
      id?: string;
      name?: string;
      subject?: string;
    };
  };
}

interface GitHubResponse {
  ok: boolean;
  status: number;
  message: string;
  repo?: string;
  upstream?: string;
  error?: string;
}

function createResponse(data: GitHubResponse, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { 
      headers: { "Content-Type": "application/json" },
      status 
    }
  );
}

function logError(context: string, error: unknown): void {
  console.error(`[${context}] Error:`, error);
}

async function validateWebhookToken(payload: WebhookPayload): Promise<boolean> {
  const expected = Deno.env.get("WEBHOOK_TOKEN");
  if (!expected) {
    console.warn("WEBHOOK_TOKEN not configured");
    return false;
  }
  return payload.token === expected;
}

async function triggerGitHubWorkflow(payload: WebhookPayload): Promise<GitHubResponse> {
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const githubRepo = Deno.env.get("GITHUB_REPO") || "captjreacher/mgrnz-blog";
  
  if (!githubToken) {
    return {
      ok: false,
      status: 500,
      message: "GitHub token not configured",
      error: "Missing GITHUB_TOKEN secret"
    };
  }

  const workflowUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/deploy-gh-pages.yml/dispatches`;
  
  try {
    const response = await fetch(workflowUrl, {
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
          triggered_by: "mailerlite-webhook",
          timestamp: new Date().toISOString(),
          campaign_id: payload.data?.campaign?.id || "unknown",
          campaign_name: payload.data?.campaign?.name || "Unknown Campaign",
        },
      }),
    });

    const responseText = await response.text();
    
    return {
      ok: response.ok,
      status: response.status,
      repo: githubRepo,
      message: response.ok
        ? "GitHub Actions deployment triggered successfully 🎉"
        : "Failed to trigger GitHub Actions ❌",
      upstream: responseText.slice(0, 300),
    };
  } catch (error) {
    logError("GitHub API", error);
    return {
      ok: false,
      status: 500,
      message: "Error calling GitHub API",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

serve(async (req: Request) => {
  try {
    // Parse request payload with error handling
    let payload: WebhookPayload;
    try {
      payload = await req.json();
    } catch (error) {
      logError("JSON parsing", error);
      return createResponse({
        ok: false,
        status: 400,
        message: "Invalid JSON payload",
        error: "Malformed request body"
      }, 400);
    }

    // Validate webhook token
    if (!await validateWebhookToken(payload)) {
      return createResponse({
        ok: false,
        status: 401,
        message: "Unauthorized",
        error: "Invalid or missing webhook token"
      }, 401);
    }

    // Log webhook event for debugging
    console.log("Webhook received:", {
      event: payload.event,
      campaignId: payload.data?.campaign?.id,
      campaignName: payload.data?.campaign?.name,
      timestamp: new Date().toISOString()
    });

    // Process webhook and trigger GitHub workflow
    const result = await triggerGitHubWorkflow(payload);
    
    // Return appropriate status code based on result
    const statusCode = result.ok ? 200 : (result.status >= 500 ? 502 : result.status);
    return createResponse(result, statusCode);

  } catch (error) {
    logError("Webhook processing", error);
    return createResponse({
      ok: false,
      status: 500,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});