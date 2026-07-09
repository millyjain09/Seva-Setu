import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Mic, FileText, Building2, Activity, ArrowRight, Phone, ChevronRight, TrendingUp, Shield, Upload, Cloud, Droplets, Thermometer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SkeletonCard, SkeletonList } from '@/components/ui/SkeletonCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

const healthTips = [
  { tip: 'Drink at least 8 glasses of water daily to stay hydrated.', emoji: '💧' },
  { tip: 'Walk for 30 minutes every day — it reduces heart disease risk by 35%.', emoji: '🚶' },
  { tip: 'Wash hands frequently with soap for 20 seconds to prevent infections.', emoji: '🧼' },
  { tip: 'Get 7-8 hours of sleep every night for better immunity.', emoji: '😴' },
  { tip: 'Eat seasonal fruits and vegetables for essential vitamins.', emoji: '🍎' },
  { tip: 'Avoid self-medication — always consult a qualified doctor.', emoji: '💊' },
  { tip: 'Keep your vaccination records up to date.', emoji: '💉' },
];

interface WeatherInfo {
  temperature: number;
  feels_like: number;
  humidity: number;
  wind: number;
  precipitation: number;
  condition: string;
}
interface SmartTip { emoji: string; tip: string; }

interface HealthRecord {
  id: string;
  ai_summary: string | null;
  risk_level: string | null;
  created_at: string | null;
}

