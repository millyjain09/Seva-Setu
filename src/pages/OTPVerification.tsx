import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import {
  clearLockout,
  formatMs,
  getLockoutRemainingMs,
  getRemainingAttempts,
  registerFailedAttempt,
  OTP_MAX_ATTEMPTS,
  getResendCooldownMs,
  getResendRemaining,
  registerResend,
  OTP_RESEND_MAX_PER_WINDOW,
  subscribeOtpState,
} from '@/lib/otpLockout';
import { callOtpThrottle, OtpThrottleView } from '@/lib/otpThrottleServer';

const OTPVerification = () => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [lockMs, setLockMs] = useState(0);
  const [remaining, setRemaining] = useState(OTP_MAX_ATTEMPTS);
  const [resendsLeft, setResendsLeft] = useState(OTP_RESEND_MAX_PER_WINDOW);
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state as any)?.email || '';

  useEffect(() => {
    if (!email) {
      toast.error('Missing email. Please sign up again.');
      navigate('/auth');
    }
  }, [email, navigate]);

  useEffect(() => {
    if (!email) return;
    const sync = () => {
      setLockMs(getLockoutRemainingMs('signup', email));
      setRemaining(getRemainingAttempts('signup', email));
      setCooldown(Math.ceil(getResendCooldownMs('signup', email) / 1000));
      setResendsLeft(getResendRemaining('signup', email));
    };
    sync();
    // Fetch authoritative server state on mount.
    callOtpThrottle('status', 'signup', email).then(applyServerView);
    return subscribeOtpState('signup', email, sync);
  }, [email]);

  useEffect(() => {
    if (lockMs <= 0) return;
    const t = setInterval(() => {
      const next = getLockoutRemainingMs('signup', email);
      setLockMs(next);
      if (next <= 0) setRemaining(getRemainingAttempts('signup', email));
    }, 1000);
    return () => clearInterval(t);
  }, [lockMs, email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const applyServerView = (v: OtpThrottleView) => {
    setLockMs(v.lockMs);
    setRemaining(v.remainingAttempts);
    setCooldown(Math.ceil(v.resendCooldownMs / 1000));
    setResendsLeft(v.resendsLeft);
  };

  const handleVerify = async () => {
    if (lockMs > 0) {
      toast.error(`Too many attempts. Try again in ${formatMs(lockMs)}.`);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup',
      });
      if (error) throw error;
      clearLockout('signup', email);
      await callOtpThrottle('clear', 'signup', email);
      toast.success('Email verified! Welcome to SevaSetu.');
      navigate('/');
    } catch (err: any) {
      const server = await callOtpThrottle('register_failure', 'signup', email);
      registerFailedAttempt('signup', email); // keep local mirror in sync
      applyServerView(server);
      setOtp('');
      if (server.locked) {
        toast.error(`Too many failed attempts. Locked for ${formatMs(server.lockMs)}.`);
      } else {
        toast.error(`${err.message} (${server.remainingAttempts} attempt${server.remainingAttempts === 1 ? '' : 's'} left)`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (lockMs > 0) {
      toast.error(`Locked. Try again in ${formatMs(lockMs)}.`);
      return;
    }
    setResending(true);
    try {
      // Server is the source of truth — reserve a resend slot first.
      const server = await callOtpThrottle('register_resend', 'signup', email);
      applyServerView(server);
      if (server.throttled) {
        if (server.reason === 'cooldown')
          toast.error('Please wait before requesting another code.');
        else if (server.reason === 'window_limit')
          toast.error('Resend limit reached. Try again later.');
        else toast.error(`Locked. Try again in ${formatMs(server.lockMs)}.`);
        return;
      }
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      registerResend('signup', email); // mirror locally for cross-tab UI
      toast.success(`New code sent (${server.resendsLeft} resend${server.resendsLeft === 1 ? '' : 's'} left)`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Verify Your Email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        <div className="flex justify-center">
          <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={lockMs > 0}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button onClick={handleVerify} disabled={otp.length < 6 || loading || lockMs > 0} className="w-full lift-glow">
          {lockMs > 0 ? `Locked – retry in ${formatMs(lockMs)}` : loading ? 'Verifying...' : 'Verify & Continue'}
        </Button>

        {lockMs === 0 && remaining < OTP_MAX_ATTEMPTS && (
          <p className="text-xs text-destructive">
            {remaining} attempt{remaining === 1 ? '' : 's'} remaining before lockout
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          {cooldown > 0 ? (
            <>Resend code in <span className="font-semibold text-primary">{cooldown}s</span></>
          ) : resending ? (
            'Sending...'
          ) : resendsLeft <= 0 ? (
            <span className="text-destructive">Resend limit reached. Try again later.</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || lockMs > 0}
              className="font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              Resend code ({resendsLeft} left)
            </button>
          )}
        </p>

        <Link
          to="/auth"
          className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign Up
        </Link>
      </motion.div>
    </div>
  );
};

export default OTPVerification;
