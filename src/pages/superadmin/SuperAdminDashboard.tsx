import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, ShieldCheck, BarChart3, Building2, Settings, ClipboardList,
  Search, MoreVertical, ArrowLeft, UserCog, Ban, Trash2,
  ToggleLeft, ToggleRight, Crown, Loader2, Plus, Pencil, Database, Cloud, Layers, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ─── Types ───
interface UserWithRole {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  created_at: string | null;
  role: string;
  role_id: string;
}

interface SchemeRow {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  eligibility_criteria: any;
  source: string;
  is_active: boolean;
  created_at: string | null;
}

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  target_email: string | null;
  metadata: any;
  created_at: string;
}

type SchemeSourceMode = 'admin' | 'api' | 'both';

const emptySchemeForm = {
  id: '' as string | null,
  title: '',
  description: '',
  link: '',
  category: 'Health',
  age: '',
  income: '',
  state: '',
  ration_card: '',
  family_size: '',
  is_active: true,
};

// ─── Relative time helper ───
const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

const auditDot = (type: string) => {
  if (type === 'user_role') return 'bg-accent';
  if (type === 'user_status') return 'bg-destructive';
  if (type === 'health_record') return 'bg-secondary';
  if (type === 'scheme') return 'bg-primary';
  return 'bg-muted-foreground';
};
// Only features actually exposed on normal user profiles / nav
const appFeatures = [
  { id: 'home',             name: 'Home Dashboard',    description: 'Personal health snapshot on the home screen', enabled: true },
  { id: 'voice_hub',        name: 'Voice Hub',         description: 'AI voice assistant for health queries',       enabled: true },
  { id: 'health_vault',     name: 'Health Vault',      description: 'Upload reports and get AI summaries',         enabled: true },
  { id: 'scheme_navigator', name: 'Scheme Navigator',  description: 'Government health scheme finder',             enabled: true },
  { id: 'emergency_sos',    name: 'Emergency SOS',     description: 'One-tap emergency dialer (112)',              enabled: true },
  { id: 'profile',          name: 'Profile & Language',description: 'Editable profile and language preference',    enabled: true },
  { id: 'push_notifications', name: 'Push Notifications', description: 'Browser push reminders & scheme alerts',   enabled: true },
];

const roleBadge = (role: string) => {
  const config: Record<string, string> = {
    superadmin: 'bg-destructive/15 text-destructive border-destructive/30',
    admin: 'bg-accent/15 text-accent border-accent/30',
    user: 'bg-primary/15 text-primary border-primary/30',
  };
  return config[role] || config.user;
};
const statusBadge = (status: string) =>
  status === 'active'
    ? 'bg-primary/15 text-primary border-primary/30'
    : 'bg-destructive/15 text-destructive border-destructive/30';

