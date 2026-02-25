// Authentication Store using Zustand

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiClient } from '@/lib/api-client';
import { toast } from './ui';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  globalRole: string;
  tenantMemberships: Array<{
    organizationId: string;
    organizationName: string;
    role: string;
    locationId?: string;
    isDefault: boolean;
  }>;
  mfaEnabled: boolean;
  createdAt: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  subscriptionTier: string;
  logo?: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  businessType: string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const loginData = await apiClient.login({ email, password });

          // apiClient.login returns LoginResponse directly with user, tenant, tokens
          const { user, tenant } = loginData;
          set({
            user: user as any,
            tenant: (tenant as any) ?? null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          toast.success('Welcome back!', `Logged in as ${user.profile?.firstName || user.email}`);
        } catch (error: any) {
          const errorMessage = error.message || 'Login failed';
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
          });
          toast.error('Login failed', errorMessage);
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await apiClient.logout();
        } catch (error) {
          // Ignore logout errors
        } finally {
          set({
            user: null,
            tenant: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });
        try {
          await apiClient.register(data as any);
          set({ isLoading: false });
          toast.success('Registration successful', 'Please check your email to verify your account');
        } catch (error: any) {
          const errorMessage = error.message || 'Registration failed';
          set({
            isLoading: false,
            error: errorMessage,
          });
          toast.error('Registration failed', errorMessage);
          throw error;
        }
      },

      forgotPassword: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          await apiClient.post('/auth/forgot-password', { email });
          set({ isLoading: false });
          toast.success('Email sent', 'Check your inbox for password reset instructions');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to send reset email';
          set({
            isLoading: false,
            error: errorMessage,
          });
          toast.error('Failed to send email', errorMessage);
          throw error;
        }
      },

      resetPassword: async (token: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          await apiClient.post('/auth/reset-password', { token, password });
          set({ isLoading: false });
          toast.success('Password reset', 'You can now log in with your new password');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to reset password';
          set({
            isLoading: false,
            error: errorMessage,
          });
          toast.error('Password reset failed', errorMessage);
          throw error;
        }
      },

      verifyEmail: async (token: string) => {
        set({ isLoading: true, error: null });
        try {
          await apiClient.post('/auth/verify-email', { token });
          set({ isLoading: false });
          toast.success('Email verified', 'Your email has been verified successfully');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to verify email';
          set({
            isLoading: false,
            error: errorMessage,
          });
          toast.error('Verification failed', errorMessage);
          throw error;
        }
      },

      refreshUser: async () => {
        try {
          const user = await apiClient.getCurrentUser();
          if (user) {
            set({ user: user as any });
          }
        } catch (error) {
          // If refresh fails, user might be logged out
          set({
            user: null,
            tenant: null,
            isAuthenticated: false,
          });
        }
      },

      switchTenant: async (tenantId: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post('/auth/switch-tenant', { tenantId }) as any;
          if (response.success && response.data) {
            set({
              tenant: response.data.tenant,
              isLoading: false,
            });
            toast.success('Organization switched', `Now viewing ${response.data.tenant.name}`);
          }
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to switch organization';
          set({
            isLoading: false,
            error: errorMessage,
          });
          toast.error('Switch failed', errorMessage);
          throw error;
        }
      },

      clearError: () => set({ error: null }),
      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: 'properpos-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
