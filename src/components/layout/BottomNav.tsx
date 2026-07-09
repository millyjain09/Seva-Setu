import { Home, Mic, ScanLine, Building2, Phone } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export const BottomNav = () => {
  const { t } = useTranslation();
  const items = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/voice-hub', icon: Mic, label: t('nav.voiceAsk') },
    { to: '/health-vault', icon: ScanLine, label: t('nav.healthVault'), center: true },
    { to: '/schemes', icon: Building2, label: t('nav.schemes') },
    { to: '/emergency', icon: Phone, label: t('dash.action.sos') },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-2 mb-2 rounded-2xl bg-card/80 backdrop-blur-2xl border border-border/50 shadow-lg shadow-foreground/5">
        <div className="flex items-end justify-around px-2 pt-2 pb-2 relative">
          {items.map((item) => {
            if (item.center) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  title={item.label}
                  className="relative -mt-8 flex h-14 w-14 items-center justify-center"
                >
                  {({ isActive }) => (
                    <motion.div
                      whileTap={{ scale: 0.92 }}
                      className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-full border-4 border-background shadow-lg transition-colors',
                        isActive
                          ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-primary/40'
                          : 'bg-gradient-to-br from-primary/90 to-primary/70 text-primary-foreground shadow-foreground/10'
                      )}
                    >
                      <item.icon className="h-6 w-6" strokeWidth={2.25} />
                    </motion.div>
                  )}
                </NavLink>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 transition-all duration-300 relative',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground active:scale-95'
                  )
                }
              >
                {({ isActive }) => (
                  <div className="relative flex items-center justify-center">
                    <item.icon className="h-[22px] w-[22px]" />
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavIndicator"
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary shadow-[0_0_6px_2px] shadow-primary/40"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                  </div>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
