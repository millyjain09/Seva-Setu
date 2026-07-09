import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Activity, Shield, Sparkles, Stethoscope, Pill } from 'lucide-react';

const floatingIcons = [
  { Icon: Heart, delay: 0, x: -80, y: -60 },
  { Icon: Activity, delay: 0.2, x: 90, y: -40 },
  { Icon: Shield, delay: 0.4, x: -70, y: 50 },
  { Icon: Pill, delay: 0.6, x: 80, y: 60 },
  { Icon: Stethoscope, delay: 0.8, x: 0, y: -90 },
  { Icon: Sparkles, delay: 1.0, x: -50, y: 80 },
];

export const Preloader = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 150);
          return 100;
        }
        return prev + 8;
      });
    }, 20);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {progress <= 100 && (
        <motion.div
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden"
        >
          {/* Ambient glow */}
          <div className="absolute w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
          <div className="absolute w-[300px] h-[300px] rounded-full bg-secondary/8 blur-[100px] translate-x-32 -translate-y-20 animate-pulse" />

          {/* Floating medical icons */}
          <div className="relative">
            {floatingIcons.map(({ Icon, delay, x, y }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: [0, 0.6, 0.3, 0.6],
                  scale: [0, 1, 0.8, 1],
                  x: [0, x * 0.5, x, x * 0.8],
                  y: [0, y * 0.5, y, y * 0.8],
                }}
                transition={{
                  duration: 2.5,
                  delay,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  ease: 'easeInOut',
                }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              >
                <div className="p-2.5 rounded-xl bg-card/80 border border-border/50 shadow-lg backdrop-blur-sm transition-all duration-300 group-hover:scale-125 group-hover:shadow-xl group-hover:bg-primary/10 group-hover:border-primary/30">
                  <Icon className="h-5 w-5 text-muted-foreground transition-colors duration-300 group-hover:text-primary" />
                </div>
              </motion.div>
            ))}

            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative z-10 flex flex-col items-center"
            >
              {/* Pulsing ring behind logo */}
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute w-28 h-28 rounded-full border-2 border-primary/30"
              />
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0, 0.2] }}
                transition={{ duration: 2, delay: 0.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute w-28 h-28 rounded-full border border-primary/20"
              />

              {/* Logo circle */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="w-24 h-24 rounded-full bg-gradient-to-br from-primary via-primary/80 to-secondary flex items-center justify-center shadow-2xl"
                style={{ boxShadow: '0 0 40px hsl(var(--primary) / 0.3)' }}
              >
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                >
                  <Heart className="h-10 w-10 text-primary-foreground drop-shadow-lg" fill="currentColor" />
                </motion.div>
              </motion.div>

              {/* App name */}
              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mt-6 text-3xl font-bold tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                SevaSetu
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-1.5 text-sm text-muted-foreground font-medium"
              >
                Rural Health Navigator
              </motion.p>
            </motion.div>
          </div>

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 200 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mt-12 h-1.5 rounded-full bg-muted overflow-hidden"
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-primary"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.6 }}
            className="mt-3 text-xs text-muted-foreground font-medium tracking-wide"
          >
            {progress < 30 ? 'Initializing...' : progress < 60 ? 'Loading health modules...' : progress < 90 ? 'Almost ready...' : 'Welcome!'}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
