import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorCapture } from "../_shared/error-capture.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map BCP-47 like "hi-IN" -> bare ISO-639-1 accepted by transcription models.
const langMap: Record<string, string> = {
  "hi-IN": "hi", "en-IN": "en", "en-US": "en", "en-GB": "en",
  "bn-IN": "bn", "ta-IN": "ta", "te-IN": "te", "mr-IN": "mr",
  "gu-IN": "gu", "kn-IN": "kn", "ml-IN": "ml", "pa-IN": "pa",
};

serve(withErrorCapture("speech-to-text", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const inbound = await req.formData().catch(() => null);
  if (!inbound) {
    return new Response(JSON.stringify({ error: "Expected multipart/form-data with an audio 'file'." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const file = inbound.get("file");
  if (!(file instanceof File) || file.size < 1024) {
    return new Response(JSON.stringify({ error: "Empty or missing audio file. Please record again." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (file.size > 24 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "Recording is too long. Please keep it under ~2 minutes." }), {
      status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const language = String(inbound.get("language") || "");
  const iso = langMap[language];

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const upstream = new FormData();
  upstream.append("model", "openai/gpt-4o-mini-transcribe");
  upstream.append("file", file, file.name || "recording.webm");
  if (iso) upstream.append("language", iso);

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: upstream,
  });

  if (!resp.ok) {
    const details = await resp.text().catch(() => "");
    console.error("STT gateway error:", resp.status, details);
    return new Response(JSON.stringify({ error: "Transcription failed", details }), {
      status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const json = await resp.json().catch(() => ({}));
  return new Response(JSON.stringify({ text: (json as any)?.text ?? "" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));