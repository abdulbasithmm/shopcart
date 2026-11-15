import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchCustomerProfile, updateCustomerProfile, verifyUserRole } from '../services/profileService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; message?: string; needsEmailVerification?: boolean }>;
  register: (name: string, email: string, password?: string) => Promise<{ success: boolean; message?: string; needsConfirmation?: boolean }>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (newPassword: string) => Promise<{ success: boolean; message?: string }>;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; message?: string }>;
  updateProfile: (data: Partial<User>) => Promise<{ success: boolean; message?: string }>;
  quickDemoLogin: (asAdmin?: boolean) => void;
  isSupabaseBackend: boolean;
  refreshProfile: (authUserOverride?: any) => Promise<User | null>;
  clearPasswordRecovery: () => void;
}

const DEMO_CUSTOMER: User = {
  id: 'usr-demo-01',
  name: 'Alex Morgan',
  email: 'alex.morgan@shopcart.com',
  avatar: 'AM',
  role: 'customer',
  emailConfirmed: true,
  phone: '+91 98765 43210',
  address: {
    street: '42 Indiranagar 100 Feet Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    zipCode: '560038',
    country: 'India',
  },
};

const DEMO_ADMIN: User = {
  id: 'usr-demo-admin',
  name: 'Sarah Connor (Admin)',
  email: 'admin@shopcart.com',
  avatar: 'SC',
  role: 'admin',
  emailConfirmed: true,
  phone: '+91 94966 60968',
  address: {
    street: 'Shopcart Hub, Bypass Road',
    city: 'Kondotty, Malappuram',
    state: 'Kerala',
    zipCode: '673638',
    country: 'India',
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSupabase = isSupabaseConfigured();

  const [user, setUser] = useState<User | null>(() => {
    if (isSupabase) {
      // Never hydrate auth session or role from localStorage when Supabase Auth is active
      try {
        localStorage.removeItem('shopcart_user');
      } catch {
        // Ignore storage errors
      }
      return null;
    }
    try {
      const saved = localStorage.getItem('shopcart_user');
      if (!saved) return null;
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      return hash.includes('type=recovery') || hash.includes('reset-password');
    }
    return false;
  });

  // Verify and sync user profile with Supabase
  const syncSupabaseUser = useCallback(async (authUser: any): Promise<User | null> => {
    if (!authUser) {
      setUser(null);
      return null;
    }

    try {
      // 1. Fetch authoritative DB profile from public.profiles
      const profile = await fetchCustomerProfile(authUser.id);
      const isConfirmed = !!(authUser.email_confirmed_at || authUser.confirmed_at);

      if (profile) {
        const enrichedUser: User = {
          ...profile,
          emailConfirmed: isConfirmed,
        };
        setUser(enrichedUser);
        return enrichedUser;
      }

      // 2. Check whether profile row is genuinely missing vs transient query error
      const { data: existingRow, error: checkErr } = await supabase
        .from('profiles')
        .select('id, role, email, full_name, avatar_url')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!checkErr && existingRow) {
        const recoveredUser: User = {
          id: existingRow.id,
          name: existingRow.full_name || existingRow.email?.split('@')[0] || 'User',
          email: existingRow.email || authUser.email || '',
          avatar: existingRow.avatar_url || (authUser.email || 'EM').substring(0, 2).toUpperCase(),
          role: String(existingRow.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'customer',
          emailConfirmed: isConfirmed,
        };
        setUser(recoveredUser);
        return recoveredUser;
      }

      const fallbackUser: User = {
        id: authUser.id,
        name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Customer',
        email: authUser.email || '',
        avatar: (authUser.email || 'EM').substring(0, 2).toUpperCase(),
        role: 'customer',
        emailConfirmed: isConfirmed,
      };

      // Only attempt insert if row genuinely does not exist yet (never upsert over existing role)
      if (!checkErr && !existingRow) {
        try {
          await supabase.from('profiles').insert({
            id: authUser.id,
            email: authUser.email,
            full_name: fallbackUser.name,
            role: 'customer',
            avatar_url: fallbackUser.avatar,
          });
        } catch {
          // Non-fatal if insert fails
        }
      }

      setUser(fallbackUser);
      return fallbackUser;
    } catch (err) {
      console.warn('Error syncing Supabase user:', err);
      return null;
    }
  }, []);

  // Check initial session & subscribe to auth changes
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (!isSupabase) {
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) {
          console.warn('Supabase getSession error:', sessionErr.message);
        }

        if (!session) {
          if (mounted) setUser(null);
          return;
        }

        // Validate session against Supabase Auth server (refreshing if near expiry)
        let activeUser = session.user;
        const nowSec = Math.floor(Date.now() / 1000);
        const expiresAt = typeof session.expires_at === 'number' ? session.expires_at : 0;
        if (expiresAt > 0 && expiresAt - nowSec < 60) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed?.session?.user) {
            activeUser = refreshed.session.user;
          }
        }

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user) {
          console.warn('Supabase getUser verification failed:', userErr?.message || 'No active user');
          if (mounted) setUser(null);
          return;
        }

        activeUser = userData.user;
        if (activeUser && mounted) {
          await syncSupabaseUser(activeUser);
        }
      } catch (err) {
        console.warn('Exception during initAuth:', err);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    if (isSupabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        } else if (
          event === 'SIGNED_IN' ||
          event === 'USER_UPDATED' ||
          event === 'TOKEN_REFRESHED'
        ) {
          if (session?.user) {
            await syncSupabaseUser(session.user);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });

      return () => {
        mounted = false;
        authListener.subscription.unsubscribe();
      };
    }
  }, [isSupabase, syncSupabaseUser]);

  // Persist non-Supabase local preview state only; when Supabase is active, session lives in Supabase Auth
  useEffect(() => {
    try {
      if (isSupabase) {
        localStorage.removeItem('shopcart_user');
        return;
      }
      if (user) {
        localStorage.setItem('shopcart_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('shopcart_user');
      }
    } catch (e) {
      console.warn('Storage error', e);
    }
  }, [user, isSupabase]);

  // Login handler
  const login = async (
    email: string,
    password = 'Password123!'
  ): Promise<{ success: boolean; message?: string; needsEmailVerification?: boolean }> => {
    if (isSupabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          const isEmailNotConfirmed =
            error.message.toLowerCase().includes('email not confirmed') ||
            error.message.toLowerCase().includes('not verified');

          return {
            success: false,
            message: error.message,
            needsEmailVerification: isEmailNotConfirmed,
          };
        }

        if (data.user) {
          await syncSupabaseUser(data.user);
          return { success: true };
        }
      } catch (err: any) {
        return { success: false, message: err.message || 'Login failed' };
      }
    }

    // Local fallback for quick preview if Supabase is not yet populated
    const fallbackUser: User = {
      id: 'usr-' + Math.random().toString(36).substring(2, 8),
      name: email.split('@')[0].replace('.', ' ').replace(/^./, (c) => c.toUpperCase()),
      email,
      avatar: email.substring(0, 2).toUpperCase(),
      role: email.toLowerCase().includes('admin') ? 'admin' : 'customer',
      emailConfirmed: true,
    };
    setUser(fallbackUser);
    return { success: true };
  };

  // Register handler
  const register = async (
    name: string,
    email: string,
    password = 'Password123!'
  ): Promise<{ success: boolean; message?: string; needsConfirmation?: boolean }> => {
    if (isSupabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (error) {
          return { success: false, message: error.message };
        }

        // If user returned without session, confirmation email was dispatched by Supabase
        const isAwaitingConfirmation = !data.session && !!data.user;

        if (data.user) {
          const registeredUser: User = {
            id: data.user.id,
            name: name.trim(),
            email: email.trim(),
            avatar: name.substring(0, 2).toUpperCase(),
            role: 'customer',
            emailConfirmed: !isAwaitingConfirmation,
          };

          // If session was granted immediately (auto-confirm enabled)
          if (data.session) {
            setUser(registeredUser);
          }

          return {
            success: true,
            needsConfirmation: isAwaitingConfirmation,
          };
        }
      } catch (err: any) {
        return { success: false, message: err.message || 'Registration failed' };
      }
    }

    // Local fallback
    const newUser: User = {
      id: 'usr-' + Math.random().toString(36).substring(2, 8),
      name: name.trim(),
      email: email.trim(),
      avatar: name.substring(0, 2).toUpperCase(),
      role: 'customer',
      emailConfirmed: true,
    };
    setUser(newUser);
    return { success: true, needsConfirmation: false };
  };

  // Logout handler
  const logout = async () => {
    if (isSupabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Error during Supabase signout:', err);
      }
    }
    setUser(null);
  };

  // Forgot password email request
  const forgotPassword = async (email: string): Promise<{ success: boolean; message?: string }> => {
    if (isSupabase) {
      try {
        const redirectUrl = `${window.location.origin}/#reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: redirectUrl,
        });

        if (error) {
          return { success: false, message: error.message };
        }
        return { success: true, message: 'Password recovery instructions sent to your email.' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Failed to send reset email' };
      }
    }

    // Local simulated
    return {
      success: true,
      message: 'Demo mode: A password recovery link would be sent to ' + email,
    };
  };

  // Update password (used during password recovery or from Account Security tab)
  const resetPassword = async (newPassword: string): Promise<{ success: boolean; message?: string }> => {
    if (isSupabase) {
      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          return { success: false, message: error.message };
        }

        setIsPasswordRecovery(false);
        return { success: true, message: 'Password updated successfully!' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Failed to update password' };
      }
    }

    // Local simulated
    setIsPasswordRecovery(false);
    return { success: true, message: 'Demo mode: Password updated successfully!' };
  };

  // Resend verification email
  const resendVerificationEmail = async (email: string): Promise<{ success: boolean; message?: string }> => {
    if (isSupabase) {
      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
        });

        if (error) {
          return { success: false, message: error.message };
        }
        return { success: true, message: 'Verification email has been resent.' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Failed to resend email' };
      }
    }

    return { success: true, message: 'Demo mode: Verification email dispatched.' };
  };

  // Customer profile management
  const updateProfile = async (updates: Partial<User>): Promise<{ success: boolean; message?: string }> => {
    if (!user) return { success: false, message: 'User not logged in' };

    if (isSupabase && !user.id.startsWith('usr-demo')) {
      const ok = await updateCustomerProfile(user.id, updates);
      if (!ok) {
        return { success: false, message: 'Failed to update profile in database' };
      }
    }

    setUser((prev) => (prev ? { ...prev, ...updates } : null));
    return { success: true, message: 'Profile updated successfully' };
  };

  const quickDemoLogin = (asAdmin = false) => {
    if (isSupabase && asAdmin) {
      return;
    }
    setUser(asAdmin ? DEMO_ADMIN : DEMO_CUSTOMER);
  };

  const refreshProfile = useCallback(async (authUserOverride?: any): Promise<User | null> => {
    if (!isSupabase) return user;

    if (authUserOverride) {
      return await syncSupabaseUser(authUserOverride);
    }

    const { data: userData } = await supabase.auth.getUser();
    const activeAuthUser = userData?.user;
    if (activeAuthUser) {
      return await syncSupabaseUser(activeAuthUser);
    }

    if (user && !user.id.startsWith('usr-demo')) {
      const p = await fetchCustomerProfile(user.id);
      if (p) {
        const nextUser = { ...user, ...p };
        setUser(nextUser);
        return nextUser;
      }
    }
    return null;
  }, [isSupabase, syncSupabaseUser, user]);

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
  };

  // Strict role check: user is admin only if role is verified 'admin' (and never a demo account when Supabase is live)
  const isAdmin = user?.role === 'admin' && (!isSupabase || !user.id.startsWith('usr-demo'));

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        isLoading,
        isPasswordRecovery,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword,
        resendVerificationEmail,
        updateProfile,
        quickDemoLogin,
        isSupabaseBackend: isSupabase,
        refreshProfile,
        clearPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
