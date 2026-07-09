import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BottomNav } from './BottomNav';
import { AppSidebar } from './AppSidebar';
import { TopHeader } from './TopHeader';
import { HealingCursor } from './HealingCursor';
import { useSchemeNotifier } from '@/hooks/useSchemeNotifier';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, loading } = useAuth();
  useSchemeNotifier();

  // Defense-in-depth: immediately redirect non-admins away from /admin routes
  useEffect(() => {
    if (loading) return;
    const isAdminPath = location.pathname.startsWith('/admin');
    const isSuperAdminPath = location.pathname.startsWith('/superadmin');
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const isSuperAdmin = role === 'SUPERADMIN';
    if ((isAdminPath && !isAdmin) || (isSuperAdminPath && !isSuperAdmin)) {
      navigate('/unauthorized', { replace: true });
    }
  }, [location.pathname, role, loading, navigate]);

  return (
    <div className="flex min-h-screen w-full bg-background overflow-x-hidden">
      <HealingCursor />
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <TopHeader />
        <main className="flex-1 pb-20 md:pb-0 overflow-y-auto overflow-x-hidden">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="h-full w-full min-w-0"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
};
