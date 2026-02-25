'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Menu,
  Bell,
  Search,
  Sun,
  Moon,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Building2,
  Command,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, useAuthStore, useNotificationsStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';

export function Header() {
  const { setSidebarOpen, theme, setTheme, isMobile } = useUIStore(
    useShallow(s => ({ setSidebarOpen: s.setSidebarOpen, theme: s.theme, setTheme: s.setTheme, isMobile: s.isMobile }))
  );
  const { user, tenant, logout } = useAuthStore(
    useShallow(s => ({ user: s.user, tenant: s.tenant, logout: s.logout }))
  );
  const unreadCount = useNotificationsStore(s => s.unreadCount);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-lg border-b border-border flex items-center justify-between px-4 lg:px-6">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        {/* Search */}
        <div className="hidden md:flex items-center">
          <button className="flex items-center gap-3 h-9 w-64 lg:w-80 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer">
            <Search className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground">
              <Command className="w-3 h-3" />K
            </kbd>
          </button>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1">
        {/* Mobile Search */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden cursor-pointer"
        >
          <Search className="w-[18px] h-[18px]" />
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="w-[18px] h-[18px]" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </Button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative cursor-pointer"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full ring-2 ring-background" />
            )}
          </Button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-popover rounded-xl shadow-lg border border-border z-50 animate-in fade-in zoom-in-95">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-foreground">
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {unreadCount === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">All caught up</p>
                  </div>
                ) : (
                  <div className="p-2">
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-border">
                <Link
                  href="/notifications"
                  className="block w-full text-center text-sm font-medium text-primary hover:text-primary/80 py-2 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => setShowNotifications(false)}
                >
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="hidden lg:block w-px h-6 bg-border mx-2" />

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-sm font-medium text-foreground leading-tight">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {user?.tenantMemberships?.[0]?.role || 'User'}
              </p>
            </div>
            <ChevronDown className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
              showUserMenu && 'rotate-180'
            )} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-popover rounded-xl shadow-lg border border-border z-50 animate-in fade-in zoom-in-95">
              {/* User Info */}
              <div className="p-4 border-b border-border">
                <p className="font-medium text-sm text-foreground">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              </div>

              {/* Tenant Info */}
              {tenant && (
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{tenant.name}</span>
                  </div>
                </div>
              )}

              {/* Menu Items */}
              <div className="p-1.5">
                <Link
                  href="/profile"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer"
                  onClick={() => setShowUserMenu(false)}
                >
                  <User className="w-4 h-4 text-muted-foreground" />
                  Profile
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer"
                  onClick={() => setShowUserMenu(false)}
                >
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Settings
                </Link>
              </div>

              {/* Logout */}
              <div className="p-1.5 border-t border-border">
                <button
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
