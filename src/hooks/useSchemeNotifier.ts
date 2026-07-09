import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Building2 } from 'lucide-react';
import { createElement } from 'react';

/**
 * Subscribes to realtime inserts on `govt_schemes` and shows a toast pop-up
 * when a new scheme is added so users are notified instantly.
 */
export const useSchemeNotifier = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const seenInitial = useRef(false);

  useEffect(() => {
    // Avoid double-firing in dev StrictMode
    if (seenInitial.current) return;
    seenInitial.current = true;

    const channel = supabase
      .channel('govt_schemes-toast')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'govt_schemes' },
        (payload) => {
          const title = (payload.new as { title?: string })?.title ?? '';
          toast.success(t('notif.newScheme.title'), {
            description: title,
            icon: createElement(Building2, { className: 'h-4 w-4 text-accent' }),
            action: {
              label: t('notif.checkNow'),
              onClick: () => navigate('/schemes'),
            },
            duration: 8000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate, t]);
};