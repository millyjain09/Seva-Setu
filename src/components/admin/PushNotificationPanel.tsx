import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bell, Send, Users, User, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UserOption {
  id: string;
  full_name: string | null;
}

export const PushNotificationPanel = () => {
  const [mode, setMode] = useState<'broadcast' | 'specific'>('broadcast');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      if (error) throw error;
      setUsers(data ?? []);
    } catch (err: any) {
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter(u =>
    (u.full_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and message are required');
      return;
    }

    if (mode === 'specific' && !selectedUserId) {
      toast.error('Please select a user');
      return;
    }

    setSending(true);

    try {
      if (mode === 'broadcast') {
        // Get all users with push subscriptions
        const { data: subs, error: subErr } = await supabase
          .from('push_subscriptions')
          .select('user_id');
        if (subErr) throw subErr;

        const uniqueUserIds = [...new Set(subs?.map(s => s.user_id) ?? [])];

        if (uniqueUserIds.length === 0) {
          toast.warning('No users have push notifications enabled');
          setSending(false);
          return;
        }

        let sent = 0;
        let failed = 0;

        // Send to each user
        for (const userId of uniqueUserIds) {
          try {
            const { data, error } = await supabase.functions.invoke('send-push', {
              body: { user_id: userId, title, body },
            });
            if (error) throw error;
            sent += data?.sent ?? 0;
            failed += data?.failed ?? 0;
          } catch {
            failed++;
          }
        }

        toast.success(`Broadcast sent: ${sent} delivered, ${failed} failed across ${uniqueUserIds.length} users`);
      } else {
        const { data, error } = await supabase.functions.invoke('send-push', {
          body: { user_id: selectedUserId, title, body },
        });
        if (error) throw error;

        if (data?.sent > 0) {
          toast.success(`Push notification sent (${data.sent} device${data.sent > 1 ? 's' : ''})`);
        } else {
          toast.warning('User has no push subscriptions — in-app notification was created instead');
        }
      }

      setTitle('');
      setBody('');
      setSelectedUserId('');
    } catch (err: any) {
      toast.error('Failed to send: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Mode selector */}
      <div className="flex gap-3">
        <Button
          variant={mode === 'broadcast' ? 'default' : 'outline'}
          onClick={() => setMode('broadcast')}
          className="rounded-xl gap-2"
        >
          <Users className="h-4 w-4" />
          Broadcast to All
        </Button>
        <Button
          variant={mode === 'specific' ? 'default' : 'outline'}
          onClick={() => setMode('specific')}
          className="rounded-xl gap-2"
        >
          <User className="h-4 w-4" />
          Specific User
        </Button>
      </div>

      {/* User selector for specific mode */}
      {mode === 'specific' && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <Label className="text-sm font-medium text-foreground">Select User</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>

          {selectedUser && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{selectedUser.full_name || 'Unnamed'}</span>
              <span className="text-xs text-muted-foreground font-mono">{selectedUser.id.slice(0, 8)}…</span>
              <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={() => setSelectedUserId('')}>
                Clear
              </Button>
            </div>
          )}

          {loadingUsers ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
              {filteredUsers.slice(0, 20).map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                    selectedUserId === user.id ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.full_name || 'Unnamed'}</p>
                    <p className="text-xs text-muted-foreground font-mono">{user.id.slice(0, 12)}…</p>
                  </div>
                  {selectedUserId === user.id && (
                    <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">Selected</Badge>
                  )}
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">No users found</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notification form */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">
            {mode === 'broadcast' ? 'Broadcast Notification' : 'Send to User'}
          </h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notif-title">Title</Label>
          <Input
            id="notif-title"
            placeholder="e.g., Health Reminder"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notif-body">Message</Label>
          <Textarea
            id="notif-body"
            placeholder="e.g., Time for your daily BP check!"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="rounded-xl min-h-[100px] resize-none"
          />
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim() || (mode === 'specific' && !selectedUserId)}
          className="w-full rounded-xl gap-2"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {sending ? 'Sending…' : mode === 'broadcast' ? 'Send to All Users' : 'Send Notification'}
        </Button>
      </div>
    </motion.div>
  );
};
