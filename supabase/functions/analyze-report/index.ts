import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withErrorCapture } from "../_shared/error-capture.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(withErrorCapture("analyze-report", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const fileType = typeof body.fileType === "string" ? body.fileType : "";

    // Server-side validation
    const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
    const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const safeNamePattern = /^[A-Za-z0-9_\-.]{1,80}$/;
    if (
      !fileName ||
      !safeNamePattern.test(fileName) ||
      fileName.includes("..") ||
      fileName.includes("/") ||
      !ALLOWED_EXT.includes(ext) ||
      !ALLOWED_MIME.includes(fileType)
    ) {
      return new Response(JSON.stringify({ error: "Invalid file name or type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a medical report analysis AI. Given a file name and type, infer the likely report type and provide a helpful analysis framework. You must respond with valid JSON only, no markdown.

Response format:
{
  "report_type": "string - inferred report type (e.g. CBC, Lipid Panel, X-Ray, etc.)",
  "summary": "string - 2-3 sentence summary of what this type of report typically covers and what patients should know",
  "key_parameters": ["array of key parameters typically found in this report type"],
  "risk_level": "Low | Medium | High - based on the report type's typical clinical significance",
  "recommendations": "string - general advice about this type of report"
}`
          },
          {
            role: "user",
            content: `Analyze this uploaded medical report:\nFile name: ${fileName}\nFile type: ${fileType}\n\nProvide the analysis as JSON.`
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    // Try to parse the AI response as JSON
    let analysis;
    try {
      // Remove markdown code blocks if present
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        report_type: "Medical Report",
        summary: content,
        key_parameters: [],
        risk_level: "Low",
        recommendations: "Please consult your doctor for detailed analysis."
      };
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
