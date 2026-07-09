const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type Scope = 'signup' | 'recovery';

interface LockoutState {
  attempts: number;
  lockedUntil: number | null;
}

const key = (scope: Scope, email: string) =>
  `otp_lockout:${scope}:${email.toLowerCase().trim()}`;

const read = (scope: Scope, email: string): LockoutState => {
  try {
    const raw = localStorage.getItem(key(scope, email));
    if (!raw) return { attempts: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
};

const write = (scope: Scope, email: string, state: LockoutState) => {
  try {
    localStorage.setItem(key(scope, email), JSON.stringify(state));
    notifySameTab(key(scope, email));
  } catch {
    /* ignore */
  }
};

export const getLockoutRemainingMs = (scope: Scope, email: string): number => {
  if (!email) return 0;
  const { lockedUntil } = read(scope, email);
  if (!lockedUntil) return 0;
  const remaining = lockedUntil - Date.now();
  if (remaining <= 0) {
    clearLockout(scope, email);
    return 0;
  }
  return remaining;
};

export const getRemainingAttempts = (scope: Scope, email: string): number => {
  if (!email) return MAX_ATTEMPTS;
  const { attempts } = read(scope, email);
  return Math.max(0, MAX_ATTEMPTS - attempts);
};

export const registerFailedAttempt = (
  scope: Scope,
  email: string,
): { remaining: number; lockedUntil: number | null } => {
  if (!email) return { remaining: MAX_ATTEMPTS, lockedUntil: null };
  const state = read(scope, email);
  const attempts = state.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  write(scope, email, { attempts, lockedUntil });
  return { remaining: Math.max(0, MAX_ATTEMPTS - attempts), lockedUntil };
};

export const clearLockout = (scope: Scope, email: string) => {
  if (!email) return;
  try {
    localStorage.removeItem(key(scope, email));
  } catch {
    /* ignore */
  }
};

export const formatMs = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export const OTP_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const OTP_LOCKOUT_MS = LOCKOUT_MS;

// ---------- Resend throttling ----------
const RESEND_COOLDOWN_MS = 45 * 1000;
const RESEND_MAX_PER_WINDOW = 5;
const RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface ResendState {
  nextAllowedAt: number;
  windowStart: number;
  count: number;
}

const rkey = (scope: Scope, email: string) =>
  `otp_resend:${scope}:${email.toLowerCase().trim()}`;

const rread = (scope: Scope, email: string): ResendState => {
  try {
    const raw = localStorage.getItem(rkey(scope, email));
    if (!raw) return { nextAllowedAt: 0, windowStart: Date.now(), count: 0 };
    return JSON.parse(raw);
  } catch {
    return { nextAllowedAt: 0, windowStart: Date.now(), count: 0 };
  }
};

const rwrite = (scope: Scope, email: string, s: ResendState) => {
  try {
    localStorage.setItem(rkey(scope, email), JSON.stringify(s));
    notifySameTab(rkey(scope, email));
  } catch {
    /* ignore */
  }
};

export const getResendCooldownMs = (scope: Scope, email: string): number => {
  if (!email) return 0;
  const { nextAllowedAt } = rread(scope, email);
  return Math.max(0, nextAllowedAt - Date.now());
};

export const getResendRemaining = (scope: Scope, email: string): number => {
  if (!email) return RESEND_MAX_PER_WINDOW;
  const s = rread(scope, email);
  if (Date.now() - s.windowStart > RESEND_WINDOW_MS) return RESEND_MAX_PER_WINDOW;
  return Math.max(0, RESEND_MAX_PER_WINDOW - s.count);
};

export const registerResend = (
  scope: Scope,
  email: string,
): { cooldownMs: number; remaining: number; throttled: boolean } => {
  if (!email) return { cooldownMs: 0, remaining: RESEND_MAX_PER_WINDOW, throttled: false };
  const now = Date.now();
  let s = rread(scope, email);
  if (now - s.windowStart > RESEND_WINDOW_MS) {
    s = { nextAllowedAt: 0, windowStart: now, count: 0 };
  }
  if (s.count >= RESEND_MAX_PER_WINDOW) {
    const cooldownMs = Math.max(0, s.windowStart + RESEND_WINDOW_MS - now);
    return { cooldownMs, remaining: 0, throttled: true };
  }
  s.count += 1;
  s.nextAllowedAt = now + RESEND_COOLDOWN_MS;
  rwrite(scope, email, s);
  return {
    cooldownMs: RESEND_COOLDOWN_MS,
    remaining: RESEND_MAX_PER_WINDOW - s.count,
    throttled: false,
  };
};

export const OTP_RESEND_COOLDOWN_MS = RESEND_COOLDOWN_MS;
export const OTP_RESEND_MAX_PER_WINDOW = RESEND_MAX_PER_WINDOW;

// ---------- Cross-tab sync ----------
// Subscribe to changes to lockout/resend state for a given scope+email.
// Fires on `storage` events from other tabs and on a same-tab CustomEvent
// dispatched after any local write.
const SAME_TAB_EVENT = 'otp-lockout-change';

const notifySameTab = (k: string) => {
  try {
    window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: { key: k } }));
  } catch {
    /* ignore */
  }
};

export const subscribeOtpState = (
  scope: Scope,
  email: string,
  cb: () => void,
): (() => void) => {
  if (!email) return () => {};
  const lk = key(scope, email);
  const rk = rkey(scope, email);
  const onStorage = (e: StorageEvent) => {
    if (e.key === lk || e.key === rk) cb();
  };
  const onLocal = (e: Event) => {
    const k = (e as CustomEvent).detail?.key;
    if (k === lk || k === rk) cb();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(SAME_TAB_EVENT, onLocal as EventListener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SAME_TAB_EVENT, onLocal as EventListener);
  };
};