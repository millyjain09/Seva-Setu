import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Bell, Sun, Moon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationPanel } from './NotificationPanel';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export const TopHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead, dismiss } = useNotifications();
  const { t } = useTranslation();

  const titleMap: Record<string, string> = {
    '/': t('header.dashboard'),
    '/voice-hub': t('header.aiAssistant'),
    '/health-vault': t('nav.healthVault'),
    '/schemes': t('nav.schemes'),
    '/emergency': t('nav.emergency'),
    '/profile': t('nav.profile'),
    '/admin/dashboard': t('nav.adminPanel'),
    '/superadmin': t('nav.superAdmin'),
  };
  const title = titleMap[location.pathname] || t('common.appName');

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between h-14 px-3 sm:px-4 md:px-6">
          <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <motion.h2 key={title} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="ml-2 sm:ml-3 text-sm font-bold text-foreground truncate">
              {title}
            </motion.h2>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <LanguageSwitcher compact />
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted" onClick={toggleTheme}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted relative" onClick={() => setNotifOpen(true)}>
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Button>
            <motion.div
              whileTap={{ scale: 0.9 }}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold text-primary-foreground cursor-pointer shadow-md shadow-primary/15"
              onClick={() => navigate('/profile')}
            >
              {initials}
            </motion.div>
          </div>
        </div>
      </header>
      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        loading={loading}
        unreadCount={unreadCount}
        onMarkRead={markAsRead}
        onMarkAllRead={markAllAsRead}
        onDismiss={dismiss}
      />
    </>
  );
};
