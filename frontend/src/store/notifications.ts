// Notifications Store

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';

const MAX_NOTIFICATIONS = 200;

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any> | undefined;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  readAt?: string | undefined;
  createdAt: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  page: number;

  // Actions
  fetchNotifications: (reset?: boolean) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => void;
  addNotification: (notification: Notification) => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasMore: true,
  page: 1,

  fetchNotifications: async (reset = false) => {
    const currentPage = reset ? 1 : get().page;

    set({ isLoading: true });

    try {
      const response = await apiClient.get('/notifications', {
        params: { page: currentPage, limit: 20 },
      }) as any;

      if (response.success && response.data) {
        const newNotifications = response.data as Notification[];
        const hasMore = response.meta?.hasMore ?? newNotifications.length === 20;

        set((state) => ({
          notifications: (reset
            ? newNotifications
            : [...state.notifications, ...newNotifications]
          ).slice(0, MAX_NOTIFICATIONS),
          page: currentPage + 1,
          hasMore,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('[Notifications]', error);
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const response = await apiClient.get('/notifications/unread-count') as any;

      if (response.success && response.data) {
        set({ unreadCount: response.data.count });
      }
    } catch (error) {
      console.error('[Notifications]', error);
    }
  },

  markAsRead: async (id: string) => {
    try {
      await apiClient.post(`/notifications/${id}/read`);

      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (error) {
      console.error('[Notifications]', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await apiClient.post('/notifications/read-all');

      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          read: true,
          readAt: new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch (error) {
      console.error('[Notifications]', error);
    }
  },

  deleteNotification: async (id: string) => {
    try {
      await apiClient.delete(`/notifications/${id}`);

      set((state) => {
        const notification = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount: notification && !notification.read
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        };
      });
    } catch (error) {
      console.error('[Notifications]', error);
    }
  },

  clearAll: () => set({
    notifications: [],
    unreadCount: 0,
    page: 1,
    hasMore: true,
  }),

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
      unreadCount: notification.read ? state.unreadCount : state.unreadCount + 1,
    }));
  },
}));
