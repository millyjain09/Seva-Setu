import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Zap, Loader2, AlertTriangle, CheckCircle2, Clock, Shield, X, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { HealthScoreRing } from '@/components/ui/HealthScoreRing';
import { BiomarkerBadge } from '@/components/ui/BiomarkerBadge';
import { SkeletonList } from '@/components/ui/SkeletonCard';
import jsPDF from 'jspdf';

interface HealthRecord {
  id: string;
  file_url: string | null;
  ai_summary: string | null;
  risk_level: string | null;
  created_at: string | null;
  analysis?: AIAnalysis | null;
}

interface AIAnalysis {
  report_type: string;
  summary: string;
  key_parameters: string[];
  risk_level: string;
  recommendations: string;
}

const parseBiomarkers = (params: string[]): { name: string; value: string; status: 'normal' | 'warning' | 'critical' }[] => {
  return params.map((p) => {
    const lower = p.toLowerCase();
    const status = lower.includes('high') || lower.includes('elevated') || lower.includes('abnormal')
      ? 'critical'
      : lower.includes('borderline') || lower.includes('low')
        ? 'warning'
        : 'normal';
    return { name: p, value: status === 'normal' ? 'Within range' : 'Out of range', status };
  });
};

const getHealthScore = (risk: string, params: string[]): number => {
  const base = risk === 'High' ? 35 : risk === 'Medium' ? 60 : 82;
  const normalCount = params.filter(p => !p.toLowerCase().includes('high') && !p.toLowerCase().includes('elevated')).length;
  return Math.min(99, base + Math.round((normalCount / Math.max(params.length, 1)) * 15));
};

