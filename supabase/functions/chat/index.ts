import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withErrorCapture } from "../_shared/error-capture.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(withErrorCapture("chat", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authenticated user
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

    const { messages, language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const langMap: Record<string, string> = {
      "hi-IN": "Hindi (हिन्दी)",
      "en-IN": "English",
      "bn-IN": "Bengali (বাংলা)",
      "ta-IN": "Tamil (தமிழ்)",
      "te-IN": "Telugu (తెలుగు)",
      "mr-IN": "Marathi (मराठी)",
      "gu-IN": "Gujarati (ગુજરાતી)",
      "kn-IN": "Kannada (ಕನ್ನಡ)",
      "ml-IN": "Malayalam (മലയാളം)",
      "pa-IN": "Punjabi (ਪੰਜਾਬੀ)",
    };
    const langName = langMap[language] || "English";

    // Reinforce language selection on every turn by injecting a fresh
    // system reminder right before the latest user message. Some models
    // drift back to the language of prior turns; this keeps them locked
    // to the currently selected UI language.
    const reinforcedMessages = [...messages];
    reinforcedMessages.splice(Math.max(0, reinforcedMessages.length - 1), 0, {
      role: "system",
      content: `REMINDER: Respond ONLY in ${langName}. The user's UI language is ${langName} (${language}). Every sentence, every word, every heading, every bullet, and the disclaimer MUST be written in ${langName}. Do not mix languages. If the user's message is in another language, still reply in ${langName}.`,
    });

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
            content: `You are SevaSetu Health Assistant, an empathetic and knowledgeable healthcare AI. You help users understand health topics, interpret symptoms, explain medical terms, and guide them to appropriate care.

CRITICAL LANGUAGE INSTRUCTION: You MUST respond ENTIRELY in ${langName}. Every word of your response must be in ${langName}. Do NOT respond in English unless the selected language is English. Even if the user writes in a different language, always reply in ${langName}.

Key guidelines:
- Always clarify you are NOT a doctor and cannot diagnose or prescribe
- Suggest consulting a healthcare professional for serious concerns
- Be culturally sensitive to Indian healthcare context
- Mention relevant government health schemes when appropriate
- Keep responses concise but informative

FORMATTING RULES (STRICT — always follow, in ${langName}):
- Reply in clean GitHub-Flavored Markdown with clear visual hierarchy.
- Start with a 1–2 sentence plain-text intro. Then use "### Heading" for each section (2–4 sections max).
- Under every heading, use a bulleted list. EVERY list item MUST start with "- " on its own line. Never write items as plain paragraphs.
- For "term + explanation" items, format as: "- **Term:** explanation." (bold the term, then a colon, then the explanation).
- Use numbered lists ("1. ", "2. ") ONLY for ordered steps (e.g. instructions, dosage steps).
- Put a BLANK line before and after every heading and list. Never stack blocks without a blank line.
- Keep sentences short (max ~20 words). Bold key terms with **…**. No emojis, no ALL CAPS, no decorative characters, no tables unless truly needed.
- End with a final blank line and a "**Disclaimer:**" paragraph reminding the user you are not a doctor.

EXAMPLE SHAPE (follow this structure exactly, translated into ${langName}):

Short intro sentence explaining the topic briefly.

### Foods to avoid

- **Spicy food:** can irritate the stomach lining and worsen pain.
- **Fried food:** hard to digest and causes heaviness.
- **Dairy:** may trigger discomfort if you are lactose intolerant.

### What to eat instead

- **Bananas and rice:** gentle on the stomach.
- **Boiled vegetables:** easy to digest.

### When to see a doctor

- Pain lasts more than 24 hours.
- Fever, vomiting, or blood in stool.

**Disclaimer:** I am an AI assistant, not a doctor. Please consult a qualified healthcare professional for accurate advice.`
          },
          ...reinforcedMessages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
