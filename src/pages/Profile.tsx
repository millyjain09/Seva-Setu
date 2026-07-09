import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Mail, Globe, Save, Loader2, LogOut, Shield, Bell, BellOff, Camera, Phone, MapPin, User as UserIcon, CalendarDays, Trash2, Clock, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import AvatarCropper from '@/components/profile/AvatarCropper';

const Profile = () => {
  const { user, role, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState<string>(i18n.language || 'en');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState('');
  const [stateName, setStateName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tipEnabled, setTipEnabled] = useState(false);
  const [tipTime, setTipTime] = useState('08:00');
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  const [hasLocation, setHasLocation] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const { isSupported, isSubscribed, permission, loading: pushLoading, subscribe, unsubscribe, unsupportedReason } = usePushNotifications();

  useEffect(() => {
    if (!user) {
      setFullName(user?.user_metadata?.full_name || '');
      setLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('full_name, language_preference, phone, date_of_birth, gender, village, district, state, avatar_url, tip_notify_enabled, tip_notify_time, timezone, last_lat, last_lon')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name || '');
          setPhone((data as any).phone || '');
          setDob((data as any).date_of_birth || '');
          setGender((data as any).gender || '');
          setVillage((data as any).village || '');
          setDistrict((data as any).district || '');
          setStateName((data as any).state || '');
          setAvatarUrl((data as any).avatar_url || '');
          setTipEnabled(Boolean((data as any).tip_notify_enabled));
          const tt = (data as any).tip_notify_time as string | null;
          if (tt) setTipTime(tt.slice(0, 5));
          if ((data as any).timezone) setTimezone((data as any).timezone);
          setHasLocation((data as any).last_lat != null && (data as any).last_lon != null);
          if (data.language_preference) {
            setLanguage(data.language_preference);
            if (SUPPORTED_LANGUAGES.some((l) => l.code === data.language_preference)) {
              i18n.changeLanguage(data.language_preference);
            }
          }
        }
        setLoading(false);
      });
  }, [user]);

  // Resolve a viewable URL for the stored avatar. Supports both legacy public
  // URLs and storage paths (e.g. "<user_id>/avatar-123.webp") in a private bucket.
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!avatarUrl) { setAvatarDisplayUrl(''); return; }
      if (/^https?:\/\//i.test(avatarUrl)) { setAvatarDisplayUrl(avatarUrl); return; }
      const { data, error } = await supabase.storage
        .from('avatars')
        .createSignedUrl(avatarUrl, 60 * 60);
      if (!cancelled) setAvatarDisplayUrl(error ? '' : (data?.signedUrl || ''));
    };
    resolve();
    return () => { cancelled = true; };
  }, [avatarUrl]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      id: user.id,
      email: user.email,
      full_name: fullName,
      language_preference: language,
      phone: phone || null,
      date_of_birth: dob || null,
      gender: gender || null,
      village: village || null,
      district: district || null,
      state: stateName || null,
      tip_notify_enabled: tipEnabled,
      tip_notify_time: tipTime,
      timezone,
    };
    const { data: saved, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('full_name, language_preference, phone, date_of_birth, gender, village, district, state')
      .maybeSingle();
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      if (saved) {
        setFullName(saved.full_name || '');
        setPhone((saved as any).phone || '');
        setDob((saved as any).date_of_birth || '');
        setGender((saved as any).gender || '');
        setVillage((saved as any).village || '');
        setDistrict((saved as any).district || '');
        setStateName((saved as any).state || '');
      }
      i18n.changeLanguage(language);
      toast({ title: '✅ ' + t('profile.saved'), description: t('profile.savedDesc') });
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset value so picking the same file again still fires onChange
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image file (JPG, PNG, WEBP).', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Maximum size is 10 MB.', variant: 'destructive' });
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  };

  const uploadCropped = async (blob: Blob) => {
    if (!user) return;
    setUploading(true);
    setUploadProgress(0);
    const path = `${user.id}/avatar-${Date.now()}.webp`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'image/webp',
      duplex: 'half',
      // @ts-ignore — onUploadProgress is supported at runtime by supabase-js
      onUploadProgress: (e: { loaded: number; total: number }) => {
        if (e.total && e.total > 0) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    } as any);
    if (upErr) {
      setUploading(false);
      setUploadProgress(0);
      sonnerToast.error('Upload failed', { description: upErr.message });
      return;
    }
    // Store the storage path (bucket is private); we sign it on read.
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id);
    setUploading(false);
    setUploadProgress(0);
    if (dbErr) {
      sonnerToast.error('Could not save', { description: dbErr.message });
      return;
    }
    setAvatarUrl(path);
    setCropOpen(false);
    setPendingFile(null);
    sonnerToast.success('Photo updated', { description: 'Your profile picture has been saved.' });
  };

  const handleAvatarRemove = async () => {
    if (!user || !avatarUrl) return;
    setUploading(true);
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
    setAvatarUrl('');
    setUploading(false);
    toast({ title: 'Photo removed' });
  };

  const handlePushToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast({ title: '🔕 Push notifications disabled', description: 'You won\'t receive push alerts anymore.' });
    } else {
      const result = await subscribe();
      if (result.ok) {
        toast({ title: '🔔 Push notifications enabled', description: 'You\'ll receive health reminders even when the app is closed.' });
      } else if (permission === 'denied') {
        toast({ title: 'Permission denied', description: 'Please enable notifications in your browser settings.', variant: 'destructive' });
      } else {
        toast({ title: 'Could not enable push', description: result.reason || 'Something went wrong. Please try again.', variant: 'destructive' });
      }
    }
  };

  const captureLocation = async () => {
    if (!user || !('geolocation' in navigator)) {
      sonnerToast.error('Location not available', { description: 'Your browser does not support geolocation.' });
      return;
    }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 5 * 60 * 1000 })
      );
      const { error } = await supabase.from('profiles').update({
        last_lat: pos.coords.latitude,
        last_lon: pos.coords.longitude,
      }).eq('id', user.id);
      if (error) throw error;
      setHasLocation(true);
      sonnerToast.success('Location saved', { description: 'Tips will now be tailored to your local weather.' });
    } catch (e) {
      sonnerToast.error('Could not get location', { description: e instanceof Error ? e.message : 'Permission denied.' });
    }
  };

  const sendTestTip = async () => {
    if (!user) return;
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-daily-tip', {
        body: { test_user_id: user.id },
      });
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      if (r?.status === 'sent') sonnerToast.success('Test tip sent', { description: r.detail });
      else sonnerToast.error('Could not send test tip', { description: r?.detail || 'No subscription found. Enable push notifications first.' });
    } catch (e) {
      sonnerToast.error('Test failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSendingTest(false);
    }
  };

  const initials = (fullName || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-2xl mx-auto space-y-5 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-foreground">{t('profile.title')}</h1>
        <p className="mt-1 text-xs sm:text-sm md:text-base text-muted-foreground">{t('profile.subtitle')}</p>
      </motion.div>

      <AvatarCropper
        open={cropOpen}
        file={pendingFile}
        busy={uploading}
        progress={uploadProgress}
        onCancel={() => { setCropOpen(false); setPendingFile(null); setUploadProgress(0); }}
        onConfirm={uploadCropped}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-secondary/5 to-transparent p-4 sm:p-6 md:p-8">
          {loading ? (
            <div className="flex items-center gap-3 sm:gap-4">
              <Skeleton className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-28 sm:w-36" />
                <Skeleton className="h-3 w-36 sm:w-48" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="relative shrink-0">
                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20 overflow-hidden ring-2 ring-background">
                  {avatarDisplayUrl ? (
                    <img src={avatarDisplayUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-bold text-primary-foreground">{initials}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label="Change profile picture"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:scale-105 transition disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-foreground text-lg sm:text-xl truncate">{fullName || 'User'}</p>
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span className="truncate">{user?.email || 'dev@local'}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {role !== 'USER' && (
                    <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold text-primary bg-primary/10 rounded-full px-2 sm:px-2.5 py-0.5 sm:py-1">
                      <Shield className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> {role}
                    </span>
                  )}
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={handleAvatarRemove}
                      disabled={uploading}
                      className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground hover:text-destructive transition disabled:opacity-60"
                    >
                      <Trash2 className="h-3 w-3" /> Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5">
          {loading ? (
            <div className="space-y-3 sm:space-y-4">
              <Skeleton className="h-10 sm:h-11 w-full" />
              <Skeleton className="h-10 sm:h-11 w-full" />
              <Skeleton className="h-10 sm:h-11 w-full" />
            </div>
          ) : (
            <>
              {/* Personal */}
              <div>
                <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-primary" /> Personal Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">{t('profile.fullName')}</label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t('profile.fullNamePh')} className="h-10 sm:h-11 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">
                      <Phone className="h-3 w-3 inline mr-1" /> Phone
                    </label>
                    <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9XXXXXXXXX" className="h-10 sm:h-11 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">
                      <CalendarDays className="h-3 w-3 inline mr-1" /> Date of Birth
                    </label>
                    <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="h-10 sm:h-11 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Gender</label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger className="h-10 sm:h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">
                      <Globe className="h-3 w-3 inline mr-1" /> {t('profile.preferredLang')}
                    </label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="h-10 sm:h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_LANGUAGES.map((l) => (
                          <SelectItem key={l.code} value={l.code}>
                            <span className="font-semibold mr-2">{l.code.toUpperCase()}</span>
                            {l.native}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="pt-2">
                <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Location
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Village / Town</label>
                    <Input value={village} onChange={(e) => setVillage(e.target.value)} placeholder="e.g. Rampur" className="h-10 sm:h-11 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">District</label>
                    <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Varanasi" className="h-10 sm:h-11 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">State</label>
                    <Input value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="e.g. Uttar Pradesh" className="h-10 sm:h-11 text-sm" />
                  </div>
                </div>
              </div>

              {/* Push Notification Toggle */}
              {isSupported ? (
                <div className="flex items-center justify-between rounded-xl border border-border p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${isSubscribed ? 'bg-primary/10' : 'bg-muted'}`}>
                      {isSubscribed ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-foreground">{t('profile.pushTitle')}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {permission === 'denied'
                          ? t('profile.pushBlocked')
                          : isSubscribed
                            ? t('profile.pushOn')
                            : t('profile.pushOff')}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isSubscribed}
                    onCheckedChange={handlePushToggle}
                    disabled={pushLoading || permission === 'denied'}
                  />
                </div>
              ) : (
                unsupportedReason && (
                  <div className="flex items-start gap-3 rounded-xl border border-dashed border-border p-3 sm:p-4 bg-muted/30">
                    <BellOff className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground">{t('profile.pushTitle')}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{unsupportedReason}</p>
                    </div>
                  </div>
                )
              )}

              {/* Daily Weather-Aware Health Tip Notification */}
              <div className="rounded-xl border border-border p-3 sm:p-4 space-y-3 bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tipEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Clock className={`h-4 w-4 ${tipEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground">Daily Health Tip</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        Personalised to your local weather. Requires push notifications.
                      </p>
                    </div>
                  </div>
                  <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} disabled={!isSubscribed} />
                </div>

                {tipEnabled && (
                  <div className="space-y-3 pl-12">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</label>
                        <Input type="time" value={tipTime} onChange={(e) => setTipTime(e.target.value)} className="h-9 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timezone</label>
                        <p className="text-xs sm:text-sm text-foreground mt-2 truncate" title={timezone}>{timezone}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={captureLocation} className="h-8 text-xs gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> {hasLocation ? 'Update location' : 'Use my location'}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={sendTestTip} disabled={sendingTest || !isSubscribed} className="h-8 text-xs gap-1.5">
                        {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test
                      </Button>
                      {!hasLocation && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground">No location yet — tips will be generic.</span>
                      )}
                    </div>
                    {!isSubscribed && (
                      <p className="text-[10px] sm:text-xs text-destructive">Enable push notifications above to receive scheduled tips.</p>
                    )}
                  </div>
                )}
              </div>

              <motion.div whileTap={{ scale: 0.98 }}>
                <Button onClick={handleSave} disabled={saving} className="w-full h-10 sm:h-11 text-sm btn-glitter">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {t('common.save')}
                </Button>
              </motion.div>
            </>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} whileTap={{ scale: 0.98 }}>
        <Button variant="outline" onClick={signOut}
          className="w-full h-10 sm:h-11 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
          <LogOut className="h-4 w-4 mr-2" /> {t('common.signOut')}
        </Button>
      </motion.div>
    </div>
  );
};

export default Profile;