const HealthVault = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    if (user) {
      fetchRecords();
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          const metaName = (user.user_metadata as any)?.full_name as string | undefined;
          setUserName(data?.full_name || metaName || '');
        });
    }
  }, [user]);

  const fetchRecords = async () => {
    const { data } = await supabase.from('health_records').select('*').order('created_at', { ascending: false });
    setRecords((data as any) || []);
    setLoading(false);
  };

  const processFile = async (f: File) => {
    if (!f || !user) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) {
      toast({
        title: t('vault.errSession'),
        description: t('vault.errSessionDesc'),
        variant: 'destructive',
      });
      return;
    }
    // Client-side validation (server re-validates in analyze-report)
    const MAX_BYTES = 20 * 1024 * 1024; // 20MB
    const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png'];
    const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (f.size > MAX_BYTES) {
      toast({ title: t('vault.errLarge'), description: t('vault.errLargeDesc'), variant: 'destructive' });
      return;
    }
    if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(f.type)) {
      toast({ title: t('vault.errType'), description: t('vault.errTypeDesc'), variant: 'destructive' });
      return;
    }
    // Sanitize filename: strip path separators and unsafe chars, cap length
    const safeBase = f.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60) || 'report';
    const safeName = `${safeBase}.${ext}`;
    setFile(f);
    setUploading(true);
    setAnalysis(null);
    setViewingId(null);
    try {
      // Privacy: original report file is NOT stored. Only AI-generated summary is persisted.
      setUploading(false);
      setAnalyzing(true);
      const { data: aiResult, error: fnError } = await supabase.functions.invoke<AIAnalysis>('analyze-report', {
        body: { fileName: safeName, fileType: f.type },
      });
      if (fnError || !aiResult) throw new Error(fnError?.message || 'Analysis failed');
      setAnalysis(aiResult);
      await supabase.from('health_records').insert({
        user_id: user.id, file_url: null,
        ai_summary: `${aiResult.report_type}: ${aiResult.summary}`,
        risk_level: aiResult.risk_level,
        analysis: aiResult as any,
      } as any);
      await fetchRecords();
      toast({ title: `✅ ${t('vault.success')}`, description: t('vault.successDesc') });
    } catch (err: any) {
      toast({ title: t('vault.error'), description: err.message, variant: 'destructive' });
    } finally { setUploading(false); setAnalyzing(false); }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const riskBadge = (level: string | null) => {
    if (level === 'High') return { icon: AlertTriangle, class: 'bg-destructive/10 text-destructive border-destructive/20', label: t('vault.riskHigh') };
    if (level === 'Medium') return { icon: Clock, class: 'bg-accent/10 text-accent border-accent/20', label: t('vault.riskMedium') };
    return { icon: CheckCircle2, class: 'bg-primary/10 text-primary border-primary/20', label: t('vault.riskNormal') };
  };

  const openPastReport = async (r: HealthRecord) => {
    // Reconstruct analysis from stored JSON, or fall back to legacy ai_summary
    let parsed: AIAnalysis | null = (r.analysis as AIAnalysis) || null;
    if (!parsed && r.ai_summary) {
      const [type, ...rest] = r.ai_summary.split(':');
      parsed = {
        report_type: type?.trim() || 'Report',
        summary: rest.join(':').trim() || r.ai_summary,
        key_parameters: [],
        risk_level: r.risk_level || 'Low',
        recommendations: '',
      };
    }
    setAnalysis(parsed);
    setViewingId(r.id);
    setFile(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeViewing = () => {
    setAnalysis(null);
    setViewingId(null);
  };

  const downloadPdf = (a: AIAnalysis, createdAt?: string | null) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 56;
    const CONTENT_W = W - M * 2;
    let y = 0;

    // Brand palette
    const SAGE: [number, number, number] = [46, 125, 50];
    const SAGE_DARK: [number, number, number] = [27, 94, 32];
    const INK: [number, number, number] = [15, 23, 42];
    const MUTED: [number, number, number] = [100, 116, 139];
    const LINE: [number, number, number] = [226, 232, 240];
    const BG_SOFT: [number, number, number] = [248, 250, 252];

    const setText = (size: number, weight: 'normal' | 'bold' = 'normal', color: [number, number, number] = INK) => {
      doc.setFont('helvetica', weight);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };
    const ensureSpace = (needed: number) => {
      if (y + needed > H - 70) { doc.addPage(); y = M; }
    };
    const writeText = (txt: string, opts: { size?: number; weight?: 'normal' | 'bold'; color?: [number, number, number]; gap?: number; x?: number; maxWidth?: number } = {}) => {
      const { size = 10.5, weight = 'normal', color = INK, gap = 4, x = M, maxWidth = CONTENT_W } = opts;
      setText(size, weight, color);
      const lines = doc.splitTextToSize(txt, maxWidth);
      lines.forEach((l: string) => {
        ensureSpace(size * 1.4);
        doc.text(l, x, y + size);
        y += size * 1.4;
      });
      y += gap;
    };
    const sectionTitle = (txt: string) => {
      ensureSpace(32);
      y += 10;
      setText(8.5, 'bold', SAGE_DARK);
      doc.text(txt.toUpperCase(), M, y + 8);
      doc.setDrawColor(...SAGE);
      doc.setLineWidth(1.2);
      doc.line(M, y + 12, M + 22, y + 12);
      doc.setLineWidth(0.5);
      y += 24;
    };
    const divider = () => {
      ensureSpace(10);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.5);
      doc.line(M, y, W - M, y);
      y += 8;
    };

    // ===== Header band =====
    doc.setFillColor(...SAGE);
    doc.rect(0, 0, W, 86, 'F');
    // Logo mark
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, 24, 38, 38, 8, 8, 'F');
    setText(20, 'bold', SAGE_DARK);
    doc.text('S', M + 12, 52);
    // Brand name + tagline
    setText(18, 'bold', [255, 255, 255]);
    doc.text('SevaSetu', M + 50, 44);
    setText(9.5, 'normal', [220, 237, 222]);
    doc.text('AI-Powered Rural Health Navigator', M + 50, 60);
    // Document label (right side)
    setText(9, 'bold', [220, 237, 222]);
    doc.text('HEALTH REPORT SUMMARY', W - M, 44, { align: 'right' });
    setText(8.5, 'normal', [220, 237, 222]);
    const generated = new Date();
    doc.text(`Generated ${generated.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • ${generated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
      W - M, 60, { align: 'right' });

    y = 108;

    // ===== Patient info card =====
    const reportDate = createdAt ? new Date(createdAt) : new Date();
    const reportId = `RPT-${reportDate.getTime().toString(36).toUpperCase().slice(-8)}`;
    const patientId = user ? `PT-${user.id.replace(/-/g, '').slice(0, 8).toUpperCase()}` : '—';

    doc.setFillColor(...BG_SOFT);
    doc.setDrawColor(...LINE);
    doc.roundedRect(M, y, CONTENT_W, 78, 8, 8, 'FD');

    const colW = CONTENT_W / 2;
    const rows: [string, string][] = [
      ['Patient Name', userName || '—'],
      ['Patient ID', patientId],
      ['Report Date', reportDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })],
      ['Report Time', reportDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })],
      ['Report ID', reportId],
      ['Report Type', a.report_type || 'General'],
    ];
    rows.forEach((row, i) => {
      const col = i % 2;
      const rowIdx = Math.floor(i / 2);
      const cellX = M + 16 + col * colW;
      const cellY = y + 16 + rowIdx * 22;
      setText(7.5, 'bold', MUTED);
      doc.text(row[0].toUpperCase(), cellX, cellY);
      setText(10.5, 'bold', INK);
      doc.text(doc.splitTextToSize(row[1], colW - 24)[0], cellX, cellY + 12);
    });
    y += 96;

    // ===== Risk Assessment =====
    sectionTitle('Risk Assessment');
    const risk = (a.risk_level || 'Low');
    const riskColor: [number, number, number] = risk === 'High' ? [220, 38, 38] : risk === 'Medium' ? [217, 119, 6] : [22, 101, 52];
    const riskBg: [number, number, number] = risk === 'High' ? [254, 226, 226] : risk === 'Medium' ? [254, 243, 199] : [220, 252, 231];
    const riskLabel = risk === 'High' ? 'High Risk' : risk === 'Medium' ? 'Medium Risk' : 'Normal';
    ensureSpace(32);
    setText(10, 'bold', riskColor);
    const labelW = doc.getTextWidth(riskLabel);
    const badgeW = labelW + 32;
    doc.setFillColor(...riskBg);
    doc.roundedRect(M, y, badgeW, 24, 12, 12, 'F');
    doc.setFillColor(...riskColor);
    doc.circle(M + 12, y + 12, 3, 'F');
    setText(10, 'bold', riskColor);
    doc.text(riskLabel, M + 20, y + 16);
    y += 34;
    divider();

    // ===== Clinical Summary =====
    sectionTitle('Clinical Summary');
    writeText(a.summary || '—', { size: 10.5, color: INK, gap: 6 });

    // ===== Biomarkers =====
    if (a.key_parameters && a.key_parameters.length) {
      divider();
      sectionTitle('Key Biomarkers');
      a.key_parameters.forEach((p) => {
        ensureSpace(18);
        doc.setFillColor(...SAGE);
        doc.circle(M + 4, y + 6, 1.8, 'F');
        writeText(p, { size: 10.5, x: M + 14, maxWidth: CONTENT_W - 14, gap: 0 });
      });
      y += 6;
    }

    // ===== Recommendations =====
    if (a.recommendations) {
      divider();
      sectionTitle('Recommendations');
      ensureSpace(40);
      const startY = y;
      writeText(a.recommendations, { size: 10.5, x: M + 14, maxWidth: CONTENT_W - 20, gap: 4 });
      doc.setDrawColor(...SAGE);
      doc.setLineWidth(2);
      doc.line(M, startY, M, y - 2);
      doc.setLineWidth(0.5);
    }

    // ===== Footer (every page) =====
    const pages = (doc as any).getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...LINE);
      doc.line(M, H - 48, W - M, H - 48);
      setText(8, 'normal', MUTED);
      doc.text('This is an AI-assisted summary and is not a medical diagnosis. Consult a qualified healthcare professional.', M, H - 32);
      setText(8, 'bold', SAGE_DARK);
      doc.text('SevaSetu', M, H - 18);
      setText(8, 'normal', MUTED);
      doc.text(`Page ${i} of ${pages}  •  ${reportId}`, W - M, H - 18, { align: 'right' });
    }

    // ===== Filename: SevaSetu_Report_<Name>_<YYYY-MM-DD>_<HHMM>.pdf =====
    const slug = (userName || 'Patient').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 40) || 'Patient';
    const ymd = reportDate.toISOString().slice(0, 10);
    const hm = reportDate.toTimeString().slice(0, 5).replace(':', '');
    doc.save(`SevaSetu_Report_${slug}_${ymd}_${hm}.pdf`);
  };

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-5xl mx-auto space-y-5 sm:space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-foreground">{t('vault.title')}</h1>
        <p className="mt-1 text-xs sm:text-sm md:text-base text-muted-foreground">{t('vault.subtitle')}</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Upload Area */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="lg:col-span-2"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <label className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 sm:p-8 md:p-10 cursor-pointer transition-all duration-300 min-h-[180px] sm:min-h-[220px] ${
            dragOver ? 'border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10' : 'border-border bg-card hover:border-primary/40 hover:bg-primary/5'
          }`}>
            {uploading ? (
              <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 text-primary animate-spin" />
            ) : (
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/10 flex items-center justify-center mb-3 sm:mb-4"
              >
                <Upload className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              </motion.div>
            )}
            <p className="font-bold text-foreground text-sm sm:text-base">{uploading ? t('vault.uploading') : t('vault.upload')}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5">{t('vault.hint')}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 mt-1">{t('vault.maxSize')}</p>
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} disabled={uploading || analyzing} />
          </label>

          {analyzing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="mt-3 sm:mt-4 rounded-xl bg-primary/5 border border-primary/20 p-3 sm:p-4 flex items-center gap-3">
              <div className="relative">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-foreground">{t('vault.analyzing')}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t('vault.analyzingDesc')}</p>
              </div>
            </motion.div>
          )}

          {file && !uploading && !analyzing && !analysis && (
            <div className="mt-3 sm:mt-4 rounded-xl border border-border bg-card p-3 flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <span className="text-xs sm:text-sm text-foreground truncate flex-1">{file.name}</span>
            </div>
          )}
        </motion.div>

        {/* AI Analysis */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="lg:col-span-3 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-3.5 sm:p-5 border-b border-border/50 flex items-center justify-between gap-2">
            <h2 className="font-bold text-foreground text-sm sm:text-base flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent" />
              </div>
              <span className="truncate">{viewingId ? t('vault.viewing') : t('vault.aiResults')}</span>
            </h2>
            {viewingId && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={closeViewing} aria-label={t('vault.close')}
                  className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="p-3.5 sm:p-5">
            <AnimatePresence mode="wait">
              {analysis ? (
                <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-5">
                  <div className="flex justify-end">
                    <button
                      onClick={() => downloadPdf(analysis, records.find(r => r.id === viewingId)?.created_at)}
                      className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" /> {t('vault.download')}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                    <HealthScoreRing score={getHealthScore(analysis.risk_level, analysis.key_parameters)} />
                    <div className="flex-1 space-y-2 sm:space-y-3 text-center sm:text-left">
                      <div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">{t('vault.reportType')}</p>
                        <p className="text-base sm:text-lg font-bold text-foreground">{analysis.report_type}</p>
                      </div>
                      <div className={`inline-flex items-center gap-2 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold border ${riskBadge(analysis.risk_level).class}`}>
                        {(() => { const r = riskBadge(analysis.risk_level); return <><r.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {r.label}</>; })()}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-muted/50 p-3 sm:p-4">
                    <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1.5 sm:mb-2">{t('vault.summary')}</p>
                    <p className="text-xs sm:text-sm text-foreground leading-relaxed">{analysis.summary}</p>
                  </div>

                  {analysis.key_parameters && analysis.key_parameters.length > 0 && (
                    <div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-bold mb-2 sm:mb-3">{t('vault.biomarkers')}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {parseBiomarkers(analysis.key_parameters).map((b, i) => (
                          <BiomarkerBadge key={i} name={b.name} value={b.value} status={b.status} />
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.recommendations && (
                    <div className="rounded-xl bg-primary/5 border border-primary/15 p-3 sm:p-4">
                      <p className="text-[10px] sm:text-xs text-primary uppercase tracking-widest font-extrabold mb-1.5 sm:mb-2">💡 {t('vault.recommendations')}</p>
                      <p className="text-xs sm:text-sm text-foreground leading-relaxed">{analysis.recommendations}</p>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="empty" className="text-center py-8 sm:py-12 space-y-3">
                  <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                    <Shield className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground/25" />
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground font-medium">{t('vault.emptyTitle')}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground/60">{t('vault.emptyDesc')}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Past Records */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 sm:mb-4">
          {t('vault.pastReports')} {records.length > 0 && `(${records.length})`}
        </p>
        {loading ? (
          <SkeletonList count={3} />
        ) : records.length > 0 ? (
          <div className="space-y-2">
            {records.map((r) => {
              const risk = riskBadge(r.risk_level);
              const isActive = viewingId === r.id;
              return (
                <motion.button key={r.id} layout whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => openPastReport(r)}
                  className={`w-full text-left rounded-xl border bg-card p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:border-primary/30 hover:shadow-md transition-all duration-300 group cursor-pointer ${isActive ? 'border-primary ring-1 ring-primary/30' : 'border-border'}`}
                >
                  <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${risk.class} flex items-center justify-center shrink-0 border`}>
                    <risk.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{r.ai_summary?.split(':')[0] || 'Report'}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </p>
                  </div>
                  <span className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border shrink-0 ${risk.class}`}>{risk.label}</span>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 sm:py-10 rounded-2xl border border-dashed border-border">
            <FileText className="h-8 w-8 sm:h-10 sm:w-10 mx-auto text-muted-foreground/25 mb-3" />
            <p className="text-xs sm:text-sm text-muted-foreground">{t('vault.noReports')}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default HealthVault;
