import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  // Enable CORS for browser requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { 
    "Content-Type": "application/json",
    ...corsHeaders 
  };

  try {
    const payload = await req.json().catch(() => ({}));

    // Validate required fields
    if (!payload.email) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Email is required" 
        }),
        { headers, status: 400 }
      );
    }

    // Get MailerLite API token from environment
    const apiToken = Deno.env.get("MAILERLITE_API_TOKEN");
    if (!apiToken) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "MailerLite API token not configured" 
        }),
        { headers, status: 500 }
      );
    }

    // Prepare subscriber data for MailerLite API
    const subscriberData = {
      email: payload.email,
      fields: {
        name: payload.name || payload.first_name || "",
        last_name: payload.last_name || "",
      },
      groups: ["169453382423020905"], // Your form/group ID
      status: "active",
      subscribed_at: new Date().toISOString(),
    };

    // Remove empty fields
    if (!subscriberData.fields.name) delete subscriberData.fields.name;
    if (!subscriberData.fields.last_name) delete subscriberData.fields.last_name;

    // Call MailerLite API to create/update subscriber
    const mlResponse = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`,
        "Accept": "application/json",
      },
      body: JSON.stringify(subscriberData),
    });

    const mlData = await mlResponse.json();

    if (mlResponse.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Successfully subscribed to newsletter!",
          subscriber_id: mlData.data?.id,
          email: payload.email,
        }),
        { headers, status: 200 }
      );
    } else {
      // Handle MailerLite API errors
      let errorMessage = "Failed to subscribe";
      
      if (mlData.message) {
        errorMessage = mlData.message;
      } else if (mlData.errors) {
        errorMessage = Object.values(mlData.errors).flat().join(", ");
      }

      // Check if subscriber already exists
      if (mlResponse.status === 422 && errorMessage.includes("already exists")) {
        return new Response(
          JSON.stringify({
            ok: true,
            message: "You're already subscribed to our newsletter!",
            already_subscribed: true,
          }),
          { headers, status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: errorMessage,
          status: mlResponse.status,
        }),
        { headers, status: 400 }
      );
    }

  } catch (err) {
    console.error("MailerLite subscription error:", err);
    
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error",
        details: err.message || String(err),
      }),
      { headers, status: 500 }
    );
  }
});