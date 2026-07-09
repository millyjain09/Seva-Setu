import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// VAPID public key (publishable, safe for client-side)
const VAPID_PUBLIC_KEY = 'BMxyds3YvBbCzLK5HcybN_QbueOvHVVr7BA6SDfnSfx1wBEd9fSjiQRSHR_tmRqdYE3rkKM_kBLdnGgTsiA1SWo';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    if (!hasApis) {
      setUnsupportedReason('Your browser does not support push notifications.');
      setIsSupported(false);
      return;
    }
    if (isInIframe) {
      setUnsupportedReason('Open the app in a new tab to enable push notifications (blocked inside preview iframe).');
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);
    checkExistingSubscription();
  }, [isInIframe]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch {
      setIsSubscribed(false);
    }
  };

  const subscribe = useCallback(async () => {
    if (!user?.id || !VAPID_PUBLIC_KEY || loading) {
      return { ok: false as const, reason: !user?.id ? 'Please sign in first.' : 'Push not ready.' };
    }
    setLoading(true);

    try {
      // Register the push service worker
      const registration = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        return { ok: false as const, reason: perm === 'denied'
          ? 'Notifications are blocked. Enable them in your browser site settings.'
          : 'Permission was not granted.' };
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      });

      const subJson = subscription.toJSON();

      // Save to Supabase
      const { error: dbErr } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subJson.endpoint!,
        p256dh: subJson.keys!.p256dh!,
        auth_key: subJson.keys!.auth!,
      }, { onConflict: 'user_id,endpoint' });
      if (dbErr) {
        setLoading(false);
        return { ok: false as const, reason: `Could not save subscription: ${dbErr.message}` };
      }

      setIsSubscribed(true);
      setLoading(false);
      return { ok: true as const };
    } catch (err) {
      console.error('Push subscription failed:', err);
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false as const, reason: message };
    }
  }, [user?.id, loading]);

  const unsubscribe = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
    setLoading(false);
  }, [user?.id]);

  return { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe, unsupportedReason };
};
