// UI State Store using Zustand

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string | undefined;
  duration?: number | undefined;
}

interface Modal {
  id: string;
  component: string;
  props?: Record<string, any> | undefined;
}

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;

  // Theme
  theme: Theme;

  // Toasts
  toasts: Toast[];

  // Modals
  modals: Modal[];

  // Loading states
  globalLoading: boolean;
  loadingMessage: string;

  // Mobile
  isMobile: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: Theme) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  openModal: (modal: Omit<Modal, 'id'>) => string;
  closeModal: (id: string) => void;
  closeAllModals: () => void;
  setGlobalLoading: (loading: boolean, message?: string) => void;
  setIsMobile: (isMobile: boolean) => void;
}

let toastId = 0;
let modalId = 0;

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      theme: 'system',
      toasts: [],
      modals: [],
      globalLoading: false,
      loadingMessage: '',
      isMobile: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

      setSidebarCollapsed: (collapsed: boolean) =>
        set({ sidebarCollapsed: collapsed }),

      setTheme: (theme: Theme) => {
        // Only update state - theme application is handled by MainLayout's useEffect
        // to avoid SSR hydration issues and race conditions
        set({ theme });
      },

      addToast: (toast: Omit<Toast, 'id'>) => {
        const id = `toast-${++toastId}`;
        const newToast: Toast = {
          ...toast,
          id,
          duration: toast.duration ?? 5000,
        };

        set((state) => ({
          toasts: [...state.toasts, newToast],
        }));

        // Auto remove after duration
        if (newToast.duration && newToast.duration > 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, newToast.duration);
        }
      },

      removeToast: (id: string) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),

      clearToasts: () => set({ toasts: [] }),

      openModal: (modal: Omit<Modal, 'id'>) => {
        const id = `modal-${++modalId}`;
        set((state) => ({
          modals: [...state.modals, { ...modal, id }],
        }));
        return id;
      },

      closeModal: (id: string) =>
        set((state) => ({
          modals: state.modals.filter((m) => m.id !== id),
        })),

      closeAllModals: () => set({ modals: [] }),

      setGlobalLoading: (loading: boolean, message?: string) =>
        set({ globalLoading: loading, loadingMessage: message || '' }),

      setIsMobile: (isMobile: boolean) => set({ isMobile }),
    }),
    {
      name: 'properpos-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);

// Toast helper functions
export const toast = {
  success: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'error', title, message }),
  warning: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'warning', title, message }),
  info: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'info', title, message }),
};
