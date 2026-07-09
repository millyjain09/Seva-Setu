import { createClient } from 'npm:@supabase/supabase-js@2';
import { withErrorCapture } from "../_shared/error-capture.ts";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Server-side OTP throttle.
// Actions: status | register_failure | register_resend | clear
// All state lives in public.otp_throttle and is enforced here so clients
// cannot bypass it by clearing localStorage or calling Supabase directly.

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const RESEND_MAX_PER_WINDOW = 5;
const RESEND_WINDOW_MS = 60 * 60 * 1000;

type Scope = 'signup' | 'recovery';
type Action = 'status' | 'register_failure' | 'register_resend' | 'clear';

interface Row {
  scope: Scope;
  email: string;
  attempts: number;
  locked_until: string | null;
  resend_count: number;
  resend_window_start: string;
  next_resend_at: string | null;
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const normEmail = (e: unknown) =>
  typeof e === 'string' ? e.trim().toLowerCase() : '';

const isScope = (v: unknown): v is Scope => v === 'signup' || v === 'recovery';

const isAction = (v: unknown): v is Action =>
  v === 'status' || v === 'register_failure' || v === 'register_resend' || v === 'clear';

const loadOrInit = async (scope: Scope, email: string): Promise<Row> => {
  const { data } = await admin
    .from('otp_throttle')
    .select('*')
    .eq('scope', scope)
    .eq('email', email)
    .maybeSingle();
  if (data) return data as Row;
  const seed: Row = {
    scope,
    email,
    attempts: 0,
    locked_until: null,
    resend_count: 0,
    resend_window_start: new Date().toISOString(),
    next_resend_at: null,
  };
  await admin.from('otp_throttle').insert(seed);
  return seed;
};

const computeView = (row: Row) => {
  const now = Date.now();
  const locked = row.locked_until ? new Date(row.locked_until).getTime() : 0;
  const lockMs = Math.max(0, locked - now);

  // Reset resend window if expired.
  const windowStart = new Date(row.resend_window_start).getTime();
  const windowExpired = now - windowStart > RESEND_WINDOW_MS;
  const resendCount = windowExpired ? 0 : row.resend_count;

  const nextResend = row.next_resend_at ? new Date(row.next_resend_at).getTime() : 0;
  const cooldownMs = Math.max(0, nextResend - now);

  return {
    lockMs,
    remainingAttempts: lockMs > 0 ? 0 : Math.max(0, MAX_ATTEMPTS - row.attempts),
    resendCooldownMs: cooldownMs,
    resendsLeft: Math.max(0, RESEND_MAX_PER_WINDOW - resendCount),
    locked: lockMs > 0,
  };
};

Deno.serve(withErrorCapture("otp-throttle", async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const scope = body.scope;
    const email = normEmail(body.email);

    if (!isAction(action) || !isScope(scope) || !email) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let row = await loadOrInit(scope, email);
    const now = Date.now();

    // Auto-expire stale lockouts.
    if (row.locked_until && new Date(row.locked_until).getTime() <= now) {
      row.locked_until = null;
      row.attempts = 0;
    }
    // Auto-reset resend window if expired.
    if (now - new Date(row.resend_window_start).getTime() > RESEND_WINDOW_MS) {
      row.resend_window_start = new Date(now).toISOString();
      row.resend_count = 0;
    }

    if (action === 'status') {
      // no-op write; just return computed view.
    } else if (action === 'clear') {
      row.attempts = 0;
      row.locked_until = null;
    } else if (action === 'register_failure') {
      if (row.locked_until) {
        return new Response(
          JSON.stringify({ throttled: true, reason: 'locked', ...computeView(row) }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      row.attempts += 1;
      if (row.attempts >= MAX_ATTEMPTS) {
        row.locked_until = new Date(now + LOCKOUT_MS).toISOString();
      }
    } else if (action === 'register_resend') {
      if (row.locked_until) {
        return new Response(
          JSON.stringify({ throttled: true, reason: 'locked', ...computeView(row) }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const cooldownLeft = row.next_resend_at
        ? new Date(row.next_resend_at).getTime() - now
        : 0;
      if (cooldownLeft > 0) {
        return new Response(
          JSON.stringify({ throttled: true, reason: 'cooldown', ...computeView(row) }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (row.resend_count >= RESEND_MAX_PER_WINDOW) {
        return new Response(
          JSON.stringify({ throttled: true, reason: 'window_limit', ...computeView(row) }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      row.resend_count += 1;
      row.next_resend_at = new Date(now + RESEND_COOLDOWN_MS).toISOString();
    }

    await admin
      .from('otp_throttle')
      .update({
        attempts: row.attempts,
        locked_until: row.locked_until,
        resend_count: row.resend_count,
        resend_window_start: row.resend_window_start,
        next_resend_at: row.next_resend_at,
        updated_at: new Date().toISOString(),
      })
      .eq('scope', scope)
      .eq('email', email);

    return new Response(
      JSON.stringify({ throttled: false, ...computeView(row) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
