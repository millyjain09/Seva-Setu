import { Home, Mic, FolderHeart, Building2, Shield, Crown, LogOut, ChevronRight, Phone, User, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

import { useState } from 'react';

export const AppSidebar = () => {
  const { role, signOut } = useAuth();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const sidebarNavId = 'app-sidebar-nav';

  const toggleCollapsed = () => setCollapsed((c) => !c);
  const handleToggleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleCollapsed();
    }
  };

  const navItems = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/voice-hub', icon: Mic, label: t('nav.voiceAsk') },
    { to: '/health-vault', icon: FolderHeart, label: t('nav.healthVault') },
    { to: '/schemes', icon: Building2, label: t('nav.schemes') },
    { to: '/emergency', icon: Phone, label: t('nav.emergency') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];

  const showAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
  const showSuperAdmin = role === 'SUPERADMIN';

  return (
    <aside
      aria-label="Primary sidebar"
      className={cn(
        'hidden md:flex flex-col border-r border-border/50 bg-sidebar min-h-screen p-4 gap-2 transition-all duration-300 ease-in-out',
        collapsed ? 'w-20 items-center' : 'w-64'
      )}
    >
      <div
        className={cn(
          'flex items-center mb-6 pt-2 transition-all',
          collapsed ? 'px-0 justify-center' : 'px-3 justify-between'
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-md shrink-0">
            <span className="text-sm font-black text-primary-foreground">SS</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">{t('common.appName')}</h1>
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] font-medium">{t('common.tagline')}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          onKeyDown={handleToggleKeyDown}
          aria-label={collapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
          aria-expanded={!collapsed}
          aria-controls={sidebarNavId}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
            collapsed && 'hidden'
          )}
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={toggleCollapsed}
        onKeyDown={handleToggleKeyDown}
        aria-label={collapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
        aria-expanded={!collapsed}
        aria-controls={sidebarNavId}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center bg-sidebar-accent text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors mb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
          !collapsed && 'hidden'
        )}
      >
        <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
      </button>

      <nav id={sidebarNavId} aria-label="Main navigation" className="flex flex-col gap-0.5 flex-1 w-full">
        {!collapsed && (
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] px-3 mb-2">
            {t('nav.menu')}
          </p>
        )}
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group',
                collapsed ? 'justify-center px-1 py-3' : 'gap-3',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-0.5'
              )
            }
          >
            <div className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors">
              <item.icon className="h-4 w-4" />
            </div>
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {!collapsed && <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />}
          </NavLink>
        ))}

        {showAdmin && (
          <>
            {!collapsed && <div className="my-3 mx-3 border-t border-border/50" />}
            {!collapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] px-3 mb-2">
                {t('nav.admin')}
              </p>
            )}
            <NavLink
              to="/admin/dashboard"
              title={t('nav.adminPanel')}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group',
                  collapsed ? 'justify-center px-1 py-3' : 'gap-3',
                  isActive
                    ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/25'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-0.5'
                )
              }
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center">
                <Shield className="h-4 w-4" />
              </div>
              {!collapsed && <span className="flex-1">{t('nav.adminPanel')}</span>}
              {!collapsed && <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />}
            </NavLink>
          </>
        )}

        {showSuperAdmin && (
          <NavLink
            to="/superadmin"
            title={t('nav.superAdmin')}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group',
                collapsed ? 'justify-center px-1 py-3' : 'gap-3',
                isActive
                  ? 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-0.5'
              )
            }
          >
            <div className="h-8 w-8 rounded-lg flex items-center justify-center">
              <Crown className="h-4 w-4" />
            </div>
            {!collapsed && <span className="flex-1">{t('nav.superAdmin')}</span>}
            {!collapsed && <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />}
          </NavLink>
        )}
      </nav>

      <div className={cn('border-t border-border/50 pt-3', collapsed && 'flex justify-center')}>
        <button
          onClick={signOut}
          title={t('common.signOut')}
          className={cn(
            'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 group',
            collapsed ? 'justify-center px-1 py-3' : 'gap-3 w-full'
          )}
        >
          <div className="h-8 w-8 rounded-lg flex items-center justify-center">
            <LogOut className="h-4 w-4" />
          </div>
          {!collapsed && t('common.signOut')}
        </button>
      </div>
    </aside>
  );
};