const SuperAdminDashboard = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');
  const [features, setFeatures] = useState(appFeatures);

  // ─── Real user data ───
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // ─── Live analytics ───
  const [stats, setStats] = useState({ users: 0, records: 0, notifications: 0, schemes: 0 });
  const [growth, setGrowth] = useState<{ month: string; users: number }[]>([]);
  const [featureUsage, setFeatureUsage] = useState<{ feature: string; count: number }[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // ─── Dialogs ───
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; user: UserWithRole | null; newRole: string }>({ open: false, user: null, newRole: '' });
  const [banDialog, setBanDialog] = useState<{ open: boolean; user: UserWithRole | null }>({ open: false, user: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: UserWithRole | null }>({ open: false, user: null });
  const [actionLoading, setActionLoading] = useState(false);

  // ─── Schemes state ───
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [schemesLoading, setSchemesLoading] = useState(true);
  const [schemeSourceMode, setSchemeSourceMode] = useState<SchemeSourceMode>('both');
  const [schemeFilter, setSchemeFilter] = useState<'all' | 'admin' | 'api'>('all');
  const [schemeSearch, setSchemeSearch] = useState('');
  const [schemeDialog, setSchemeDialog] = useState<{ open: boolean; form: typeof emptySchemeForm }>({ open: false, form: { ...emptySchemeForm } });
  const [schemeDeleteDialog, setSchemeDeleteDialog] = useState<{ open: boolean; scheme: SchemeRow | null }>({ open: false, scheme: null });
  const [schemeSaving, setSchemeSaving] = useState(false);

  // ─── Audit log state ───
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditType, setAuditType] = useState<string>('all');

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    const { data, error } = await supabase
      .from('audit_logs' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) toast.error('Failed to load audit log: ' + error.message);
    else setAuditRows((data ?? []) as any);
    setAuditLoading(false);
  }, []);

  useEffect(() => { fetchAuditLogs(); }, [fetchAuditLogs]);

  useEffect(() => {
    const channel = supabase
      .channel('audit-logs-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        setAuditRows((prev) => [payload.new as AuditLogRow, ...prev].slice(0, 500));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredAudit = auditRows.filter((l) => {
    const q = auditSearch.trim().toLowerCase();
    const matchesType = auditType === 'all' || l.entity_type === auditType;
    const matchesSearch = !q || [l.action, l.actor_email, l.target_email, l.entity_id]
      .some((f) => (f ?? '').toString().toLowerCase().includes(q));
    return matchesType && matchesSearch;
  });

  const fetchSchemes = useCallback(async () => {
    setSchemesLoading(true);
    const { data, error } = await supabase
      .from('govt_schemes')
      .select('*')
      .order('title');
    if (error) toast.error('Failed to load schemes: ' + error.message);
    else setSchemes((data ?? []) as any);
    setSchemesLoading(false);
  }, []);

  const fetchSchemeMode = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings' as any)
      .select('value')
      .eq('key', 'scheme_source_mode')
      .maybeSingle();
    const v = (data as any)?.value;
    if (v === 'admin' || v === 'api' || v === 'both') setSchemeSourceMode(v);
  }, []);

  useEffect(() => { fetchSchemes(); fetchSchemeMode(); }, [fetchSchemes, fetchSchemeMode]);

  const updateSchemeMode = async (mode: SchemeSourceMode) => {
    setSchemeSourceMode(mode);
    const { error } = await supabase
      .from('app_settings' as any)
      .upsert({ key: 'scheme_source_mode', value: mode as any }, { onConflict: 'key' });
    if (error) toast.error('Failed to save: ' + error.message);
    else toast.success(`User schemes source set to: ${mode === 'both' ? 'All sources' : mode === 'admin' ? 'Admin-curated' : 'API-fetched'}`);
  };

  const openAddScheme = () => setSchemeDialog({ open: true, form: { ...emptySchemeForm, id: null } });
  const openEditScheme = (s: SchemeRow) => {
    const ec = s.eligibility_criteria || {};
    setSchemeDialog({
      open: true,
      form: {
        id: s.id,
        title: s.title,
        description: s.description ?? '',
        link: s.link ?? '',
        category: ec.category ?? 'Health',
        age: ec.age ?? '',
        income: ec.income ?? '',
        state: ec.state ?? '',
        ration_card: ec.ration_card ?? '',
        family_size: ec.family_size ?? '',
        is_active: s.is_active,
      },
    });
  };

  const saveScheme = async () => {
    const f = schemeDialog.form;
    if (!f.title.trim()) { toast.error('Title is required'); return; }
    setSchemeSaving(true);
    const eligibility_criteria: Record<string, string> = {};
    if (f.category) eligibility_criteria.category = f.category;
    if (f.age) eligibility_criteria.age = f.age;
    if (f.income) eligibility_criteria.income = f.income;
    if (f.state) eligibility_criteria.state = f.state;
    if (f.ration_card) eligibility_criteria.ration_card = f.ration_card;
    if (f.family_size) eligibility_criteria.family_size = f.family_size;

    try {
      if (f.id) {
        const { error } = await supabase.from('govt_schemes').update({
          title: f.title.trim(),
          description: f.description || null,
          link: f.link || null,
          eligibility_criteria,
          is_active: f.is_active,
        } as any).eq('id', f.id);
        if (error) throw error;
        toast.success('Scheme updated');
      } else {
        const { error } = await supabase.from('govt_schemes').insert({
          title: f.title.trim(),
          description: f.description || null,
          link: f.link || null,
          eligibility_criteria,
          is_active: f.is_active,
          source: 'admin',
        } as any);
        if (error) throw error;
        toast.success('Scheme added');
      }
      setSchemeDialog({ open: false, form: { ...emptySchemeForm } });
      fetchSchemes();
    } catch (err: any) {
      toast.error('Failed to save scheme: ' + err.message);
    } finally {
      setSchemeSaving(false);
    }
  };

  const toggleSchemeActive = async (s: SchemeRow) => {
    const { error } = await supabase.from('govt_schemes').update({ is_active: !s.is_active } as any).eq('id', s.id);
    if (error) toast.error('Failed: ' + error.message);
    else fetchSchemes();
  };

  const deleteScheme = async () => {
    if (!schemeDeleteDialog.scheme) return;
    setSchemeSaving(true);
    const { error } = await supabase.from('govt_schemes').delete().eq('id', schemeDeleteDialog.scheme.id);
    setSchemeSaving(false);
    if (error) { toast.error('Delete failed: ' + error.message); return; }
    toast.success('Scheme deleted');
    setSchemeDeleteDialog({ open: false, scheme: null });
    fetchSchemes();
  };

  const filteredSchemes = schemes.filter(s => {
    const matchesSource = schemeFilter === 'all' || s.source === schemeFilter;
    const q = schemeSearch.toLowerCase();
    const matchesSearch = !q || s.title.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
    return matchesSource && matchesSearch;
  });

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, status, created_at');
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from('user_roles')
        .select('id, user_id, role');
      if (rErr) throw rErr;

      const roleMap = new Map(roles?.map(r => [r.user_id, { role: r.role ?? 'user', role_id: r.id }]));

      const merged: UserWithRole[] = (profiles ?? []).map(p => {
        const r = roleMap.get(p.id);
        return {
          id: p.id,
          full_name: p.full_name,
          email: (p as any).email ?? null,
          status: (p as any).status ?? 'active',
          created_at: p.created_at,
          role: r?.role ?? 'user',
          role_id: r?.role_id ?? '',
        };
      });
      setUsers(merged);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ─── Analytics fetch + realtime ───
  const fetchAnalytics = useCallback(async () => {
    try {
      const [usersRes, recordsRes, notifRes, schemesRes, profilesGrowth] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('health_records').select('id', { count: 'exact', head: true }),
        supabase.from('notifications').select('id', { count: 'exact', head: true }),
        supabase.from('govt_schemes').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('created_at').order('created_at', { ascending: true }),
      ]);

      setStats({
        users: usersRes.count ?? 0,
        records: recordsRes.count ?? 0,
        notifications: notifRes.count ?? 0,
        schemes: schemesRes.count ?? 0,
      });

      // Build user growth from last 6 months (cumulative)
      const months: { key: string; label: string }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: d.toLocaleString('en', { month: 'short' }),
        });
      }
      const counts = new Map(months.map(m => [m.key, 0]));
      (profilesGrowth.data ?? []).forEach((p: any) => {
        if (!p.created_at) return;
        const d = new Date(p.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      let running = 0;
      const baseline = (usersRes.count ?? 0) - Array.from(counts.values()).reduce((a, b) => a + b, 0);
      running = Math.max(0, baseline);
      setGrowth(months.map(m => {
        running += counts.get(m.key) ?? 0;
        return { month: m.label, users: running };
      }));

      setFeatureUsage([
        { feature: 'Vault Reports',   count: recordsRes.count ?? 0 },
        { feature: 'Schemes',         count: schemesRes.count ?? 0 },
        { feature: 'Notifications',   count: notifRes.count ?? 0 },
        { feature: 'Users',           count: usersRes.count ?? 0 },
      ]);
    } catch (err: any) {
      console.error('Analytics fetch failed', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    const channel = supabase
      .channel('superadmin-analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },       () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'health_records' }, () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },  () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'govt_schemes' },   () => { fetchAnalytics(); fetchSchemes(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' },     () => fetchUsers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAnalytics, fetchUsers, fetchSchemes]);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (u.full_name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesEmail =
      emailFilter === 'all' ||
      (emailFilter === 'with' && !!u.email) ||
      (emailFilter === 'without' && !u.email);
    return matchesSearch && matchesRole && matchesEmail;
  });

  // ─── Actions ───
  const handleRoleChange = async () => {
    if (!roleDialog.user) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: roleDialog.newRole })
        .eq('user_id', roleDialog.user.id);
      if (error) throw error;
      toast.success(`Role changed to ${roleDialog.newRole}`);
      setRoleDialog({ open: false, user: null, newRole: '' });
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to change role: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBanToggle = async () => {
    if (!banDialog.user) return;
    setActionLoading(true);
    const newStatus = banDialog.user.status === 'banned' ? 'active' : 'banned';
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus } as any)
        .eq('id', banDialog.user.id);
      if (error) throw error;
      toast.success(newStatus === 'banned' ? 'User banned' : 'User unbanned');
      setBanDialog({ open: false, user: null });
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to update status: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.user) return;
    setActionLoading(true);
    try {
      // Delete role first, then profile
      await supabase.from('user_roles').delete().eq('user_id', deleteDialog.user.id);
      const { error } = await supabase.from('profiles').delete().eq('id', deleteDialog.user.id);
      if (error) throw error;
      toast.success('User profile deleted');
      setDeleteDialog({ open: false, user: null });
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to delete user: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleFeature = (id: string) => {
    setFeatures((prev) => prev.map((f) => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-4 sm:py-6">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
            <h1 className="text-lg sm:text-xl font-bold text-foreground">Super Admin</h1>
          </div>
          <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1.5 text-[10px] sm:text-xs">
            <ShieldCheck className="h-3 w-3" />
            <span className="hidden sm:inline">SuperAdmin Access</span>
            <span className="sm:hidden">SA</span>
          </Badge>
        </div>

        <Tabs defaultValue="users" className="space-y-4 sm:space-y-6">
          <TabsList className="bg-muted/50 p-1 rounded-xl h-auto flex-wrap gap-0.5">
            <TabsTrigger value="users" className="rounded-lg gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-lg gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="schemes" className="rounded-lg gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Building2 className="h-3.5 w-3.5" /> Schemes
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-lg gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Settings className="h-3.5 w-3.5" /> Settings
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-lg gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ClipboardList className="h-3.5 w-3.5" /> Audit Log
            </TabsTrigger>
          </TabsList>

          {/* ======= USERS TAB ======= */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 rounded-xl"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-[160px] rounded-xl">
                  <SelectValue placeholder="Filter role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="superadmin">SuperAdmin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              <Select value={emailFilter} onValueChange={setEmailFilter}>
                <SelectTrigger className="w-full sm:w-[160px] rounded-xl">
                  <SelectValue placeholder="Filter email" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Emails</SelectItem>
                  <SelectItem value="with">With Email</SelectItem>
                  <SelectItem value="without">No Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loadingUsers ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>User</TableHead>
                      <TableHead className="hidden sm:table-cell">Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{user.full_name || 'Unnamed'}</p>
                            <p className="text-xs text-muted-foreground font-mono">{user.id.slice(0, 8)}…</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {user.email || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${roleBadge(user.role)} capitalize text-xs`}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${statusBadge(user.status)} capitalize text-xs`}>
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setRoleDialog({ open: true, user, newRole: user.role })}>
                                <UserCog className="h-3.5 w-3.5" /> Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setBanDialog({ open: true, user })}>
                                <Ban className="h-3.5 w-3.5" /> {user.status === 'banned' ? 'Unban' : 'Ban'} User
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeleteDialog({ open: true, user })}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
                {filteredUsers.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">No users found matching your criteria.</div>
                )}
              </motion.div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Showing {filteredUsers.length} of {users.length} users</span>
            </div>
          </TabsContent>

          {/* ======= ANALYTICS TAB ======= */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: 'Total Users',     value: String(stats.users) },
                { label: 'Health Records',  value: String(stats.records) },
                { label: 'Notifications',   value: String(stats.notifications) },
                { label: 'Active Schemes',  value: String(stats.schemes) },
              ].map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-1"
                >
                  <p className="text-xl sm:text-2xl font-bold text-foreground break-all">{analyticsLoading ? '—' : stat.value}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-[11px] sm:text-xs text-primary font-medium">Live</p>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 min-w-0">
                <h3 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">User Growth</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={growth}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-muted-foreground" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis className="text-muted-foreground" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                    <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 min-w-0">
                <h3 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">Feature Usage</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={featureUsage}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="feature" className="text-muted-foreground" fontSize={10} tickLine={false} axisLine={false} interval={0} />
                    <YAxis className="text-muted-foreground" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          {/* ======= SCHEMES TAB ======= */}
          <TabsContent value="schemes" className="space-y-4">
            {/* User-visibility source selector */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold text-foreground text-sm sm:text-base">User-visible scheme source</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Controls which schemes appear on the user Scheme Navigator page.</p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {schemeSourceMode === 'admin' ? 'Admin-curated' : schemeSourceMode === 'api' ? 'API-fetched' : 'All sources'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { id: 'admin', label: 'Admin-curated', desc: 'Only schemes added here', Icon: Database },
                  { id: 'api', label: 'API-fetched', desc: 'Only auto-synced schemes', Icon: Cloud },
                  { id: 'both', label: 'Both', desc: 'Show all active schemes', Icon: Layers },
                ] as const).map(opt => {
                  const active = schemeSourceMode === opt.id;
                  const Icon = opt.Icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => updateSchemeMode(opt.id)}
                      className={`text-left rounded-xl border p-3 transition-all ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40 hover:bg-muted/40'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{opt.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filters + Add */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground text-sm sm:text-base">Government Schemes</h3>
                <span className="text-xs text-muted-foreground">({filteredSchemes.length})</span>
              </div>
              <Button size="sm" className="rounded-xl gap-1.5 w-full sm:w-auto" onClick={openAddScheme}>
                <Plus className="h-3.5 w-3.5" /> Add Scheme
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search schemes..." value={schemeSearch} onChange={e => setSchemeSearch(e.target.value)} className="pl-9 rounded-xl" />
              </div>
              <Select value={schemeFilter} onValueChange={(v: any) => setSchemeFilter(v)}>
                <SelectTrigger className="w-full sm:w-[180px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="admin">Admin-added</SelectItem>
                  <SelectItem value="api">API-fetched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {schemesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Scheme</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="hidden md:table-cell">Category</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSchemes.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground line-clamp-1">{s.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] capitalize ${s.source === 'admin' ? 'bg-accent/15 text-accent border-accent/30' : 'bg-primary/15 text-primary border-primary/30'}`}>
                              {s.source === 'admin' ? <><Database className="h-3 w-3 mr-1" />Admin</> : <><Cloud className="h-3 w-3 mr-1" />API</>}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{s.eligibility_criteria?.category || '—'}</TableCell>
                          <TableCell>
                            <Switch checked={s.is_active} onCheckedChange={() => toggleSchemeActive(s)} />
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => openEditScheme(s)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={() => setSchemeDeleteDialog({ open: true, scheme: s })}>
                              <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredSchemes.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">No schemes found.</div>
                )}
              </motion.div>
            )}
          </TabsContent>

          {/* ======= SETTINGS TAB ======= */}
          <TabsContent value="settings" className="space-y-4">
            <h3 className="font-semibold text-foreground">Feature Toggles</h3>
            <div className="grid gap-3">
              {features.map((feature) => (
                <motion.div key={feature.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground text-sm">{feature.name}</p>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                  <button onClick={() => toggleFeature(feature.id)} className="text-foreground hover:opacity-80 transition-opacity">
                    {feature.enabled ? (
                      <ToggleRight className="h-7 w-7 text-primary" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-muted-foreground" />
                    )}
                  </button>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* ======= AUDIT LOG TAB ======= */}
          <TabsContent value="audit" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div>
                <h3 className="font-semibold text-foreground">System Audit Log</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredAudit.length} of {auditRows.length} events • live
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search action, email, id…"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="pl-9 rounded-xl"
                  />
                </div>
                <Select value={auditType} onValueChange={setAuditType}>
                  <SelectTrigger className="w-full sm:w-[170px] rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All events</SelectItem>
                    <SelectItem value="user_role">Role changes</SelectItem>
                    <SelectItem value="user_status">Ban / reactivate</SelectItem>
                    <SelectItem value="scheme">Schemes</SelectItem>
                    <SelectItem value="health_record">AI summaries</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchAuditLogs} className="rounded-xl gap-1.5" disabled={auditLoading}>
                  {auditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </Button>
              </div>
            </div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              {auditLoading && auditRows.length === 0 && (
                <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading audit events…
                </div>
              )}
              {!auditLoading && filteredAudit.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">No audit events</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Events appear here when roles change, users are banned, schemes are edited, or AI summaries are generated.
                  </p>
                </div>
              )}
              {filteredAudit.map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                  <div className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${auditDot(log.entity_type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground break-words">{log.action}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                      <Badge variant="outline" className="text-[10px] font-normal capitalize">
                        {log.entity_type.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        {log.actor_email || 'system'}
                      </span>
                      {log.target_email && log.target_email !== log.actor_email && (
                        <>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-xs text-muted-foreground font-mono truncate">{log.target_email}</span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground" title={new Date(log.created_at).toLocaleString()}>
                        {timeAgo(log.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Role Change Dialog ─── */}
      <Dialog open={roleDialog.open} onOpenChange={(o) => !o && setRoleDialog({ open: false, user: null, newRole: '' })}>
        <DialogContent className="rounded-2xl w-[calc(100%-1.5rem)] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role — {roleDialog.user?.full_name || 'User'}</DialogTitle>
          </DialogHeader>
          <Select value={roleDialog.newRole} onValueChange={(v) => setRoleDialog(prev => ({ ...prev, newRole: v }))}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="superadmin">SuperAdmin</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog({ open: false, user: null, newRole: '' })} className="rounded-xl">Cancel</Button>
            <Button onClick={handleRoleChange} disabled={actionLoading || roleDialog.newRole === roleDialog.user?.role} className="rounded-xl">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Ban Confirm Dialog ─── */}
      <AlertDialog open={banDialog.open} onOpenChange={(o) => !o && setBanDialog({ open: false, user: null })}>
        <AlertDialogContent className="rounded-2xl w-[calc(100%-1.5rem)] sm:w-full max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{banDialog.user?.status === 'banned' ? 'Unban' : 'Ban'} {banDialog.user?.full_name || 'User'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {banDialog.user?.status === 'banned'
                ? 'This will restore the user\'s access to the platform.'
                : 'This will revoke the user\'s access to the platform.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBanToggle} disabled={actionLoading} className="rounded-xl">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Confirm Dialog ─── */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => !o && setDeleteDialog({ open: false, user: null })}>
        <AlertDialogContent className="rounded-2xl w-[calc(100%-1.5rem)] sm:w-full max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDialog.user?.full_name || 'User'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the user's profile and role. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={actionLoading} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Scheme Add/Edit Dialog ─── */}
      <Dialog open={schemeDialog.open} onOpenChange={(o) => !o && setSchemeDialog({ open: false, form: { ...emptySchemeForm } })}>
        <DialogContent className="rounded-2xl w-[calc(100%-1.5rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{schemeDialog.form.id ? 'Edit Scheme' : 'Add New Scheme'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Title *</label>
              <Input value={schemeDialog.form.title} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, title: e.target.value } }))} placeholder="e.g. Ayushman Bharat PM-JAY" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
              <Textarea rows={3} value={schemeDialog.form.description} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, description: e.target.value } }))} placeholder="Brief overview of the scheme" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Official link</label>
              <Input value={schemeDialog.form.link} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, link: e.target.value } }))} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Category</label>
                <Input value={schemeDialog.form.category} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, category: e.target.value } }))} placeholder="Health" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">State</label>
                <Input value={schemeDialog.form.state} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, state: e.target.value } }))} placeholder="All / specific state" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Age</label>
                <Input value={schemeDialog.form.age} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, age: e.target.value } }))} placeholder="e.g. 18-60" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Income</label>
                <Input value={schemeDialog.form.income} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, income: e.target.value } }))} placeholder="e.g. Below 2L" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Ration card</label>
                <Input value={schemeDialog.form.ration_card} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, ration_card: e.target.value } }))} placeholder="APL / BPL" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Family size</label>
                <Input value={schemeDialog.form.family_size} onChange={e => setSchemeDialog(p => ({ ...p, form: { ...p.form, family_size: e.target.value } }))} placeholder="Any / 5+" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Visible to users when included by source mode.</p>
              </div>
              <Switch checked={schemeDialog.form.is_active} onCheckedChange={(v) => setSchemeDialog(p => ({ ...p, form: { ...p.form, is_active: v } }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setSchemeDialog({ open: false, form: { ...emptySchemeForm } })}>Cancel</Button>
            <Button className="rounded-xl" onClick={saveScheme} disabled={schemeSaving || !schemeDialog.form.title.trim()}>
              {schemeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (schemeDialog.form.id ? 'Save Changes' : 'Add Scheme')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Scheme Delete Confirm ─── */}
      <AlertDialog open={schemeDeleteDialog.open} onOpenChange={(o) => !o && setSchemeDeleteDialog({ open: false, scheme: null })}>
        <AlertDialogContent className="rounded-2xl w-[calc(100%-1.5rem)] sm:w-full max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{schemeDeleteDialog.scheme?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the scheme. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteScheme} disabled={schemeSaving} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {schemeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminDashboard;
