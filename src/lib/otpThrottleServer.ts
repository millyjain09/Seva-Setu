import { supabase } from '@/lib/supabase';

export type OtpScope = 'signup' | 'recovery';
export type OtpAction = 'status' | 'register_failure' | 'register_resend' | 'clear';

export interface OtpThrottleView {
  throttled: boolean;
  reason?: 'locked' | 'cooldown' | 'window_limit';
  lockMs: number;
  remainingAttempts: number;
  resendCooldownMs: number;
  resendsLeft: number;
  locked: boolean;
}

const FALLBACK: OtpThrottleView = {
  throttled: false,
  lockMs: 0,
  remainingAttempts: 5,
  resendCooldownMs: 0,
  resendsLeft: 5,
  locked: false,
};

export const callOtpThrottle = async (
  action: OtpAction,
  scope: OtpScope,
  email: string,
): Promise<OtpThrottleView> => {
  if (!email) return FALLBACK;
  try {
    const { data, error } = await supabase.functions.invoke('otp-throttle', {
      body: { action, scope, email },
    });
    if (error) {
      // Edge function returns 429 with a JSON body for throttled responses.
      // supabase-js surfaces that as an error; try to read context.
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        try {
          const parsed = await ctx.clone().json();
          return { ...FALLBACK, ...parsed };
        } catch {
          /* ignore */
        }
      }
      return FALLBACK;
    }
    return { ...FALLBACK, ...(data as Partial<OtpThrottleView>) };
  } catch {
    return FALLBACK;
  }
};