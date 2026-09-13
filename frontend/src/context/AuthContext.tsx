import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { hasPermission, RBACAction, RBACScope } from '../utils/rbac';

export interface UserOrg {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isPrimary?: boolean;
  parentId?: string | null;
  parentNameAr?: string | null;
}

export interface UserProfile {
  id: string;
  personId: string;
  nameAr: string;
  nameEn?: string;
  nationalId?: string | null;
  phone?: string | null;
  isActive?: boolean;
  email: string;
  roles?: string[];
  permissions?: string[];
  capabilities?: string[];
  activeOrganization: UserOrg;
  availableOrganizations: UserOrg[];
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  primaryRole: string;
  login: (data: { user: UserProfile; tokens: { accessToken: string; refreshToken: string } }) => void;
  logout: () => void;
  switchOrganization: (orgId: string) => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasCapability: (capability: string) => boolean;
  hasAnyCapability: (capabilities: string[]) => boolean;
  updateUser: (data: Partial<UserProfile>) => void;
  can: (action: RBACAction, scope: RBACScope) => boolean;
}

const STORAGE_KEY = 'user_profile';
const AuthContext = createContext<AuthContextType | undefined>(undefined);

function extractPrimaryRole(user: UserProfile | null): string {
  if (!user?.roles || user.roles.length === 0) return '';
  return user.roles[0];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const clearSession = () => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('active_org_id');
      localStorage.removeItem(STORAGE_KEY);
      if (!cancelled) setUser(null);
    };

    const restoreSession = async () => {
      const accessToken = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');
      const savedUser = localStorage.getItem(STORAGE_KEY);

      // Never treat a cached profile as an authenticated session without credentials.
      if (!accessToken && !refreshToken) {
        if (savedUser) clearSession();
        return;
      }

      setIsLoading(true);
      try {
        let token = accessToken;

        // Bootstrap a new access token when only the refresh token survived.
        if (!token && refreshToken) {
          const refreshResponse = await apiClient.post('/auth/refresh-token', { refreshToken });
          const tokens = refreshResponse.data?.tokens ?? refreshResponse.data;
          const newAccessToken = tokens?.accessToken;
          const newRefreshToken = tokens?.refreshToken;
          if (!newAccessToken) throw new Error('Session refresh returned no access token');
          localStorage.setItem('access_token', newAccessToken);
          if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);
        }

        // Validate the access token and refresh the complete user/org/RBAC context.
        const profileResponse = await apiClient.get('/auth/me');
        const profile = profileResponse.data?.user ?? profileResponse.data?.data?.user ?? profileResponse.data?.data ?? profileResponse.data;
        if (!profile?.id) throw new Error('Authenticated profile was not returned');

        if (!cancelled) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
          if (profile.activeOrganization?.id) localStorage.setItem('active_org_id', profile.activeOrganization.id);
          setUser(profile);
        }
      } catch {
        // A definitive auth failure must not leave a stale authenticated UI visible.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleAuthLogout = () => setUser(null);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'access_token' && !e.newValue) setUser(null);
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const primaryRole = extractPrimaryRole(user);

  const login = (data: { user: UserProfile; tokens: { accessToken: string; refreshToken: string } }) => {
    localStorage.setItem('access_token', data.tokens.accessToken);
    localStorage.setItem('refresh_token', data.tokens.refreshToken);
    localStorage.setItem('active_org_id', data.user.activeOrganization.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const switchOrganization = async (orgId: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post('/auth/switch-org', { organizationId: orgId });
      const { activeOrganization, tokens, roles, permissions, capabilities } = res.data;
      localStorage.setItem('access_token', tokens.accessToken);
      localStorage.setItem('refresh_token', tokens.refreshToken);
      localStorage.setItem('active_org_id', activeOrganization.id);
      if (user) {
        const updatedUser: UserProfile = { ...user, activeOrganization, roles: roles || user.roles, permissions: permissions || user.permissions, capabilities: capabilities ?? [] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const hasRole = (role: string): boolean => user?.roles?.includes(role) ?? false;
  const hasAnyRole = (roles: string[]): boolean => roles.some((r) => user?.roles?.includes(r) ?? false);
  const hasCapability = (capability: string): boolean => user?.capabilities?.includes(capability) ?? false;
  const hasAnyCapability = (capabilities: string[]): boolean => capabilities.some((c) => user?.capabilities?.includes(c) ?? false);

  const updateUser = (data: Partial<UserProfile>) => {
    if (user) {
      const updatedUser: UserProfile = { ...user, ...data };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  const can = (action: RBACAction, scope: RBACScope): boolean => hasPermission(user, action, scope);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, primaryRole, login, logout, switchOrganization, hasRole, hasAnyRole, hasCapability, hasAnyCapability, updateUser, can }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
