import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorCapture } from "../_shared/error-capture.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const langMap: Record<string, string> = {
  "hi-IN": "Hindi",
  "en-IN": "Indian English",
  "bn-IN": "Bengali",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "mr-IN": "Marathi",
  "gu-IN": "Gujarati",
  "kn-IN": "Kannada",
  "ml-IN": "Malayalam",
  "pa-IN": "Punjabi",
};

serve(withErrorCapture("text-to-speech", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { text, language, voice } = await req.json().catch(() => ({}));
  const cleanText = typeof text === "string" ? text.trim() : "";
  if (!cleanText) {
    return new Response(JSON.stringify({ error: "Text is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (cleanText.length > 5000) {
    return new Response(JSON.stringify({ error: "Text is too long for one voice request" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const selectedVoice = ["nova", "shimmer", "alloy"].includes(String(voice)) ? String(voice) : "nova";
  const langName = langMap[String(language)] || "the detected language";

  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: cleanText,
      voice: selectedVoice,
      response_format: "mp3",
      stream_format: "audio",
      instructions:
        `Use a warm, gentle, sweet female clinical-assistant tone with clear pitch and calm pacing. ` +
        `The main selected language is ${langName}, but the text may contain mixed English and Indian-language words. ` +
        `Pronounce every word naturally in its original language and do not skip non-Latin scripts.`,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("TTS gateway error:", response.status, details);
    return new Response(JSON.stringify({ error: "Voice generation failed", details }), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(response.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}));