import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { PageView } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface LoginPageProps {
  onNavigate: (page: PageView) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, forgotPassword, resendVerificationEmail, isSupabaseBackend } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Unconfirmed email warning state
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Forgot password quick state
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnconfirmedEmail(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      showToast('Please enter your email and password', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(cleanEmail, password);
      if (res.success) {
        showToast('Welcome back to Shop Cart!', 'success');
        onNavigate('account');
      } else if (res.needsEmailVerification) {
        setUnconfirmedEmail(cleanEmail);
        showToast('Your email is not confirmed yet. Please check your inbox.', 'warning');
      } else {
        showToast(res.message || 'Login failed. Please check your credentials.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Login failed. Please check your credentials.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unconfirmedEmail) return;
    setIsResending(true);
    try {
      const res = await resendVerificationEmail(unconfirmedEmail);
      if (res.success) {
        setResendSuccess(true);
        showToast('Verification email resent! Check your inbox.', 'success');
      } else {
        showToast(res.message || 'Failed to resend verification', 'error');
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanResetEmail = resetEmail.trim();
    if (!cleanResetEmail) {
      showToast('Please enter your registered email address', 'error');
      return;
    }

    setIsSendingReset(true);
    try {
      const res = await forgotPassword(cleanResetEmail);
      if (res.success) {
        setResetEmailSent(true);
        showToast('Password recovery instructions sent!', 'success');
      } else {
        showToast(res.message || 'Failed to send recovery email', 'error');
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-3 sm:px-4 py-8 sm:py-12">
      <div className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-8 md:p-10 border border-slate-200/90 shadow-xl space-y-5 sm:space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div
            onClick={() => onNavigate('home')}
            className="cursor-pointer inline-flex items-center gap-2 group mb-1"
          >
            <div className="w-10 h-10 rounded-2xl bg-[#0b5c37] flex items-center justify-center text-white shadow-md shadow-emerald-900/10">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Shop<span className="text-[#0b5c37]">cart</span>
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {isForgotPasswordMode ? 'Reset Your Password' : 'Sign in to Shop Cart'}
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed px-1">
            {isForgotPasswordMode
              ? 'Enter your registered email address and we will dispatch a password recovery link.'
              : 'Access your saved addresses, track ongoing orders, and view member rewards.'}
          </p>
        </div>

        {/* Unconfirmed Email Alert */}
        {unconfirmedEmail && (
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs space-y-2.5">
            <div className="flex items-start gap-2.5 text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Email Verification Required</p>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  We sent a confirmation link to <span className="font-semibold break-all">{unconfirmedEmail}</span>. Please verify your address before signing in.
                </p>
              </div>
            </div>
            {resendSuccess ? (
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px] bg-emerald-100/70 p-2 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Verification email resent! Please check your spam folder if not found.</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResending}
                className="w-full min-h-[40px] py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 text-xs cursor-pointer active:scale-[0.98]"
              >
                {isResending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Resending Link...</span>
                  </>
                ) : (
                  <span>Resend Verification Email</span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Forgot Password Flow */}
        {isForgotPasswordMode ? (
          <div className="space-y-4">
            {resetEmailSent ? (
              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-950">Recovery Link Sent</h3>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    Check your email inbox at <strong className="break-all">{resetEmail}</strong> for a link to securely reset your password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordMode(false);
                    setResetEmailSent(false);
                  }}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="you@example.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full min-h-[44px] py-2.5 pl-10 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37]"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsForgotPasswordMode(false)}
                    className="flex-1 min-h-[44px] py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingReset}
                    className="flex-1 min-h-[44px] py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                  >
                    {isSendingReset ? (
                      <span>Sending Link...</span>
                    ) : (
                      <>
                        <span>Send Reset Link</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Main Sign In Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] py-2.5 pl-10 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37]"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setIsForgotPasswordMode(true);
                  }}
                  className="text-xs text-[#0b5c37] hover:underline font-semibold cursor-pointer py-0.5"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] py-2.5 pl-10 pr-11 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center pt-0.5">
              <label className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#0b5c37] focus:ring-[#0b5c37] accent-[#0b5c37] cursor-pointer"
                />
                <span>Remember this session</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[46px] py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              {isLoading ? (
                <span>Signing In...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Register footer link */}
        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          Don&apos;t have a Shop Cart account?{' '}
          <button
            onClick={() => onNavigate('register')}
            className="text-[#0b5c37] font-bold hover:underline ml-1 cursor-pointer py-1 inline-block"
          >
            Create an Account
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0b5c37] shrink-0" />
          <span>
            {isSupabaseBackend ? 'Protected by Supabase Auth & PostgreSQL RLS' : 'Supabase Auth Ready'}
          </span>
        </div>
      </div>
    </div>
  );
};
