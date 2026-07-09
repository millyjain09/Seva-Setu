import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight, ChevronLeft, CheckCircle2, Loader2, ExternalLink, XCircle, ArrowLeft, Building2, Sparkles, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SkeletonCard } from '@/components/ui/SkeletonCard';

interface Scheme {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  eligibility_criteria: any;
}

interface EligibilityResult {
  eligible_schemes: Array<{ title: string; eligible: boolean; confidence: string; reason: string }>;
  summary: string;
  next_steps: string;
}

type SchemeSourceMode = 'admin' | 'api' | 'both';

const SchemeNavigator = () => {
  const [search, setSearch] = useState('');
  const [step, setStep] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceMode, setSourceMode] = useState<SchemeSourceMode>('both');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('schemes_last_refreshed') : null;
    return stored ? new Date(stored) : null;
  });
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [state, setState] = useState('');
  const [income, setIncome] = useState('');
  const [familyMembers, setFamilyMembers] = useState('');
  const [rationCard, setRationCard] = useState('');

  const loadSchemes = async (mode: SchemeSourceMode = sourceMode) => {
    let query = supabase.from('govt_schemes').select('*').eq('is_active', true).order('title');
    if (mode === 'admin' || mode === 'api') query = query.eq('source', mode);
    const { data } = await query;
    setSchemes(data || []);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', 'scheme_source_mode')
        .maybeSingle();
      const v = (data as any)?.value;
      const mode: SchemeSourceMode = (v === 'admin' || v === 'api' || v === 'both') ? v : 'both';
      setSourceMode(mode);
      await loadSchemes(mode);
    })();
  }, []);

  const refreshSchemes = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('refresh-schemes');
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const count = (data as any)?.count ?? 0;
      await loadSchemes(sourceMode);
      const now = new Date();
      setLastRefreshed(now);
      localStorage.setItem('schemes_last_refreshed', now.toISOString());
      toast({ title: '✅ Schemes updated', description: `Synced ${count} government schemes.` });
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err.message || 'Could not fetch latest schemes.', variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = schemes.filter(
    (s) => s.title.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  const checkEligibility = async () => {
    setChecking(true); setStep(3);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Please sign in to check eligibility.');
      }
      if (schemes.length === 0) {
        throw new Error('No schemes available to match against. Try refreshing schemes.');
      }
      const { data, error } = await supabase.functions.invoke('check-eligibility', {
        body: {
          userDetails: { name, age, state, income, familyMembers, rationCard },
          schemes: schemes.map(s => ({
            title: s.title,
            description: s.description,
            eligibility_criteria: s.eligibility_criteria,
          })),
        },
      });
      if (error) throw new Error(error.message || 'Check failed');
      if ((data as any)?.error) throw new Error((data as any).error);
      const payload = data as EligibilityResult;
      // Sort eligible first, then by confidence
      const rank = (c: string) => (c === 'High' ? 0 : c === 'Medium' ? 1 : 2);
      payload.eligible_schemes = (payload.eligible_schemes || []).sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return rank(a.confidence) - rank(b.confidence);
      });
      setResult(payload);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' }); setStep(2);
    } finally { setChecking(false); }
  };

  if (step > 0) {
    return (
      <div className="p-3 sm:p-4 md:p-8 max-w-2xl mx-auto space-y-5 sm:space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => { setStep(0); setResult(null); }}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-3 sm:mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Schemes
          </button>
          <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-accent" /> AI Eligibility Checker
          </h1>
          <div className="flex gap-2 mt-4 sm:mt-5">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1 flex flex-col items-center gap-1 sm:gap-1.5">
                <div className={`h-1 sm:h-1.5 w-full rounded-full transition-all duration-500 ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
                <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${s <= step ? 'text-primary' : 'text-muted-foreground'}`}>
                  {s === 1 ? 'Personal' : s === 2 ? 'Economic' : 'Results'}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl border border-border bg-card p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5">
          {step === 1 && (
            <>
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Step 1 of 2</p>
                <h2 className="text-base sm:text-lg font-bold text-foreground">Personal Information</h2>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 sm:mb-1.5 block">Full Name</label>
                  <Input placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 sm:h-11 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 sm:mb-1.5 block">Age</label>
                    <Input placeholder="Age" type="number" value={age} onChange={(e) => setAge(e.target.value)} className="h-10 sm:h-11 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 sm:mb-1.5 block">State</label>
                    <Input placeholder="State / District" value={state} onChange={(e) => setState(e.target.value)} className="h-10 sm:h-11 text-sm" />
                  </div>
                </div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Step 2 of 2</p>
                <h2 className="text-base sm:text-lg font-bold text-foreground">Family & Economic Details</h2>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 sm:mb-1.5 block">Annual Family Income (₹)</label>
                  <Input placeholder="e.g. 150000" type="number" value={income} onChange={(e) => setIncome(e.target.value)} className="h-10 sm:h-11 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 sm:mb-1.5 block">Family Members</label>
                    <Input placeholder="Count" type="number" value={familyMembers} onChange={(e) => setFamilyMembers(e.target.value)} className="h-10 sm:h-11 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 sm:mb-1.5 block">Ration Card</label>
                    <Input placeholder="APL / BPL" value={rationCard} onChange={(e) => setRationCard(e.target.value)} className="h-10 sm:h-11 text-sm" />
                  </div>
                </div>
              </div>
            </>
          )}
          {step === 3 && checking && (
            <div className="text-center space-y-3 sm:space-y-4 py-8 sm:py-12">
              <div className="relative inline-block">
                <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 text-primary animate-spin" />
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
              </div>
              <p className="text-sm sm:text-base font-medium text-muted-foreground">AI is checking your eligibility...</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Matching against {schemes.length} schemes</p>
            </div>
          )}
          {step === 3 && result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-5">
              <div className="text-center space-y-2 sm:space-y-3 py-3 sm:py-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-foreground">{result.summary}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">{result.next_steps}</p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] sm:text-xs font-bold text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {result.eligible_schemes.filter(s => s.eligible).length} Eligible
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] sm:text-xs font-semibold text-muted-foreground">
                    {result.eligible_schemes.length} Checked
                  </span>
                </div>
              </div>
              <div className="space-y-2 sm:space-y-2.5">
                {result.eligible_schemes.map((s, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`rounded-xl p-3 sm:p-4 flex items-start gap-2.5 sm:gap-3 border transition-all ${
                      s.eligible ? 'bg-primary/5 border-primary/20 hover:shadow-md hover:shadow-primary/5' : 'bg-muted/50 border-border'
                    }`}
                  >
                    {s.eligible
                      ? <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0 mt-0.5" />
                      : <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-foreground">{s.title}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{s.reason}</p>
                      <span className={`text-[9px] sm:text-[10px] mt-1 sm:mt-1.5 inline-block font-bold ${s.confidence === 'High' ? 'text-primary' : 'text-muted-foreground'}`}>
                        Confidence: {s.confidence}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
          <div className="flex gap-2 sm:gap-3 pt-2 sm:pt-3">
            {step > 1 && step < 3 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 h-10 sm:h-11 text-sm">Previous</Button>
            )}
            {step === 1 && (
              <motion.div whileTap={{ scale: 0.95 }} className="flex-1">
                <Button className="w-full h-10 sm:h-11 text-sm" onClick={() => setStep(2)} disabled={!name || !age}>Next →</Button>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div whileTap={{ scale: 0.95 }} className="flex-1">
                <Button className="w-full h-10 sm:h-11 text-sm btn-glitter" onClick={checkEligibility} disabled={!income}>Check Eligibility ✨</Button>
              </motion.div>
            )}
            {step === 3 && result && (
              <Button className="flex-1 h-10 sm:h-11" onClick={() => { setStep(0); setResult(null); }}>Done</Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-5xl mx-auto space-y-5 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-foreground">Govt Health Schemes</h1>
        <p className="mt-1 text-xs sm:text-sm md:text-base text-muted-foreground">Find and check eligibility for government health programs</p>
        {lastRefreshed && (
          <p className="mt-1.5 text-[10px] sm:text-xs text-muted-foreground/70 flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            Last refreshed: {lastRefreshed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
        <span className="inline-flex items-center gap-1.5 mt-2 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[10px] sm:text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          {sourceMode === 'admin' ? 'Curated by admin' : sourceMode === 'api' ? 'Live from official sources' : 'All sources'}
        </span>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 sm:left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 sm:pl-10 h-10 sm:h-11 text-sm" placeholder="Search schemes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {sourceMode !== 'admin' && (
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              className="h-10 sm:h-11 text-sm font-semibold w-full sm:w-auto"
              onClick={refreshSchemes}
              disabled={refreshing}
              title="Fetch latest government schemes"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </motion.div>
        )}
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button className="btn-glitter h-10 sm:h-11 text-sm font-semibold w-full sm:w-auto" onClick={() => setStep(1)}>
            <Sparkles className="h-4 w-4 mr-1.5" /> Check Eligibility
          </Button>
        </motion.div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 sm:py-16 space-y-3">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Building2 className="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground/30" />
          </div>
          <p className="text-sm sm:text-base font-medium text-muted-foreground">No schemes found</p>
          <p className="text-xs sm:text-sm text-muted-foreground/60">Try a different search term</p>
        </div>
      ) : (
        <>
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {paginated.map((scheme, i) => (
            <motion.div key={scheme.id} layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.98 }}
              className="card-premium p-4 sm:p-5 space-y-2 sm:space-y-3 cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <span className="inline-block rounded-full bg-primary/10 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-primary">
                  {scheme.eligibility_criteria?.category || 'Health'}
                </span>
                {scheme.link && (
                  <a href={scheme.link} target="_blank" rel="noopener noreferrer"
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <h3 className="font-bold text-foreground text-xs sm:text-sm leading-snug">{scheme.title}</h3>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed line-clamp-3">{scheme.description}</p>
            </motion.div>
          ))}
        </motion.div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 sm:gap-3 pt-2 sm:pt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-9 sm:h-10 text-xs sm:text-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-8 h-8 sm:min-w-9 sm:h-9 px-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                    p === currentPage
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 sm:h-10 text-xs sm:text-sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
        <p className="text-center text-[10px] sm:text-xs text-muted-foreground/70">
          Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} schemes
        </p>
        </>
      )}
    </div>
  );
};

export default SchemeNavigator;
