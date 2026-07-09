import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withErrorCapture } from "../_shared/error-capture.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- VAPID JWT (copied from send-push) ---
async function generateJWT(
  vapidPrivateKey: string,
  vapidPublicKey: string,
  audience: string,
  subject: string
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: subject };
  const enc = new TextEncoder();
  const b64url = (buf: ArrayBuffer | Uint8Array) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const rawKey = Uint8Array.from(
    atob(vapidPrivateKey.replace(/-/g, "+").replace(/_/g, "/") + "=="),
    (c) => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    "pkcs8", rawKey.buffer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  ).catch(async () => {
    const jwk = {
      kty: "EC", crv: "P-256", d: vapidPrivateKey,
      x: vapidPublicKey.substring(0, 43), y: vapidPublicKey.substring(43),
    };
    return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  });
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsignedToken),
  );
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) { r = sigBytes.slice(0, 32); s = sigBytes.slice(32); }
  else {
    const rLen = sigBytes[3];
    r = sigBytes.slice(4, 4 + rLen); if (r.length > 32) r = r.slice(r.length - 32);
    const sOffset = 4 + rLen;
    const sLen = sigBytes[sOffset + 1];
    s = sigBytes.slice(sOffset + 2, sOffset + 2 + sLen); if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) { const t = new Uint8Array(32); t.set(r, 32 - r.length); r = t; }
    if (s.length < 32) { const t = new Uint8Array(32); t.set(s, 32 - s.length); s = t; }
  }
  const rawSig = new Uint8Array(64); rawSig.set(r, 0); rawSig.set(s, 32);
  return `${unsignedToken}.${b64url(rawSig)}`;
}

// Get HH:MM and YYYY-MM-DD strings in a given IANA timezone
function localParts(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    hhmm: `${parts.hour}:${parts.minute}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10),
  };
}

async function fetchWeather(lat: number, lon: number) {
  const key = Deno.env.get("OPENWEATHER_API_KEY");
  if (!key) return null;
  const curUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
  const fcUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=4&appid=${key}`;
  const [curRes, fcRes] = await Promise.all([fetch(curUrl), fetch(fcUrl)]);
  if (!curRes.ok) return null;
  const cur = await curRes.json();
  const fc = fcRes.ok ? await fcRes.json() : { list: [] };
  const forecast = (fc.list || []).map((f: any) => ({
    time: f.dt_txt,
    temp: f.main?.temp,
    condition: f.weather?.[0]?.description ?? "",
    pop: Math.round((f.pop ?? 0) * 100),
  }));
  return {
    temperature: cur.main?.temp,
    feels_like: cur.main?.feels_like,
    humidity: cur.main?.humidity,
    wind: Math.round((cur.wind?.speed ?? 0) * 3.6),
    precipitation: (cur.rain?.["1h"] ?? 0) + (cur.snow?.["1h"] ?? 0),
    condition: cur.weather?.[0]?.description ?? "current weather",
    forecast,
  };
}

async function generateTip(weather: Awaited<ReturnType<typeof fetchWeather>>, lang: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const wxBlock = weather
    ? `Live local weather: ${weather.condition}, ${weather.temperature}°C (feels ${weather.feels_like}°C), humidity ${weather.humidity}%, wind ${weather.wind} km/h, precipitation ${weather.precipitation} mm.` +
      (weather.forecast?.length
        ? `\nNext 12h forecast:\n${weather.forecast.map((f: any) => `- ${f.time}: ${f.condition}, ${Math.round(f.temp)}°C, rain chance ${f.pop}%`).join("\n")}`
        : "")
    : "Live weather is not available — give a general, time-appropriate tip.";
  const prompt = `You are a rural health advisor for India. Generate ONE short, actionable daily health tip (max 22 words) for right now.
${wxBlock}
Use the forecast to anticipate conditions (e.g. incoming rain, heat) when relevant. Reply ONLY as compact JSON: {"emoji":"<one emoji>","tip":"<the tip in ${lang}>"}. No markdown, no extra text.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const ai = await res.json();
  const raw: string = ai.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed?.tip) return { emoji: parsed.emoji || "💡", tip: String(parsed.tip) };
  } catch { /* fall through */ }
  return { emoji: "💡", tip: cleaned.slice(0, 200) || "Stay hydrated and listen to your body today." };
}

serve(withErrorCapture("send-daily-tip", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@sevasetu.app";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Optional: caller can request a specific user_id (used by "Send test" button)
    let testUserId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.test_user_id) testUserId = String(body.test_user_id);
    }

    const SLOT_MIN = 15; // cron tick

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, tip_notify_enabled, tip_notify_time, timezone, last_lat, last_lon, tip_last_sent_on, language_preference, full_name")
      .or(testUserId ? `id.eq.${testUserId}` : "tip_notify_enabled.eq.true");
    if (pErr) throw pErr;

    const results: Array<{ user_id: string; status: string; detail?: string }> = [];

    for (const p of profiles || []) {
      try {
        const tz = p.timezone || "Asia/Kolkata";
        const { hhmm, date: localDate, minutes: nowMin } = localParts(tz);
        const [hh, mm] = String(p.tip_notify_time || "08:00:00").split(":");
        const targetMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
        const diff = nowMin - targetMin;

        if (!testUserId) {
          if (diff < 0 || diff >= SLOT_MIN) {
            continue;
          }
          if (p.tip_last_sent_on === localDate) {
            continue;
          }
        }

        // Fetch subscriptions
        const { data: subs } = await supabase
          .from("push_subscriptions").select("*").eq("user_id", p.id);
        if (!subs || subs.length === 0) {
          results.push({ user_id: p.id, status: "skipped", detail: "no subscriptions" });
          continue;
        }

        // Weather + tip
        const weather = p.last_lat != null && p.last_lon != null
          ? await fetchWeather(p.last_lat, p.last_lon).catch(() => null)
          : null;
        const tip = await generateTip(weather, p.language_preference || "English");

        const title = `${tip.emoji} Daily Health Tip`;
        const body = weather
          ? `${tip.tip}\n${weather.condition}, ${Math.round(weather.temperature)}°C · humidity ${weather.humidity}%`
          : tip.tip;

        const payload = JSON.stringify({
          title, body, icon: "/pwa-192x192.png", url: "/",
        });

        let sent = 0, failed = 0;
        for (const sub of subs) {
          try {
            const endpointUrl = new URL(sub.endpoint);
            const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
            const jwt = await generateJWT(VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, audience, VAPID_SUBJECT);
            const r = await fetch(sub.endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                TTL: "86400",
                Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
              },
              body: new TextEncoder().encode(payload),
            });
            if (r.status === 201 || r.status === 200) sent++;
            else if (r.status === 404 || r.status === 410) {
              await supabase.from("push_subscriptions").delete().eq("id", sub.id);
              failed++;
            } else failed++;
          } catch { failed++; }
        }

        await supabase.from("notifications").insert({
          user_id: p.id, title, message: body, icon_name: "Bell", category: "reminder",
        });

        if (!testUserId) {
          await supabase.from("profiles")
            .update({ tip_last_sent_on: localDate })
            .eq("id", p.id);
        }

        results.push({ user_id: p.id, status: "sent", detail: `${sent}/${subs.length} (${failed} failed)` });
      } catch (err) {
        results.push({ user_id: p.id, status: "error", detail: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
