// Shared error-capture wrapper for Edge Functions.
// - Emits structured JSON to stdout (visible in Supabase Edge Function logs).
// - Persists the error + request context to public.function_errors for the
//   Admin dashboard using the service-role key.
//
// Usage:
//   import { withErrorCapture, corsHeaders } from "../_shared/error-capture.ts";
//   Deno.serve(withErrorCapture("my-fn", async (req, ctx) => { ... }));

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

export type CaptureContext = {
  requestId: string;
  functionName: string;
  userId?: string | null;
};

export type HandlerFn = (
  req: Request,
  ctx: CaptureContext,
) => Promise<Response> | Response;

const SAFE_HEADER_KEYS = new Set([
  "content-type",
  "user-agent",
  "referer",
  "origin",
  "x-forwarded-for",
  "x-real-ip",
  "accept-language",
]);

function pickHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (SAFE_HEADER_KEYS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

async function readBodyPreview(req: Request): Promise<string | null> {
  try {
    if (req.method === "GET" || req.method === "OPTIONS") return null;
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("json") && !ct.includes("text") && !ct.includes("form")) {
      return null;
    }
    const text = await req.clone().text();
    return text.length > 2000 ? text.slice(0, 2000) + "…(truncated)" : text;
  } catch {
    return null;
  }
}

async function extractUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function persistError(params: {
  functionName: string;
  requestId: string;
  err: unknown;
  req: Request;
  status: number;
  userId: string | null;
  extra?: Record<string, unknown>;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;

  const message =
    params.err instanceof Error ? params.err.message : String(params.err);
  const stack = params.err instanceof Error ? params.err.stack ?? null : null;
  const url = new URL(params.req.url);

  const body_preview = await readBodyPreview(params.req);

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    await admin.from("function_errors").insert({
      function_name: params.functionName,
      request_id: params.requestId,
      message,
      stack,
      method: params.req.method,
      path: url.pathname,
      status: params.status,
      user_id: params.userId,
      headers: pickHeaders(params.req),
      body_preview,
      extra: params.extra ?? null,
    });
  } catch (persistErr) {
    // Never let error-logging itself crash the function.
    console.error(
      JSON.stringify({
        level: "error",
        source: "error-capture",
        message: "failed to persist function_errors row",
        detail:
          persistErr instanceof Error ? persistErr.message : String(persistErr),
        function: params.functionName,
        requestId: params.requestId,
      }),
    );
  }
}

export function withErrorCapture(functionName: string, handler: HandlerFn) {
  return async (req: Request): Promise<Response> => {
    const requestId =
      req.headers.get("x-request-id") ??
      (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    const userId = await extractUserId(req);
    const ctx: CaptureContext = { requestId, functionName, userId };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      return await handler(req, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;

      console.error(
        JSON.stringify({
          level: "error",
          function: functionName,
          requestId,
          userId,
          method: req.method,
          path: new URL(req.url).pathname,
          message,
          stack,
        }),
      );

      await persistError({
        functionName,
        requestId,
        err,
        req,
        status: 500,
        userId,
      });

      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message,
          requestId,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  };
}

// Manual capture for handled errors where you still return a non-500 response
// but want visibility (e.g. upstream API failed but you returned a friendly 200).
export async function captureHandled(
  functionName: string,
  err: unknown,
  req: Request,
  opts: { status?: number; extra?: Record<string, unknown> } = {},
) {
  const requestId =
    req.headers.get("x-request-id") ??
    (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
  const userId = await extractUserId(req);
  console.warn(
    JSON.stringify({
      level: "warn",
      function: functionName,
      requestId,
      userId,
      message: err instanceof Error ? err.message : String(err),
      extra: opts.extra,
    }),
  );
  await persistError({
    functionName,
    requestId,
    err,
    req,
    status: opts.status ?? 200,
    userId,
    extra: opts.extra,
  });
}