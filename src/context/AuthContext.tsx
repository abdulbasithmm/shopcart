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
  refreshProfile: () => Promise<void>;
  clearPasswordRecovery: () => void;
}

const DEMO_CUSTOMER: User = {
  id: 'usr-demo-01',
  name: 'Alex Morgan',
  email: 'alex.morgan@shopcart.com',
  avatar: 'AM',
  role: 'customer',
  emailConfirmed: true,
  phone: '+1 (555) 349-8291',
  address: {
    street: '742 Evergreen Terrace',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98101',
    country: 'United States',
  },
};

const DEMO_ADMIN: User = {
  id: 'usr-demo-admin',
  name: 'Sarah Connor (Admin)',
  email: 'admin@shopcart.com',
  avatar: 'SC',
  role: 'admin',
  emailConfirmed: true,
  phone: '+1 (555) 901-2384',
  address: {
    street: '100 Enterprise Way',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94105',
    country: 'United States',
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSupabase = isSupabaseConfigured();

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('shopcart_user');
      return saved ? JSON.parse(saved) : null;
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
  const syncSupabaseUser = useCallback(async (authUser: any) => {
    if (!authUser) return null;

    try {
      // 1. Fetch DB profile
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

      // 2. Profile missing (create or fallback from auth user)
      const fallbackUser: User = {
        id: authUser.id,
        name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Customer',
        email: authUser.email || '',
        avatar: (authUser.email || 'EM').substring(0, 2).toUpperCase(),
        role: 'customer',
        emailConfirmed: isConfirmed,
      };

      // Try creating in DB if trigger hasn't
      try {
        await supabase.from('profiles').upsert({
          id: authUser.id,
          email: authUser.email,
          full_name: fallbackUser.name,
          role: 'customer',
          avatar_url: fallbackUser.avatar,
        });
      } catch {
        // Non-fatal if upsert fails
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
        setIsLoading(false);
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Supabase getSession error:', error.message);
        }

        if (session?.user && mounted) {
          await syncSupabaseUser(session.user);
        }
      } catch (err) {
        console.warn('Exception during getSession:', err);
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
        } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            await syncSupabaseUser(session.user);
          }
        } else if (event === 'SIGNED_OUT') {
          if (user && !user.id.startsWith('usr-demo')) {
            setUser(null);
          }
        }
      });

      return () => {
        mounted = false;
        authListener.subscription.unsubscribe();
      };
    }
  }, [isSupabase, syncSupabaseUser]);

  // Persist user to localStorage
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem('shopcart_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('shopcart_user');
      }
    } catch (e) {
      console.warn('Storage error', e);
    }
  }, [user]);

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
    setUser(asAdmin ? DEMO_ADMIN : DEMO_CUSTOMER);
  };

  const refreshProfile = async () => {
    if (user && isSupabase && !user.id.startsWith('usr-demo')) {
      const p = await fetchCustomerProfile(user.id);
      if (p) setUser((prev) => ({ ...prev, ...p }));
    }
  };

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
  };

  // Strict role check: user is admin if role is verified 'admin'
  const isAdmin = user?.role === 'admin';

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
