import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Users, Brain, TrendingUp, Shield, Bell, Loader2, Download, Search, CalendarIcon, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PushNotificationPanel } from '@/components/admin/PushNotificationPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Stat = { label: string; value: string; icon: typeof Users; color: string };
type ChartPoint = { month: string; users: number; reports: number };
type LogRow = {
  recordId: string;
  userId: string;
  user: string;
  email: string;
  action: string;
  createdAt: string;
  status: string;
  riskLevel: string;
  summary: string;
  patientDisplayId: string;
  reportDisplayId: string;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stat[]>([]);
  const [engagementData, setEngagementData] = useState<ChartPoint[]>([]);
  const [allLogs, setAllLogs] = useState<LogRow[]>([]);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();

  const loadData = async () => {
    const [profilesRes, recordsRes, schemesRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, created_at'),
      supabase.from('health_records').select('id, user_id, risk_level, ai_summary, created_at').order('created_at', { ascending: false }),
      supabase.from('govt_schemes').select('id', { count: 'exact', head: true }),
    ]);

    const profiles = profilesRes.data ?? [];
    const records = recordsRes.data ?? [];
    const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

    const aiQueries = records.filter(r => r.ai_summary).length;

    setStats([
      { label: 'Total Users', value: profiles.length.toLocaleString(), icon: Users, color: 'text-primary' },
      { label: 'AI Queries', value: aiQueries.toLocaleString(), icon: Brain, color: 'text-secondary' },
      { label: 'Reports Decoded', value: records.length.toLocaleString(), icon: TrendingUp, color: 'text-accent' },
      { label: 'Active Schemes', value: String(schemesRes.count ?? 0), icon: Shield, color: 'text-primary' },
    ]);

    // Build last-6-month engagement series
    const series: ChartPoint[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const users = profiles.filter(p => {
        const t = new Date(p.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      const reports = records.filter(r => {
        const t = new Date(r.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      series.push({ month: MONTHS[d.getMonth()], users, reports });
    }
    setEngagementData(series);

    setAllLogs(records.map(r => {
      const p: any = profileMap.get(r.user_id as string);
      const uid = String(r.user_id ?? '');
      const rid = String(r.id ?? '');
      const reportTs = new Date(r.created_at as string).getTime();
      return {
        recordId: rid,
        userId: uid,
        user: p?.full_name || `user_${uid.slice(0, 8)}`,
        email: p?.email ?? '',
        action: r.ai_summary ? 'Report decoded' : 'Report uploaded',
        createdAt: r.created_at as string,
        status: r.risk_level === 'High' ? 'Flagged' : r.risk_level === 'Medium' ? 'Pending Review' : 'Accurate',
        riskLevel: (r.risk_level as string) || 'Low',
        summary: (r.ai_summary as string) ?? '',
        patientDisplayId: uid ? `PT-${uid.replace(/-/g, '').slice(0, 8).toUpperCase()}` : '—',
        reportDisplayId: `RPT-${reportTs.toString(36).toUpperCase().slice(-8)}`,
      };
    }));

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'health_records' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate.setHours(0,0,0,0)).getTime() : null;
    const toTs = toDate ? new Date(new Date(toDate).setHours(23,59,59,999)).getTime() : null;
    return allLogs.filter(l => {
      const t = new Date(l.createdAt).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
      if (!q) return true;
      return (
        l.user.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q)
      );
    });
  }, [allLogs, search, fromDate, toDate]);

  const exportCsv = () => {
    const headers = ['User Name', 'Patient ID', 'Report ID', 'Created At (ISO)', 'Risk Level', 'AI Summary'];
    const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const rows = filteredLogs.map(l =>
      [l.user, l.patientDisplayId, l.reportDisplayId, l.createdAt, l.riskLevel, l.summary].map(escape).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-records-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SevaSetu — Health Records Export', 40, 40);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(110);
    doc.text(`Generated: ${format(new Date(), 'PPpp')}`, 40, 58);
    doc.text(`Records: ${filteredLogs.length}`, pageWidth - 40, 58, { align: 'right' });

    autoTable(doc, {
      startY: 78,
      head: [['User Name', 'Patient ID', 'Report ID', 'Created At', 'Risk', 'AI Summary']],
      body: filteredLogs.map(l => [
        l.user,
        l.patientDisplayId,
        l.reportDisplayId,
        format(new Date(l.createdAt), 'yyyy-MM-dd HH:mm'),
        l.riskLevel,
        (l.summary || '—').replace(/\s+/g, ' ').slice(0, 400),
      ]),
      styles: { fontSize: 8, cellPadding: 5, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [46, 125, 50], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 245] },
      columnStyles: {
        0: { cellWidth: 110 },
        1: { cellWidth: 80 },
        2: { cellWidth: 80 },
        3: { cellWidth: 95 },
        4: { cellWidth: 50 },
        5: { cellWidth: 'auto' },
      },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        const current = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `SevaSetu • Confidential • Page ${current} of ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 20,
          { align: 'center' }
        );
      },
    });

    doc.save(`SevaSetu_HealthRecords_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const clearFilters = () => { setSearch(''); setFromDate(undefined); setToDate(undefined); };
  const hasFilters = !!(search || fromDate || toDate);

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Platform analytics and management</p>
        </motion.div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 rounded-xl flex w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="overview" className="rounded-lg gap-1.5 flex-1 sm:flex-none data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <TrendingUp className="h-3.5 w-3.5" /> <span className="truncate">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="rounded-lg gap-1.5 flex-1 sm:flex-none data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Bell className="h-3.5 w-3.5" /> <span className="truncate">Notifications</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {stats.map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-2"
                >
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  <p className="text-xl sm:text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>

            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading live data…
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="rounded-2xl border border-border bg-card p-3 sm:p-5 min-w-0"
              >
                <h2 className="font-semibold text-foreground mb-4 text-sm sm:text-base">New Users (Last 6 Months)</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={engagementData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-muted-foreground" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis className="text-muted-foreground" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="rounded-2xl border border-border bg-card p-3 sm:p-5 min-w-0"
              >
                <h2 className="font-semibold text-foreground mb-4 text-sm sm:text-base">Reports Decoded (Last 6 Months)</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={engagementData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-muted-foreground" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis className="text-muted-foreground" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey="reports" stroke="hsl(var(--secondary))" strokeWidth={2} dot={{ fill: 'hsl(var(--secondary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </div>

            {/* Audit Log */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="rounded-2xl border border-border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-foreground text-sm sm:text-base">Audit Log – AI Summaries</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {filteredLogs.length} of {allLogs.length} records
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button size="sm" variant="outline" onClick={exportCsv} disabled={filteredLogs.length === 0} className="gap-1.5 w-full sm:w-auto">
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportPdf} disabled={filteredLogs.length === 0} className="gap-1.5 w-full sm:w-auto">
                    <Download className="h-3.5 w-3.5" /> Export PDF
                  </Button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search user, action, status, summary…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('h-9 gap-1.5 justify-start font-normal', !fromDate && 'text-muted-foreground')}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {fromDate ? format(fromDate, 'MMM d, yyyy') : 'From date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('h-9 gap-1.5 justify-start font-normal', !toDate && 'text-muted-foreground')}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {toDate ? format(toDate, 'MMM d, yyyy') : 'To date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5">
                    <X className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>

              {filteredLogs.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground py-4">No records match the current filters.</p>
              )}
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 pr-4 pl-4 sm:pl-0 text-xs font-semibold">User</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold hidden sm:table-cell">Email</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold">Action</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold">Time</th>
                      <th className="text-left py-2 text-xs font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-3 pr-4 pl-4 sm:pl-0 text-foreground text-xs">{log.user}</td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs hidden sm:table-cell">{log.email || '—'}</td>
                        <td className="py-3 pr-4 text-foreground text-xs sm:text-sm">{log.action}</td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs" title={log.createdAt}>{formatRelative(log.createdAt)}</td>
                        <td className="py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-medium ${
                            log.status === 'Accurate' ? 'bg-primary/20 text-primary' :
                            log.status === 'Flagged' ? 'bg-destructive/20 text-destructive' :
                            'bg-accent/20 text-accent'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="notifications">
            <PushNotificationPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
