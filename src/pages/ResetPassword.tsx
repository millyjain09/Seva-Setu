import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
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

const ResetPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state as any)?.email || '';

  const [step, setStep] = useState<'otp' | 'password'>('otp');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [lockMs, setLockMs] = useState(0);
  const [remaining, setRemaining] = useState(OTP_MAX_ATTEMPTS);
  const [resendsLeft, setResendsLeft] = useState(OTP_RESEND_MAX_PER_WINDOW);

  useEffect(() => {
    if (!email) {
      toast.error('Start password reset from the Forgot Password page.');
      navigate('/forgot-password');
    }
  }, [email, navigate]);

  useEffect(() => {
    if (!email) return;
    const sync = () => {
      setLockMs(getLockoutRemainingMs('recovery', email));
      setRemaining(getRemainingAttempts('recovery', email));
      setCooldown(Math.ceil(getResendCooldownMs('recovery', email) / 1000));
      setResendsLeft(getResendRemaining('recovery', email));
    };
    sync();
    callOtpThrottle('status', 'recovery', email).then(applyServerView);
    return subscribeOtpState('recovery', email, sync);
  }, [email]);

  useEffect(() => {
    if (lockMs <= 0) return;
    const t = setInterval(() => {
      const next = getLockoutRemainingMs('recovery', email);
      setLockMs(next);
      if (next <= 0) setRemaining(getRemainingAttempts('recovery', email));
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

  const handleVerifyOtp = async () => {
    if (lockMs > 0) {
      toast.error(`Too many attempts. Try again in ${formatMs(lockMs)}.`);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'recovery' });
      if (error) throw error;
      clearLockout('recovery', email);
      await callOtpThrottle('clear', 'recovery', email);
      setStep('password');
    } catch (err: any) {
      const server = await callOtpThrottle('register_failure', 'recovery', email);
      registerFailedAttempt('recovery', email);
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Password updated!');
    navigate('/');
  };

  const handleResend = async () => {
    if (lockMs > 0) {
      toast.error(`Locked. Try again in ${formatMs(lockMs)}.`);
      return;
    }
    setLoading(true);
    const server = await callOtpThrottle('register_resend', 'recovery', email);
    applyServerView(server);
    if (server.throttled) {
      setLoading(false);
      if (server.reason === 'cooldown')
        toast.error('Please wait before requesting another code.');
      else if (server.reason === 'window_limit')
        toast.error('Resend limit reached. Try again later.');
      else toast.error(`Locked. Try again in ${formatMs(server.lockMs)}.`);
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      registerResend('recovery', email);
      toast.success(`New code sent (${server.resendsLeft} resend${server.resendsLeft === 1 ? '' : 's'} left)`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-6">
        {step === 'otp' ? (
          <div className="card-premium shine-border p-8 space-y-6">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Verification Required</h1>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code sent to<br />
                <span className="font-semibold text-foreground">{email}</span>
              </p>
            </div>

            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
                disabled={lockMs > 0}
                containerClassName="gap-2 sm:gap-3"
              >
                <InputOTPGroup className="gap-2 sm:gap-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-12 w-12 rounded-lg border border-input bg-background text-lg font-semibold first:rounded-lg last:rounded-lg"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button
              onClick={handleVerifyOtp}
              disabled={otp.length < 6 || loading || lockMs > 0}
              className="w-full h-12 text-base font-semibold lift-glow"
            >
              {lockMs > 0 ? `Locked – retry in ${formatMs(lockMs)}` : loading ? 'Verifying...' : 'Verify Code'}
            </Button>

            {lockMs === 0 && remaining < OTP_MAX_ATTEMPTS && (
              <p className="text-center text-xs text-destructive">
                {remaining} attempt{remaining === 1 ? '' : 's'} remaining before lockout
              </p>
            )}

            <div className="flex flex-col items-center gap-3 pt-1">
              <p className="text-sm text-muted-foreground">
                {cooldown > 0 ? (
                  <>Resend code in <span className="font-semibold text-primary">{cooldown}s</span></>
                ) : resendsLeft <= 0 ? (
                  <span className="text-destructive">Resend limit reached. Try again later.</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading || lockMs > 0}
                    className="font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                  >
                    Resend code ({resendsLeft} left)
                  </button>
                )}
              </p>
              <Link
                to="/forgot-password"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Cancel & Return
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-foreground">Set New Password</h1>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full lift-glow" disabled={loading || password.length < 6}>
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default ResetPassword;
