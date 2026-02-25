/**
 * Tests for the authentication Zustand store.
 *
 * Covers: initial state, login success/failure, logout, clearError.
 * Mocks: apiClient from @/lib/api-client and toast from @/store/ui.
 */

import { act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks – must be declared before importing the store so the module-level
// `create(persist(...))` call picks them up.
// ---------------------------------------------------------------------------

// Mock localStorage for zustand persist middleware
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock apiClient
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockGetCurrentUser = jest.fn();
const mockRegister = jest.fn();
const mockPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    login: mockLogin,
    logout: mockLogout,
    getCurrentUser: mockGetCurrentUser,
    register: mockRegister,
    post: mockPost,
  },
}));

// Mock the toast helpers from @/store/ui
jest.mock('@/store/ui', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import the store *after* mocks are in place.
// ---------------------------------------------------------------------------
import { useAuthStore } from '@/store/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the zustand store to its initial state between tests. */
function resetStore() {
  const { setState } = useAuthStore as any;
  setState({
    user: null,
    tenant: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    resetStore();
  });

  // -- Initial state -------------------------------------------------------

  describe('initial state', () => {
    it('should have user as null', () => {
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('should have tenant as null', () => {
      expect(useAuthStore.getState().tenant).toBeNull();
    });

    it('should not be authenticated', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should not be loading', () => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should have no error', () => {
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  // -- login() -------------------------------------------------------------

  describe('login()', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      profile: { firstName: 'John' },
    };
    const mockTenant = {
      id: 'tenant-1',
      name: 'Test Org',
      slug: 'test-org',
    };
    const mockLoginResponse = {
      user: mockUser,
      tenant: mockTenant,
      tokens: {
        accessToken: 'tok_abc',
        refreshToken: 'ref_abc',
        expiresIn: 3600,
      },
    };

    it('should set user, tenant, and isAuthenticated on success', async () => {
      mockLogin.mockResolvedValueOnce(mockLoginResponse);

      await act(async () => {
        await useAuthStore.getState().login('test@example.com', 'password123');
      });

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.tenant).toEqual(mockTenant);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should call apiClient.login with email and password', async () => {
      mockLogin.mockResolvedValueOnce(mockLoginResponse);

      await act(async () => {
        await useAuthStore.getState().login('a@b.com', 'pw');
      });

      expect(mockLogin).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' });
    });

    it('should set isLoading to true while logging in', async () => {
      // Use a deferred promise so we can inspect state mid-flight.
      let resolveFn!: (v: any) => void;
      const pending = new Promise((r) => {
        resolveFn = r;
      });
      mockLogin.mockReturnValueOnce(pending);

      const loginPromise = act(async () => {
        // We purposely do NOT await the store action yet – we wrap it in a
        // fire-and-forget so we can inspect intermediate state.
        const p = useAuthStore.getState().login('a@b.com', 'pw').catch(() => {});
        // Give the synchronous `set({ isLoading: true })` a tick to propagate
        await new Promise((r) => setTimeout(r, 0));
        expect(useAuthStore.getState().isLoading).toBe(true);
        resolveFn(mockLoginResponse);
        await p;
      });

      await loginPromise;
    });

    it('should set error on failure and rethrow', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

      await expect(
        act(async () => {
          await useAuthStore.getState().login('bad@user.com', 'wrong');
        }),
      ).rejects.toThrow('Invalid credentials');

      const state = useAuthStore.getState();
      expect(state.error).toBe('Invalid credentials');
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should set tenant to null when login response has no tenant', async () => {
      mockLogin.mockResolvedValueOnce({
        ...mockLoginResponse,
        tenant: undefined,
      });

      await act(async () => {
        await useAuthStore.getState().login('test@example.com', 'pw');
      });

      expect(useAuthStore.getState().tenant).toBeNull();
    });
  });

  // -- logout() ------------------------------------------------------------

  describe('logout()', () => {
    it('should clear user, tenant, and isAuthenticated', async () => {
      // First put the store in a logged-in state.
      (useAuthStore as any).setState({
        user: { id: 'u1', email: 'u@u.com' },
        tenant: { id: 't1', name: 'T' },
        isAuthenticated: true,
      });

      mockLogout.mockResolvedValueOnce(undefined);

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.tenant).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should still clear state even if apiClient.logout throws', async () => {
      (useAuthStore as any).setState({
        user: { id: 'u1', email: 'u@u.com' },
        isAuthenticated: true,
      });

      mockLogout.mockRejectedValueOnce(new Error('network error'));

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  // -- clearError() --------------------------------------------------------

  describe('clearError()', () => {
    it('should set error to null', () => {
      (useAuthStore as any).setState({ error: 'something went wrong' });
      expect(useAuthStore.getState().error).toBe('something went wrong');

      act(() => {
        useAuthStore.getState().clearError();
      });

      expect(useAuthStore.getState().error).toBeNull();
    });
  });
});
