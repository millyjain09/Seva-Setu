import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { withErrorCapture } from "../_shared/error-capture.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Scheme {
  title: string;
  description: string;
  link: string;
  eligibility_criteria: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You are an expert on Indian government health schemes (central + major state schemes).
Return ONLY valid JSON matching the provided tool schema.
Include real, currently active schemes with their official URLs (myscheme.gov.in, nhp.gov.in, pmjay.gov.in, official ministry sites, or state portals).
Cover at least: Ayushman Bharat PM-JAY, PMJJBY, PMSBY, Janani Suraksha Yojana, Rashtriya Bal Swasthya Karyakram, Mission Indradhanush, Ayushman Bharat Health Infrastructure Mission, PM National Dialysis Programme, Rashtriya Arogya Nidhi, National Programme for Health Care of the Elderly, Mental Healthcare schemes, and 3-5 major state-level health schemes.
Each scheme: concise 1-2 sentence description, accurate official link, and structured eligibility (category, age, income, state, ration_card, family_size as relevant).`;

async function fetchFromAI(): Promise<Scheme[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "Return the latest list of Indian government health schemes (central + state) relevant to a rural health navigator app. Aim for 18-25 schemes.",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_schemes",
              description: "Return the list of government health schemes",
              parameters: {
                type: "object",
                properties: {
                  schemes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        link: { type: "string" },
                        eligibility_criteria: {
                          type: "object",
                          properties: {
                            category: { type: "string" },
                            age: { type: "string" },
                            income: { type: "string" },
                            state: { type: "string" },
                            ration_card: { type: "string" },
                            family_size: { type: "string" },
                          },
                        },
                      },
                      required: ["title", "description", "link", "eligibility_criteria"],
                    },
                  },
                },
                required: ["schemes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_schemes" } },
      }),
    },
  );

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("No tool call returned");
  const parsed = JSON.parse(call.function.arguments);
  return parsed.schemes ?? [];
}

async function fetchFromDataGov(): Promise<Scheme[]> {
  const key = Deno.env.get("DATA_GOV_IN_API_KEY");
  if (!key) return [];
  try {
    // National Health Mission scheme dataset (one of several health-related catalogs)
    const url = `https://api.data.gov.in/resource/health-schemes?api-key=${key}&format=json&limit=50`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    const records = (j?.records ?? []) as Array<Record<string, string>>;
    return records
      .filter((rec) => rec.title || rec.scheme_name)
      .map((rec) => ({
        title: rec.title || rec.scheme_name || "Untitled",
        description: rec.description || rec.objective || "",
        link: rec.link || rec.url || "https://www.myscheme.gov.in",
        eligibility_criteria: { category: rec.category || "Health" },
      }));
  } catch {
    return [];
  }
}

Deno.serve(withErrorCapture("refresh-schemes", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Primary: AI; Fallback merge: data.gov.in (if API key set)
    const [ai, gov] = await Promise.all([
      fetchFromAI().catch((e) => {
        console.error("AI fetch failed", e);
        return [] as Scheme[];
      }),
      fetchFromDataGov(),
    ]);

    // Merge — AI primary, dedupe by title (case-insensitive)
    const seen = new Set<string>();
    const merged: Scheme[] = [];
    for (const s of [...ai, ...gov]) {
      const key = s.title.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...s, title: s.title.trim(), source: "api" } as Scheme & { source: string });
    }

    if (merged.length === 0) {
      return new Response(
        JSON.stringify({ error: "No schemes returned from any source" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error } = await supabase
      .from("govt_schemes")
      .upsert(merged, { onConflict: "title" });
    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, count: merged.length, sources: { ai: ai.length, gov: gov.length } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("refresh-schemes error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}));
