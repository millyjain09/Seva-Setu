import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withErrorCapture } from "../_shared/error-capture.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Web Push helper using Web Crypto API (no npm needed)
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

  // Import VAPID private key
  const rawKey = Uint8Array.from(
    atob(vapidPrivateKey.replace(/-/g, "+").replace(/_/g, "/") + "=="),
    (c) => c.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    rawKey.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  ).catch(async () => {
    // Try JWK import for raw 32-byte keys
    const jwk = {
      kty: "EC",
      crv: "P-256",
      d: vapidPrivateKey,
      x: vapidPublicKey.substring(0, 43),
      y: vapidPublicKey.substring(43),
    };
    return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  });

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32);
  } else {
    // DER encoded
    const rLen = sigBytes[3];
    const rStart = 4 + (rLen - 32 > 0 ? rLen - 32 : 0);
    r = sigBytes.slice(4, 4 + rLen);
    if (r.length > 32) r = r.slice(r.length - 32);
    const sOffset = 4 + rLen;
    const sLen = sigBytes[sOffset + 1];
    s = sigBytes.slice(sOffset + 2, sOffset + 2 + sLen);
    if (s.length > 32) s = s.slice(s.length - 32);
    // Pad to 32 bytes
    if (r.length < 32) { const t = new Uint8Array(32); t.set(r, 32 - r.length); r = t; }
    if (s.length < 32) { const t = new Uint8Array(32); t.set(s, 32 - s.length); s = t; }
  }

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  return `${unsignedToken}.${b64url(rawSig)}`;
}

serve(withErrorCapture("send-push", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let callerId = "";
    let callerIsAdmin = false;
    if (!isServiceRole) {
      const { data: claimsData, error: claimsError } =
        await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerId = claimsData.claims.sub as string;
    } else {
      callerIsAdmin = true;
    }

    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@sevasetu.app";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id, title, body, url, icon } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: only allow sending to self, or to others if caller is admin/superadmin (or service role)
    if (!callerIsAdmin && user_id !== callerId) {
      const { data: isAdmin } = await supabaseAuth.rpc("has_role", { _user_id: callerId, _role: "admin" });
      const { data: isSuper } = await supabaseAuth.rpc("has_role", { _user_id: callerId, _role: "superadmin" });
      if (!isAdmin && !isSuper) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all push subscriptions for this user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found for user", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: icon || "/pwa-192x192.png",
      url: url || "/",
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const endpoint = sub.endpoint;
        const endpointUrl = new URL(endpoint);
        const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

        const jwt = await generateJWT(VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, audience, VAPID_SUBJECT);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            TTL: "86400",
            Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
          },
          body: new TextEncoder().encode(payload),
        });

        if (response.status === 201 || response.status === 200) {
          sent++;
        } else if (response.status === 404 || response.status === 410) {
          // Subscription expired, clean up
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
          failed++;
        } else {
          console.error(`Push failed for ${endpoint}: ${response.status} ${await response.text()}`);
          failed++;
        }
      } catch (err) {
        console.error("Push error:", err);
        failed++;
      }
    }

    // Also insert an in-app notification
    await supabase.from("notifications").insert({
      user_id,
      title,
      message: body,
      icon_name: "Bell",
      category: "reminder",
    });

    return new Response(
      JSON.stringify({ sent, failed, total: subscriptions.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));
