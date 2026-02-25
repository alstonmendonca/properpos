'use client';

import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/Toaster';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialize theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('properpos-ui');
    if (savedTheme) {
      try {
        const { state } = JSON.parse(savedTheme);
        const theme = state?.theme || 'system';
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
      } catch {
        // Ignore parsing errors
      }
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
