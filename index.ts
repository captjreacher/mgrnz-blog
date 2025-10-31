import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * Supabase Edge Function to trigger a GitHub Actions workflow on a schedule.
 * This function is designed to be called by a cron job.
 */

interface JsonResponse {
  ok: boolean;
  message: string;
  error?: string;
  details?: unknown;
}

// --- Configuration ---
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") || "captjreacher/mgrnz-blog";
const GITHUB_WORKFLOW_ID = "rebuild-on-schedule.yml";
const GITHUB_BRANCH = "main";

// --- Helper Functions ---

function createJsonResponse(data: JsonResponse, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, error instanceof Error ? error.message : error);
}

// --- Core Logic ---

async function triggerGitHubWorkflow(): Promise<Response> {
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    logError("triggerGitHubWorkflow", "Missing GITHUB_TOKEN secret.");
    return createJsonResponse({ ok: false, message: "Server configuration error." }, 500);
  }

  const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_ID}/dispatches`;

  try {
    const response = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: GITHUB_BRANCH,
        inputs: {
          source: "supabase-cron-scheduler",
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (response.status !== 204) {
      const errorBody = await response.text();
      logError("GitHub API", { status: response.status, body: errorBody });
      return createJsonResponse({
        ok: false,
        message: "Failed to trigger GitHub Actions workflow.",
        details: { status: response.status, error: errorBody },
      }, 502); // 502 Bad Gateway is appropriate here
    }

    console.log("Successfully triggered GitHub Actions workflow.");
    return createJsonResponse({
      ok: true,
      message: "GitHub Actions build triggered successfully by scheduler.",
    }, 200);

  } catch (error) {
    logError("triggerGitHubWorkflow", error);
    return createJsonResponse({
      ok: false,
      message: "An unexpected error occurred while contacting GitHub.",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
}

// --- Server Handler ---

serve(async (req: Request) => {
  // 1. Ensure it's a POST request
  if (req.method !== "POST") {
    return createJsonResponse({ ok: false, message: "Method Not Allowed" }, 405);
  }

  // 2. Security Check: Verify the authorization token
  const webhookToken = Deno.env.get("WEBHOOK_TOKEN");
  if (!webhookToken) {
    logError("Security", "WEBHOOK_TOKEN is not set. The function is publicly accessible, which is a security risk.");
    // Depending on policy, you might want to return an error here instead of just warning.
  }

  const authHeader = req.headers.get("Authorization");
  if (webhookToken && authHeader !== `Bearer ${webhookToken}`) {
    return createJsonResponse({ ok: false, message: "Unauthorized" }, 401);
  }

  // 3. Proceed to trigger the workflow
  try {
    return await triggerGitHubWorkflow();
  } catch (error) {
    logError("MainHandler", error);
    return createJsonResponse({ ok: false, message: "Internal Server Error" }, 500);
  }
});