interface Scheme {
  id: string;
  title: string;
  description: string | null;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

const Dashboard = () => {
  const { user, role } = useAuth();
  const { t } = useTranslation();
  const quickActions = [
    { icon: Mic, label: t('dash.action.ai'), desc: t('dash.action.aiDesc'), to: '/voice-hub', gradient: 'from-primary to-primary/70' },
    { icon: FileText, label: t('dash.action.upload'), desc: t('dash.action.uploadDesc'), to: '/health-vault', gradient: 'from-secondary to-secondary/70' },
    { icon: Building2, label: t('dash.action.schemes'), desc: t('dash.action.schemesDesc'), to: '/schemes', gradient: 'from-accent to-accent/70' },
    { icon: Phone, label: t('dash.action.sos'), desc: t('dash.action.sosDesc'), to: '/emergency', gradient: 'from-destructive to-destructive/80' },
  ];
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const [recentReports, setRecentReports] = useState<HealthRecord[]>([]);
  const [allReports, setAllReports] = useState<HealthRecord[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [reportCount, setReportCount] = useState(0);
  const [schemeCount, setSchemeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const fallbackTip = healthTips[new Date().getHours() % healthTips.length];
  const [smartTip, setSmartTip] = useState<SmartTip>(fallbackTip);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [tipUpdatedAt, setTipUpdatedAt] = useState<Date | null>(null);

  const getCoords = async (): Promise<{ lat: number; lon: number } | null> => {
    // Try browser geolocation first (fast, accurate)
    if ('geolocation' in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60 * 1000,
          });
        });
        return { lat: pos.coords.latitude, lon: pos.coords.longitude };
      } catch (e) {
        console.warn('Geolocation unavailable, falling back to IP lookup:', e);
      }
    }
    // Fallback: approximate location via IP (no permission needed)
    try {
      const r = await fetch('https://ipapi.co/json/');
      if (r.ok) {
        const j = await r.json();
        if (typeof j.latitude === 'number' && typeof j.longitude === 'number') {
          return { lat: j.latitude, lon: j.longitude };
        }
      }
    } catch (e) {
      console.warn('IP location fallback failed:', e);
    }
    return null;
  };

  const fetchSmartTip = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    setTipLoading(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        // Final fallback — rotate a static tip so the button still visibly works
        const next = healthTips[Math.floor(Math.random() * healthTips.length)];
        setSmartTip(next);
        setTipUpdatedAt(new Date());
        if (!silent) toast.info('Showing a general tip', {
          description: 'Enable location for weather-aware advice.',
        });
        return;
      }
      const { data, error } = await supabase.functions.invoke('weather-health-tip', {
        body: { lat: coords.lat, lon: coords.lon, lang: 'English' },
      });
      if (error) throw error;
      if (data?.tip) setSmartTip(data.tip);
      if (data?.weather) setWeather(data.weather);
      setTipUpdatedAt(new Date());
      if (!silent) toast.success('Health tip updated');
    } catch (e: any) {
      console.warn('Smart tip unavailable:', e);
      // Rotate a static tip so refresh always produces a visible change
      const next = healthTips[Math.floor(Math.random() * healthTips.length)];
      setSmartTip(next);
      setTipUpdatedAt(new Date());
      if (!silent) toast.error('Could not fetch weather tip', {
        description: 'Showing a general tip instead.',
      });
    } finally {
      setTipLoading(false);
    }
  };

  useEffect(() => {
    fetchSmartTip({ silent: true });
    const id = setInterval(() => fetchSmartTip({ silent: true }), 60 * 60 * 1000); // refresh hourly
    const onVis = () => {
      if (document.visibilityState === 'visible' && tipUpdatedAt && Date.now() - tipUpdatedAt.getTime() > 30 * 60 * 1000) {
        fetchSmartTip({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t('dash.greeting.morning');
    if (h < 17) return t('dash.greeting.afternoon');
    return t('dash.greeting.evening');
  };

  useEffect(() => {
    const loadReports = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('health_records')
        .select('id, ai_summary, risk_level, created_at')
        .order('created_at', { ascending: false });
      const list = data || [];
      setAllReports(list);
      setRecentReports(list.slice(0, 3));
      setReportCount(list.length);
    };

    const loadSchemes = async () => {
      // Respect the source mode set by Super Admin (admin | api | both)
      const { data: settingRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'scheme_source_mode')
        .maybeSingle();
      const mode = (settingRow?.value as string) || 'both';

      let query = supabase
        .from('govt_schemes')
        .select('id, title, description, source, is_active', { count: 'exact' })
        .eq('is_active', true);
      if (mode === 'admin') query = query.eq('source', 'admin');
      else if (mode === 'api') query = query.eq('source', 'api');

      const { data: schemeData, count } = await query
        .order('created_at', { ascending: false })
        .limit(3);
      setSchemes(schemeData || []);
      setSchemeCount(count ?? schemeData?.length ?? 0);
    };

    const loadAll = async () => {
      await Promise.all([loadReports(), loadSchemes()]);
      setLoading(false);
    };
    loadAll();

    // Realtime subscription for live updates on reports
    if (!user?.id) return;
    const channel = supabase
      .channel(`dash-health-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'health_records', filter: `user_id=eq.${user.id}` },
        () => { loadReports(); }
      )
      .subscribe();

    const onVis = () => { if (document.visibilityState === 'visible') loadReports(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user]);

  // Live weekly activity chart from real reports (fallback to BP demo if none)
  const weeklyData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return { day: days[d.getDay()], date: d.getTime(), reports: 0, flagged: 0 };
    });
    allReports.forEach((r) => {
      if (!r.created_at) return;
      const t = new Date(r.created_at).getTime();
      const slot = buckets.find((b) => t >= b.date && t < b.date + 86400000);
      if (slot) {
        slot.reports += 1;
        if (r.risk_level === 'High' || r.risk_level === 'Medium') slot.flagged += 1;
      }
    });
    return buckets;
  }, [allReports]);

  const hasLiveChart = allReports.length > 0;
  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-6 md:space-y-8 pb-6">
      {/* Hero Greeting */}
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-1">
        <motion.p variants={item} className="text-xs sm:text-sm font-medium text-muted-foreground">{greeting()}</motion.p>
        <motion.h1 variants={item} className="text-xl sm:text-2xl md:text-4xl font-extrabold text-foreground tracking-tight">
          {name} <span className="inline-block float">👋</span>
        </motion.h1>
        <motion.p variants={item} className="text-muted-foreground text-xs sm:text-sm md:text-base">
          {t('dash.subtitle')}
        </motion.p>
        {isAdmin && (
          <motion.div variants={item} className="pt-2 flex flex-wrap items-center gap-2">
            <Link to="/admin" className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary/15 transition-colors">
              <Shield className="h-3.5 w-3.5" /> Open Admin Panel <ArrowRight className="h-3 w-3" />
            </Link>
            {role === 'SUPERADMIN' && (
              <Link to="/superadmin" className="inline-flex items-center gap-2 rounded-full bg-accent/10 text-accent px-3 py-1.5 text-xs font-semibold hover:bg-accent/15 transition-colors">
                <Shield className="h-3.5 w-3.5" /> Open Super Admin <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-3 gap-2 sm:gap-3 auto-rows-fr items-stretch">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-3 sm:p-4 animate-pulse">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-muted mx-auto mb-2" />
                <div className="h-5 w-8 bg-muted rounded mx-auto mb-1" />
                <div className="h-3 w-14 sm:w-16 bg-muted rounded mx-auto" />
              </div>
            ))}
          </>
        ) : (
          [
            { label: t('dash.stats.reports'), value: reportCount.toString(), icon: FileText, color: 'text-primary', bg: 'bg-primary/10', to: '/health-vault' },
            { label: t('dash.stats.schemes'), value: schemeCount.toString(), icon: Building2, color: 'text-accent', bg: 'bg-accent/10', to: '/schemes' },
            { label: t('dash.stats.languages'), value: '11', icon: Mic, color: 'text-secondary', bg: 'bg-secondary/10', to: '/profile' },
          ].map((s) => (
            <motion.div key={s.label} variants={item} className="h-full">
              <Link to={s.to} className="h-full rounded-2xl border border-border bg-card p-3 sm:p-4 text-center flex flex-col items-center justify-center gap-1 sm:gap-1.5 hover:shadow-md hover:border-primary/20 transition-all duration-300">
                <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${s.color}`} />
                </div>
                <p className="text-lg sm:text-2xl font-extrabold text-foreground">{s.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</p>
              </Link>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Health Tip Banner (weather-aware) */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 p-3.5 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="text-2xl sm:text-3xl shrink-0">{smartTip.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5 sm:mb-1">
              <p className="text-[10px] sm:text-xs font-bold text-primary uppercase tracking-widest">{t('dash.tip.title')}</p>
              <button
                onClick={() => fetchSmartTip()}
                disabled={tipLoading}
                className="text-[10px] sm:text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 disabled:opacity-50"
                aria-label="Refresh tip"
              >
                <RefreshCw className={`h-3 w-3 ${tipLoading ? 'animate-spin' : ''}`} />
                {tipLoading ? 'Updating…' : 'Refresh'}
              </button>
            </div>
            <p className="text-xs sm:text-sm md:text-base text-foreground leading-relaxed">{smartTip.tip}</p>
            {weather && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Cloud className="h-3 w-3" />{weather.condition}</span>
                <span className="inline-flex items-center gap-1"><Thermometer className="h-3 w-3" />{Math.round(weather.temperature)}°C</span>
                <span className="inline-flex items-center gap-1"><Droplets className="h-3 w-3" />{weather.humidity}%</span>
                {tipUpdatedAt && <span>· updated {tipUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Quick Actions Grid */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.p variants={item} className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 sm:mb-4">{t('dash.quickActions')}</motion.p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 auto-rows-fr items-stretch">
          {quickActions.map((action) => (
            <motion.div key={action.to} variants={item} whileTap={{ scale: 0.95 }} className="h-full">
              <Link to={action.to} className="block group h-full">
                <div className={`bg-gradient-to-br ${action.gradient} text-primary-foreground rounded-2xl p-4 sm:p-5 md:p-6 btn-glitter lift-glow cursor-pointer relative overflow-hidden h-full min-h-[150px] sm:min-h-[170px] flex flex-col`}>
                  <div className="relative z-10 flex-1 flex flex-col">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-primary-foreground/15 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <action.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <p className="font-bold text-sm sm:text-base leading-tight">{action.label}</p>
                    <p className="text-[10px] sm:text-xs opacity-80 mt-1 leading-snug flex-1">{action.desc}</p>
                  </div>
                  <div className="absolute -bottom-6 -right-6 h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-primary-foreground/5" />
                  <div className="absolute -top-4 -right-4 h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-primary-foreground/5" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Health Summary Chart + Recent Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 items-stretch">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="lg:col-span-3 rounded-2xl border border-border bg-card p-3.5 sm:p-5 space-y-3 sm:space-y-4 h-full flex flex-col">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-secondary/10 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-secondary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-sm sm:text-base">{t('dash.summary')}</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {hasLiveChart ? 'Reports activity – last 7 days' : t('dash.bpTrend')}
              </p>
            </div>
          </div>
          {hasLiveChart ? (
          <div className="h-40 sm:h-48 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="systolicGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="diastolicGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" axisLine={false} tickLine={false} domain={[0, 'auto']} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Area type="monotone" dataKey="reports" stroke="hsl(var(--primary))" fill="url(#systolicGradient)" strokeWidth={2.5} dot={{ fill: 'hsl(var(--primary))', r: 3 }} />
                <Area type="monotone" dataKey="flagged" stroke="hsl(var(--secondary))" fill="url(#diastolicGradient)" strokeWidth={2.5} dot={{ fill: 'hsl(var(--secondary))', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">No activity yet — upload a report to see your weekly trend.</p>
              <Link to="/health-vault">
                <Button size="sm" className="h-8 text-xs gap-1.5"><Upload className="h-3.5 w-3.5" /> Upload report</Button>
              </Link>
            </div>
          )}
          <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground">
            {hasLiveChart && (
              <>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Reports</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-secondary" /> Needs review</span>
              </>
            )}
          </div>
        </motion.div>

        {/* Recent Reports */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="lg:col-span-2 rounded-2xl border border-border bg-card p-3.5 sm:p-5 space-y-3 h-full flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground text-sm sm:text-base flex items-center gap-2">
              <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
              </div>
              {t('dash.recentReports')}
            </h2>
            <Link to="/health-vault">
              <Button variant="ghost" size="sm" className="text-[10px] sm:text-xs h-7 sm:h-8 hover:text-primary">{t('common.viewAll')}</Button>
            </Link>
          </div>
          {loading ? (
            <SkeletonList count={3} />
          ) : recentReports.length > 0 ? (
            <div className="space-y-2">
              {recentReports.map((r) => (
                <Link to="/health-vault" key={r.id} className="flex items-center justify-between rounded-xl bg-muted/50 p-2.5 sm:p-3 hover:bg-muted transition-colors cursor-pointer group">
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-medium text-foreground group-hover:text-primary transition-colors block truncate">
                      {r.ai_summary?.split(':')[0] || 'Report'}
                    </span>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                    </p>
                  </div>
                  <span className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shrink-0 ml-2 ${
                    r.risk_level === 'High' ? 'bg-destructive/10 text-destructive' :
                    r.risk_level === 'Medium' ? 'bg-accent/10 text-accent' :
                    'bg-primary/10 text-primary'
                  }`}>{r.risk_level || 'Low'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 sm:py-10 space-y-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/40" />
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">{t('dash.noReports')}</p>
              <Link to="/health-vault">
                <Button size="sm" className="h-8 text-xs gap-1.5"><Upload className="h-3.5 w-3.5" /> {t('dash.uploadFirst')}</Button>
              </Link>
            </div>
          )}
        </motion.div>
      </div>

      {/* Govt Schemes Section */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl border border-border bg-card p-3.5 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-foreground text-sm sm:text-base flex items-center gap-2">
            <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent" />
            </div>
            {t('dash.govtSchemes')}
          </h2>
          <Link to="/schemes">
            <Button variant="ghost" size="sm" className="text-[10px] sm:text-xs h-7 sm:h-8 hover:text-accent">{t('common.viewAll')}</Button>
          </Link>
        </div>
        {loading ? (
          <SkeletonList count={3} />
        ) : schemes.length > 0 ? (
          <div className="space-y-2">
            {schemes.map((s) => (
              <Link key={s.id} to="/schemes"
                className="flex items-center gap-2.5 sm:gap-3 rounded-xl bg-muted/50 p-3 sm:p-3.5 hover:bg-muted transition-colors cursor-pointer group">
                <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-accent shadow-[0_0_6px_1px] shadow-accent/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs sm:text-sm font-medium text-foreground group-hover:text-accent transition-colors block truncate">{s.title}</span>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 sm:py-8 space-y-2">
            <Building2 className="h-7 w-7 sm:h-8 sm:w-8 mx-auto text-muted-foreground/30" />
            <p className="text-xs sm:text-sm text-muted-foreground">{t('dash.loadingSchemes')}</p>
          </div>
        )}
      </motion.div>

      {/* Emergency Strip */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} whileTap={{ scale: 0.98 }}>
        <Link to="/emergency" className="flex items-center gap-3 sm:gap-4 rounded-2xl border-2 border-destructive/20 bg-destructive/5 p-3 sm:p-4 hover:bg-destructive/10 transition-all duration-300 group">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0 relative">
            <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-destructive animate-ping" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-base font-bold text-foreground">{t('dash.emergencyCta')}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">{t('dash.emergencyDesc')}</p>
          </div>
          <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-destructive group-hover:translate-x-1 transition-transform shrink-0" />
        </Link>
      </motion.div>
    </div>
  );
};

export default Dashboard;
