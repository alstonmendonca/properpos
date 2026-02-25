'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  Warehouse,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, useAuthStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'POS', href: '/pos', icon: ShoppingCart },
  { label: 'Orders', href: '/orders', icon: ClipboardList },
  { label: 'Products', href: '/products', icon: Package },
  { label: 'Customers', href: '/customers', icon: Users },
  { label: 'Inventory', href: '/inventory', icon: Warehouse },
];

const secondaryNavItems: NavItem[] = [
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Billing', href: '/billing', icon: CreditCard },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed, isMobile, setSidebarOpen } = useUIStore(
    useShallow(s => ({ sidebarCollapsed: s.sidebarCollapsed, setSidebarCollapsed: s.setSidebarCollapsed, isMobile: s.isMobile, setSidebarOpen: s.setSidebarOpen }))
  );
  const { tenant, user, logout } = useAuthStore(
    useShallow(s => ({ tenant: s.tenant, user: s.user, logout: s.logout }))
  );

  const handleNavClick = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
    return (
      <Link
        href={item.href}
        onClick={handleNavClick}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer',
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <item.icon className={cn(
          'w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200',
          !isActive && 'group-hover:text-foreground'
        )} />
        {!sidebarCollapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className={cn(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                isActive
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-primary/10 text-primary'
              )}>
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-card border-r border-border transition-all duration-300',
        sidebarCollapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-16 border-b border-border',
        sidebarCollapsed ? 'px-3 justify-center' : 'px-5'
      )}>
        <Link href="/dashboard" className="flex items-center gap-3 cursor-pointer" aria-label="ProperPOS home">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-[15px] text-foreground leading-tight tracking-tight">
                ProperPOS
              </span>
              {tenant && (
                <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                  {tenant.name}
                </span>
              )}
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-hide" role="navigation" aria-label="Main navigation">
        {/* Main Navigation */}
        <div className={cn('space-y-1', sidebarCollapsed ? 'px-2' : 'px-3')}>
          {!sidebarCollapsed && (
            <p className="px-3 mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Main
            </p>
          )}
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {/* Divider */}
        <div className="my-4 mx-3 border-t border-border" />

        {/* Secondary Navigation */}
        <div className={cn('space-y-1', sidebarCollapsed ? 'px-2' : 'px-3')}>
          {!sidebarCollapsed && (
            <p className="px-3 mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              System
            </p>
          )}
          {secondaryNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-2">
        {/* User info */}
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
        )}

        {/* Collapse Button */}
        {!isMobile && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 mr-2" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </Button>
        )}

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer',
            sidebarCollapsed ? 'justify-center' : 'justify-start'
          )}
          onClick={logout}
          aria-label="Log out"
        >
          <LogOut className="w-4 h-4" />
          {!sidebarCollapsed && <span className="ml-2 text-xs">Logout</span>}
        </Button>
      </div>
    </aside>
  );
}
