import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type UserRole = 'USER' | 'ADMIN' | 'SUPERADMIN';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: 'USER',
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('USER');
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.role === 'admin') setRole('ADMIN');
      else if (data?.role === 'superadmin') setRole('SUPERADMIN');
      else setRole('USER');
    } catch {
      setRole('USER');
    }
  };

  useEffect(() => {
    let mounted = true;

    // Safety net: never leave the app stuck on the loading spinner.
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    // IMPORTANT: keep the auth-state callback synchronous to avoid
    // Supabase auth deadlocks. Defer any DB calls with setTimeout(0).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        if (nextSession?.user) {
          setTimeout(() => {
            if (mounted) fetchRole(nextSession.user.id);
          }, 0);
        } else {
          setRole('USER');
        }
        setLoading(false);
      }
    );

    supabase.auth
      .getSession()
      .then(({ data: { session: existing } }) => {
        if (!mounted) return;
        setSession(existing);
        setUser(existing?.user ?? null);
        if (existing?.user) {
          fetchRole(existing.user.id);
        }
      })
      .catch((err) => {
        console.error('[AuthContext] getSession failed', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try { localStorage.removeItem('dev_bypass'); } catch {}
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole('USER');
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
