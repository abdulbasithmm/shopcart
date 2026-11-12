import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  ShoppingBag,
  CheckCircle2,
  ShieldCheck,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import { PageView } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface RegisterPageProps {
  onNavigate: (page: PageView) => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const { register, resendVerificationEmail, isSupabaseBackend } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Email verification awaiting state
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  // Password strength meter
  const getPasswordStrength = () => {
    if (!password) return { score: 0, text: '', color: 'bg-slate-200' };
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { score: 1, text: 'Weak', color: 'bg-rose-500' };
    if (score === 2) return { score: 2, text: 'Medium', color: 'bg-amber-500' };
    return { score: 3, text: 'Strong', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName || !cleanEmail || !password.trim()) {
      showToast('Please fill out all registration fields', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (!agreeTerms) {
      showToast('Please accept the Terms of Service to continue', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await register(cleanName, cleanEmail, password);
      if (res.success) {
        if (res.needsConfirmation) {
          setRegisteredEmail(cleanEmail);
          setAwaitingVerification(true);
          showToast('Account created! Please verify your email.', 'info');
        } else {
          showToast(`Welcome to Shop Cart, ${cleanName.split(' ')[0]}!`, 'success');
          onNavigate('account');
        }
      } else {
        showToast(res.message || 'Registration failed. Please try again.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Registration failed. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setIsResending(true);
    try {
      const res = await resendVerificationEmail(registeredEmail);
      if (res.success) {
        setResendDone(true);
        showToast('Confirmation email resent!', 'success');
      } else {
        showToast(res.message || 'Failed to resend confirmation email', 'error');
      }
    } finally {
      setIsResending(false);
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
            {awaitingVerification ? 'Verify Your Email' : 'Create an Account'}
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed px-1">
            {awaitingVerification
              ? 'One last step to activate your full Shop Cart shopping experience.'
              : 'Join the Shop Cart membership for express delivery, order tracking, and rewards.'}
          </p>
        </div>

        {/* Awaiting Email Verification Screen */}
        {awaitingVerification ? (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-emerald-50 border-2 border-emerald-200 rounded-2xl flex items-center justify-center text-[#0b5c37] mx-auto shadow-xs">
              <Inbox className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-slate-900">Confirmation Link Sent!</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                We sent a verification link to{' '}
                <strong className="text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded break-all">{registeredEmail}</strong>.
                Please click the link inside to verify your email address.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70 text-left text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Next steps:</span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-1 text-slate-500 pl-1">
                <li>Check your inbox and spam/junk folder</li>
                <li>Click <strong>&ldquo;Confirm your email&rdquo;</strong> in the message</li>
                <li>Return here to sign in with your credentials</li>
              </ul>
            </div>

            {resendDone ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                New confirmation email dispatched to your inbox.
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="w-full min-h-[42px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isResending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Resending Link...</span>
                  </>
                ) : (
                  <span>Resend Confirmation Email</span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="w-full min-h-[46px] py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <span>Proceed to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Main Registration Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Full Legal Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. Jordan Hayes"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] py-2.5 pl-10 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37]"
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

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
                  placeholder="jordan@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] py-2.5 pl-10 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37]"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 6 characters"
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

              {/* Password strength bar */}
              {password && (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex gap-1 w-28">
                    <div className={`h-1.5 flex-1 rounded-full ${strength.score >= 1 ? strength.color : 'bg-slate-200'}`} />
                    <div className={`h-1.5 flex-1 rounded-full ${strength.score >= 2 ? strength.color : 'bg-slate-200'}`} />
                    <div className={`h-1.5 flex-1 rounded-full ${strength.score >= 3 ? strength.color : 'bg-slate-200'}`} />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">{strength.text}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[44px] py-2.5 pl-10 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="terms"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#0b5c37] focus:ring-[#0b5c37] accent-[#0b5c37] cursor-pointer"
              />
              <label htmlFor="terms" className="text-xs text-slate-600 leading-tight cursor-pointer py-0.5">
                I agree to the <span className="text-slate-900 font-semibold underline">Terms of Service</span> and <span className="text-slate-900 font-semibold underline">Privacy Policy</span>.
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[46px] py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              {isLoading ? (
                <span>Creating Account...</span>
              ) : (
                <>
                  <span>Complete Registration</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Login footer link */}
        {!awaitingVerification && (
          <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
            Already registered with Shop Cart?{' '}
            <button
              onClick={() => onNavigate('login')}
              className="text-[#0b5c37] font-bold hover:underline ml-1 cursor-pointer py-1 inline-block"
            >
              Sign In Here
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0b5c37] shrink-0" />
          <span>
            {isSupabaseBackend ? 'Synced with Supabase Auth & PostgreSQL Profiles' : 'Supabase Auth Ready'}
          </span>
        </div>
      </div>
    </div>
  );
};
