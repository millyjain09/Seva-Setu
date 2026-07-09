import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Building2, Pill, Droplets, Activity, Calendar, Bell, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { Notification } from '@/hooks/useNotifications';

const ICON_MAP: Record<string, React.ElementType> = {
  Droplets, Building2, Activity, Pill, Heart, Calendar, Bell, AlertTriangle,
};

const CATEGORY_STYLE: Record<string, { iconClass: string; bgClass: string }> = {
  health: { iconClass: 'text-primary', bgClass: 'bg-primary/10' },
  scheme: { iconClass: 'text-accent', bgClass: 'bg-accent/10' },
  reminder: { iconClass: 'text-secondary', bgClass: 'bg-secondary/10' },
};

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}

export const NotificationPanel = ({
  open, onClose, notifications, loading, unreadCount,
  onMarkRead, onMarkAllRead, onDismiss,
}: NotificationPanelProps) => {
  const [filter, setFilter] = useState<'all' | 'health' | 'scheme' | 'reminder'>('all');

  const filtered = filter === 'all' ? notifications : notifications.filter((n) => n.category === filter);

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'health', label: 'Health' },
    { key: 'scheme', label: 'Schemes' },
    { key: 'reminder', label: 'Reminders' },
  ];

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-14 right-2 sm:right-4 z-50 w-[calc(100vw-1rem)] sm:w-96 max-h-[calc(100vh-5rem)] rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/10 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Notifications</h3>
                  {unreadCount > 0 && (
                    <p className="text-[10px] text-muted-foreground">{unreadCount} unread</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="text-[10px] sm:text-xs font-semibold text-primary hover:text-primary/80 px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-1.5 px-3.5 sm:px-4 py-2.5 border-b border-border/30">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
                    filter === f.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* List */}
            <ScrollArea className="max-h-[calc(100vh-14rem)]">
              <div className="p-2 sm:p-2.5 space-y-1">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3 p-3">
                      <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-2.5 w-full" />
                        <Skeleton className="h-2 w-16" />
                      </div>
                    </div>
                  ))
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filtered.length > 0 ? (
                      filtered.map((n, i) => {
                        const style = CATEGORY_STYLE[n.category] || CATEGORY_STYLE.reminder;
                        const Icon = ICON_MAP[n.icon_name] || Bell;
                        return (
                          <motion.div
                            key={n.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -60, scale: 0.95 }}
                            transition={{ delay: i * 0.03 }}
                            className={`group relative rounded-xl p-3 sm:p-3.5 flex gap-3 cursor-pointer transition-all duration-200 ${
                              !n.is_read ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-muted/50'
                            }`}
                            onClick={() => onMarkRead(n.id)}
                          >
                            {!n.is_read && (
                              <span className="absolute top-3 left-1.5 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_4px_1px] shadow-primary/40" />
                            )}
                            <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${style.bgClass} flex items-center justify-center shrink-0`}>
                              <Icon className={`h-4 w-4 ${style.iconClass}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-xs sm:text-sm font-semibold truncate ${!n.is_read ? 'text-foreground' : 'text-foreground/80'}`}>
                                  {n.title}
                                </p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                                  className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                {n.message}
                              </p>
                              <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 mt-1 font-medium">
                                {timeAgo(n.created_at)}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })
                    ) : (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10 space-y-2">
                        <Bell className="h-8 w-8 mx-auto text-muted-foreground/20" />
                        <p className="text-xs text-muted-foreground">
                          {notifications.length === 0 ? 'No notifications yet' : 'No notifications in this category'}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
