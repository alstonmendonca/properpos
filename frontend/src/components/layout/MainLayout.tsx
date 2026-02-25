'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore, useAuthStore, useNotificationsStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, isMobile, setIsMobile, theme, setTheme } = useUIStore(
    useShallow(s => ({ sidebarOpen: s.sidebarOpen, setSidebarOpen: s.setSidebarOpen, sidebarCollapsed: s.sidebarCollapsed, isMobile: s.isMobile, setIsMobile: s.setIsMobile, theme: s.theme, setTheme: s.setTheme }))
  );
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isLoading = useAuthStore(s => s.isLoading);
  const fetchUnreadCount = useNotificationsStore(s => s.fetchUnreadCount);

  // Check authentication
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Handle responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsMobile, setSidebarOpen]);

  // Apply theme and listen for system preference changes
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');

      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(theme);
      }
    };

    applyTheme();

    // Listen for system preference changes when using system theme
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    return undefined;
  }, [theme]);

  // Fetch notifications count on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
      // Refresh every 30 seconds
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isAuthenticated, fetchUnreadCount]);

  // Show loading while checking auth
  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Sidebar Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-transform duration-300 lg:translate-x-0',
          isMobile && !sidebarOpen && '-translate-x-full'
        )}
      >
        <Sidebar />
      </div>

      {/* Main Content */}
      <div
        className={cn(
          'transition-all duration-300',
          isMobile ? 'ml-0' : sidebarCollapsed ? 'ml-[68px]' : 'ml-[260px]'
        )}
      >
        <Header />

        <main id="main-content" className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
