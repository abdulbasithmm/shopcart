import React from 'react';
import {
  ShieldAlert,
  Lock,
  ArrowLeft,
  LogOut,
  Key,
  ShoppingBag,
  User,
  Database,
  ArrowRight,
} from 'lucide-react';
import { PageView } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isSupabaseConfigured } from '../lib/supabase';

interface AccessDeniedPageProps {
  onNavigate: (page: PageView) => void;
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, logout, quickDemoLogin } = useAuth();
  const { showToast } = useToast();

  const handleSignOut = async () => {
    try {
      await logout();
      showToast('Successfully signed out of session.', 'info');
      onNavigate('admin-login');
    } catch (err: any) {
      showToast(err.message || 'Error signing out', 'error');
    }
  };

  const handleDemoAdmin = () => {
    quickDemoLogin(true);
    showToast('Authenticated as Administrator (Sarah Connor)', 'success');
    onNavigate('admin');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-slate-100 selection:bg-rose-600 selection:text-white relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-rose-600/15 via-emerald-600/10 to-emerald-700/5 blur-3xl pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-lg relative z-10">
        {/* Brand & Security Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-500 shadow-xl shadow-rose-500/10">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-black text-white tracking-tight">
                Shop<span className="text-[#0b5c37]">cart</span>
              </span>
              <span className="text-xs uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                Unauthorized Access
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">Unauthorized Access</h1>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Administrator clearance required. Your credentials do not grant access to the back-office merchant console.
            </p>
          </div>
        </div>

        {/* Security Audit Card */}
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Security Status Box */}
          <div className="p-4 bg-rose-950/40 border border-rose-800/40 rounded-2xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-rose-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>Verification State</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 uppercase">
                Permission Rejected
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-rose-900/30">
              <div>
                <span className="text-[11px] text-slate-400 block">Current Account:</span>
                <span className="font-semibold text-slate-200 truncate block mt-0.5">
                  {user?.email || 'Unauthenticated Guest'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Database Role:</span>
                <span className="font-mono font-bold text-rose-400 block mt-0.5">
                  {user?.role ? user.role.toUpperCase() : 'NONE'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
              {user?.role === 'customer'
                ? 'This account is registered with customer privileges. Only accounts with verified role = "admin" in public.profiles can access order fulfillment, pricing, and analytics.'
                : 'No active administrative session was found. Please authenticate with administrator credentials.'}
            </p>
          </div>

          {/* Database & RLS Enforcement Info */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Database className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Database-Level Row Level Security (RLS)</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Row-Level Security policies in PostgreSQL actively isolate customer records. Client-side URL tampering or localStorage modifications cannot bypass database authorization functions ({' '}
              <code className="text-emerald-400 font-mono text-[10px]">is_admin()</code>).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('admin-login')}
              className="w-full py-3 bg-gradient-to-r from-[#0b5c37] to-emerald-700 hover:from-[#08482b] hover:to-emerald-600 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-900/15 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Sign In with Administrator Account</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {isAuthenticated && (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Sign Out of Current Account</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="py-2.5 px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-slate-800 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                <span>Store Homepage</span>
              </button>

              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => onNavigate('account')}
                  className="py-2.5 px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-slate-800 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span>My Account</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="py-2.5 px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-slate-800 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Customer Login</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
