'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[] | undefined;
  redirectTo?: string | undefined;
}

export function ProtectedRoute({
  children,
  requiredRoles,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, user } = useAuthStore(
    useShallow(s => ({ isAuthenticated: s.isAuthenticated, isLoading: s.isLoading, user: s.user }))
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Store the current path to redirect back after login
      const returnUrl = encodeURIComponent(pathname || '/');
      router.push(`${redirectTo}?returnUrl=${returnUrl}`);
    }
  }, [isAuthenticated, isLoading, pathname, redirectTo, router]);

  // Check role-based access
  useEffect(() => {
    if (isAuthenticated && requiredRoles && requiredRoles.length > 0 && user) {
      const userRole = user.tenantMemberships?.[0]?.role || user.globalRole;
      if (!requiredRoles.includes(userRole)) {
        router.push('/unauthorized');
      }
    }
  }, [isAuthenticated, requiredRoles, user, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Check roles if specified
  if (requiredRoles && requiredRoles.length > 0 && user) {
    const userRole = user.tenantMemberships?.[0]?.role || user.globalRole;
    if (!requiredRoles.includes(userRole)) {
      return null;
    }
  }

  return <>{children}</>;
}

// Higher-order component version
export function withProtectedRoute<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { requiredRoles?: string[]; redirectTo?: string }
) {
  const ProtectedComponent = (props: P) => {
    return (
      <ProtectedRoute
        requiredRoles={options?.requiredRoles}
        redirectTo={options?.redirectTo}
      >
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };

  ProtectedComponent.displayName = `ProtectedRoute(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return ProtectedComponent;
}

// Role-specific wrapper components
export function AdminOnly({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={['owner', 'admin']}>
      {children}
    </ProtectedRoute>
  );
}

export function ManagerOnly({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={['owner', 'admin', 'manager']}>
      {children}
    </ProtectedRoute>
  );
}
