import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldAlert,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { PageView } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { verifyUserRole } from '../services/profileService';

interface AdminLoginPageProps {
  onNavigate: (page: PageView) => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onNavigate }) => {
  const { user, isAdmin, isLoading: authLoading, quickDemoLogin, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // If already authenticated with admin role, automatically transition to dashboard
  React.useEffect(() => {
    if (!authLoading && user && (isAdmin || user.role === 'admin')) {
      onNavigate('admin');
    }
  }, [authLoading, user, isAdmin, onNavigate]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setEmailError(null);
    setPasswordError(null);

    const trimmedEmail = email.trim();
    let hasValidationError = false;

    // Email format validation
    if (!trimmedEmail) {
      setEmailError('Administrator email is required');
      hasValidationError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address (e.g. admin@shopcart.com)');
      hasValidationError = true;
    }

    // Password validation
    if (!password) {
      setPasswordError('Password is required');
      hasValidationError = true;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      hasValidationError = true;
    }

    if (hasValidationError) {
      showToast('Please correct the validation errors below', 'error');
      return;
    }

    setIsLoading(true);
    setLoadingStep('Authenticating with Supabase Auth...');

    try {
      if (isSupabaseConfigured()) {
        // 1. Authenticate credentials against Supabase Auth (Requirement 4)
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          let userFriendlyMessage = error.message;
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            userFriendlyMessage = 'Invalid administrator email or password. Please verify your credentials.';
          } else if (error.message.toLowerCase().includes('email not confirmed')) {
            userFriendlyMessage = 'Administrator email is not confirmed. Please verify your email inbox.';
          }
          setErrorMessage(userFriendlyMessage);
          showToast(userFriendlyMessage, 'error');
          setIsLoading(false);
          return;
        }

        if (data.user) {
          // 2. Strictly verify administrative authorization from public.profiles table (Requirement 5 & 6)
          setLoadingStep('Verifying role in public.profiles table...');
          const role = await verifyUserRole(data.user.id);

          if (role !== 'admin') {
            // Strictly revoke session from admin context & redirect customer away (Requirement 6 & 7)
            await supabase.auth.signOut();
            const msg = 'Unauthorized Access: Your account is registered as a customer in public.profiles. Only users with role = "admin" can access /admin/dashboard.';
            setErrorMessage(msg);
            showToast(msg, 'error');
            setIsLoading(false);
            onNavigate('access-denied');
            return;
          }

          // 3. User confirmed as admin -> allow access to /admin/dashboard
          setLoadingStep('Access Granted. Loading Admin Dashboard...');
          await refreshProfile();
          showToast(`Welcome back to Shop Cart Admin Console!`, 'success');
          onNavigate('admin');
        }
      } else {
        // Local preview simulation
        if (trimmedEmail.toLowerCase().includes('admin')) {
          quickDemoLogin(true);
          showToast('Logged in as Administrator (Sarah Connor)', 'success');
          onNavigate('admin');
        } else {
          setErrorMessage('Unauthorized Access: Only administrator accounts can sign in here. For testing, use admin@shopcart.com or the 1-Click Demo Admin button.');
          showToast('Customer account rejected from admin dashboard', 'error');
          onNavigate('access-denied');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed');
      showToast(err.message || 'Authentication error', 'error');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100 selection:bg-[#0b5c37] selection:text-white relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#0b5c37]/10 via-purple-600/10 to-emerald-600/10 blur-3xl pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0b5c37] to-emerald-800 text-white shadow-xl shadow-emerald-900/20 border border-emerald-600/30">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div>
            <div className="flex items-center justify-center">
              <span className="text-2xl font-black text-white tracking-tight">
                Shop<span className="text-[#0b5c37]">cart</span>
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-2">Admin Dashboard Login</h1>
          </div>
        </div>

        {/* Login Card */}
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/70 border border-rose-500/40 rounded-2xl flex items-start gap-3 text-xs text-rose-200 animate-in fade-in duration-200">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-100">Security &amp; Authorization Alert</p>
                <p className="text-[11px] text-rose-300 mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Admin Sign In Form */}
          <form onSubmit={handleAdminLogin} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Administrator Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="admin@shopcart.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  className={`w-full py-2.5 pl-9 pr-3 text-xs bg-slate-950 text-white border rounded-xl focus:outline-none transition-colors font-mono ${
                    emailError
                      ? 'border-rose-500 focus:ring-1 focus:ring-rose-500'
                      : 'border-slate-800 focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37]'
                  } placeholder:text-slate-600`}
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {emailError && (
                <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300">Administrator Password</label>
                <span className="text-[10px] text-slate-500 font-mono">256-bit BCrypt</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  className={`w-full py-2.5 pl-9 pr-10 text-xs bg-slate-950 text-white border rounded-xl focus:outline-none transition-colors font-mono ${
                    passwordError
                      ? 'border-rose-500 focus:ring-1 focus:ring-rose-500'
                      : 'border-slate-800 focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37]'
                  } placeholder:text-slate-600`}
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && (
                <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            {/* Login Button with loading state (Requirement 3) */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-[#0b5c37] to-emerald-700 hover:from-[#08482b] hover:to-emerald-600 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-900/15 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{loadingStep || 'Verifying Credentials...'}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Log In to Admin Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Return to Storefront */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Customer Storefront</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
