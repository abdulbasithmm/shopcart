import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  X,
  RefreshCw,
  Server,
  Lock,
  Layers,
  ShoppingBag,
  Users,
  ShieldCheck,
  ArrowRight,
  MessageSquare
} from 'lucide-react';
import {
  isSupabaseConfigured,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  setRuntimeSupabaseConfig,
  clearRuntimeSupabaseConfig,
  supabase
} from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

interface SupabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseStatusModal: React.FC<SupabaseStatusModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [urlInput, setUrlInput] = useState(SUPABASE_URL || '');
  const [keyInput, setKeyInput] = useState(SUPABASE_ANON_KEY || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'connection' | 'tables' | 'auth' | 'sql'>('connection');

  const isConnected = isSupabaseConfigured();

  useEffect(() => {
    if (isOpen && isConnected) {
      testCurrentConnection();
    }
  }, [isOpen]);

  const testCurrentConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.from('products').select('count', { count: 'exact', head: true });
      if (error) {
        setTestResult({
          success: false,
          message: `Connection error: ${error.message}. Please verify table schema and RLS policies.`,
        });
      } else {
        setTestResult({
          success: true,
          message: `Successfully connected to Supabase! PostgreSQL database is live and operational.`,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to ping Supabase.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !keyInput.trim()) {
      showToast('Please enter both Supabase URL and Anon Key', 'error');
      return;
    }
    if (!urlInput.startsWith('http')) {
      showToast('Supabase URL must start with https://', 'error');
      return;
    }
    setRuntimeSupabaseConfig(urlInput.trim(), keyInput.trim());
    showToast('Supabase credentials saved! Connecting...', 'success');
  };

  const handleDisconnect = () => {
    clearRuntimeSupabaseConfig();
    setUrlInput('');
    setKeyInput('');
    showToast('Reset to local demo mode', 'info');
  };

  const handleCopySqlScript = async () => {
    try {
      const response = await fetch('/supabase/schema.sql');
      let sqlText = '';
      if (response.ok) {
        sqlText = await response.text();
      } else {
        sqlText = `-- Please inspect the /supabase/schema.sql file in your project repository.`;
      }
      await navigator.clipboard.writeText(sqlText);
      setCopiedSql(true);
      showToast('Schema SQL copied to clipboard! Paste into Supabase SQL Editor.', 'success');
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      showToast('Failed to read SQL file. You can find it at supabase/schema.sql', 'warning');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0b5c37] flex items-center justify-center text-white shadow-md">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Supabase Backend Manager</h2>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-700/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-700/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Demo Fallback
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">PostgreSQL Database, Auth, Cart Sync & RLS Architecture</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('connection')}
            className={`pb-2.5 px-1 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'connection'
                ? 'border-[#0b5c37] text-[#0b5c37]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Connection Setup
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`pb-2.5 px-1 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'tables'
                ? 'border-[#0b5c37] text-[#0b5c37]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Database Tables & RLS
          </button>
          <button
            onClick={() => setActiveTab('auth')}
            className={`pb-2.5 px-1 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'auth'
                ? 'border-[#0b5c37] text-[#0b5c37]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Auth &amp; RBAC Security
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-2.5 px-1 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'sql'
                ? 'border-[#0b5c37] text-[#0b5c37]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Migration SQL
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'connection' && (
            <div className="space-y-5">
              {/* Status Box */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isConnected
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50/70 border-amber-200 text-amber-950'
                }`}
              >
                {isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-1">
                  <p className="font-bold">
                    {isConnected ? 'Supabase Connection Active' : 'Operating in Safe Demo Fallback Mode'}
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    {isConnected
                      ? 'The app is configured to communicate with your remote Supabase PostgreSQL database. Products, shopping cart syncing, customer profiles, and checkout orders flow directly to PostgreSQL.'
                      : 'You are currently using local storage and demo catalog. You can paste your Supabase Project URL and Anon Key below or add them to your .env file to enable live database persistence.'}
                  </p>
                </div>
              </div>

              {/* Ping / Test status */}
              {isConnected && (
                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-xs">
                    <span className="font-semibold text-slate-700">Live Status Check: </span>
                    {testing ? (
                      <span className="text-slate-500 italic">Pinging database...</span>
                    ) : testResult ? (
                      <span className={testResult.success ? 'text-emerald-700 font-medium' : 'text-rose-600 font-medium'}>
                        {testResult.message}
                      </span>
                    ) : (
                      <span className="text-slate-500">Ready to test connection</span>
                    )}
                  </div>
                  <button
                    onClick={testCurrentConnection}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                    Test Ping
                  </button>
                </div>
              )}

              {/* Credentials Form */}
              <form onSubmit={handleSaveConnection} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://xyzcompany.supabase.co"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-[#0b5c37] font-mono"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Found in your Supabase Dashboard under <strong>Project Settings &gt; API &gt; Project URL</strong>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Supabase Anon Public Key
                  </label>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-[#0b5c37] font-mono"
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Found under <strong>Project Settings &gt; API &gt; anon public</strong>.
                    </span>
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> RLS Protected
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Save &amp; Connect Live
                  </button>
                  {isConnected && (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-4 py-2.5 border border-slate-300 hover:bg-rose-50 hover:text-rose-700 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Clear Credentials (Demo Mode)
                    </button>
                  )}
                </div>
              </form>

              {/* Quick 3-Step Setup helper */}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-800 mb-2">3-Step Supabase Setup:</h4>
                <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
                  <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-[#0b5c37] hover:underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li>Copy and run the SQL from the <strong>Migration SQL</strong> tab in your Supabase SQL Editor.</li>
                  <li>Copy your <strong>URL</strong> and <strong>anon key</strong> from Project Settings &gt; API, and paste them above.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600">
                All 11 required tables and atomic functions have been generated with Row Level Security (RLS) policies enabled.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <ShoppingBag className="w-4 h-4 text-[#0b5c37]" />
                    products &amp; categories
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Contains all catalog items, specs, variants, and categories. Public read-only for active items; admin write.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Layers className="w-4 h-4 text-blue-600" />
                    inventory
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Tracks real-time stock counts. Updated via atomic PostgreSQL procedure <code className="text-[#08482b]">deduct_product_inventory</code>.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Users className="w-4 h-4 text-emerald-600" />
                    profiles &amp; auth
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Auto-created on user registration via PostgreSQL trigger <code className="text-[#08482b]">handle_new_user</code>. Customer-only access.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <ShoppingBag className="w-4 h-4 text-violet-600" />
                    carts &amp; cart_items
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Persists active cart and saved-for-later items for authenticated users across multiple devices.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    orders, order_items &amp; payment_records
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Creates order record, itemized pricing snapshots, and payment verification records during checkout. RLS restricts access to customer's own orders.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <MessageSquare className="w-4 h-4 text-[#0b5c37]" />
                    reviews (Product Reviews &amp; Ratings)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Stores authenticated customer reviews (1–5 stars), verified purchase badges, review comments, and helpful votes in Supabase. Public read; authenticated customer submit.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-500">
                  <Lock className="w-3.5 h-3.5" /> Row Level Security (RLS) Guarantee
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Every table has RLS enforced: Customers can only query and mutate their own profile, cart, and orders. The secret <code className="text-emerald-400">service_role</code> key is never exposed in the browser frontend.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'auth' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-[#0b5c37]" />
                  <span>Supabase Authentication &amp; RBAC Architecture</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Shop Cart integrates native Supabase Auth for Customer Registration, Password Sign-In, Password Recovery, and Email Verification. All authenticated identities are bound to the <code className="bg-slate-200 px-1 rounded font-mono">public.profiles</code> table via trigger.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Auth Features Supported</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Customer Registration (Email + Password)</span>
                  </div>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Secure Sign In &amp; Session Management</span>
                  </div>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Email Verification &amp; Resend Link</span>
                  </div>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Forgot &amp; Reset Password Flows</span>
                  </div>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Customer Profile &amp; Shipping Address Sync</span>
                  </div>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Server-Side Database Role Enforcement (RBAC)</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2 text-xs">
                <div className="font-bold text-purple-950 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-700" />
                  <span>How to Promote an Account to Administrator in Supabase</span>
                </div>
                <p className="text-[11px] text-purple-900 leading-relaxed">
                  Run this SQL snippet in the Supabase SQL Editor to grant admin privileges to your email address:
                </p>
                <div className="bg-slate-950 text-purple-300 font-mono text-[11px] p-2.5 rounded-lg border border-purple-300/30 overflow-x-auto">
                  UPDATE public.profiles SET role = &apos;admin&apos; WHERE email = &apos;your-email@example.com&apos;;
                </div>
                <p className="text-[10px] text-purple-700">
                  Non-admin customers are blocked by <code className="font-bold">AdminGuard</code> from accessing administrative pages even if they manipulate URLs or frontend state.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  Copy this SQL script and execute it in your Supabase SQL Editor.
                </p>
                <button
                  onClick={handleCopySqlScript}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'Copied to Clipboard!' : 'Copy SQL Script'}
                </button>
              </div>

              <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-[11px] max-h-72 overflow-y-auto border border-slate-800">
                <pre className="whitespace-pre-wrap">
{`-- SHOPCART POSTGRESQL SCHEMA MIGRATION
-- Found in /supabase/schema.sql

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS public.categories (...);

-- 2. Create products table
CREATE TABLE IF NOT EXISTS public.products (...);

-- 3. Create inventory table
CREATE TABLE IF NOT EXISTS public.inventory (...);

-- 4. Create customer profiles table
CREATE TABLE IF NOT EXISTS public.profiles (...);

-- 5. Create carts and cart_items
CREATE TABLE IF NOT EXISTS public.carts (...);
CREATE TABLE IF NOT EXISTS public.cart_items (...);

-- 6. Create orders, order_items, payment_records
CREATE TABLE IF NOT EXISTS public.orders (...);
CREATE TABLE IF NOT EXISTS public.order_items (...);
CREATE TABLE IF NOT EXISTS public.payment_records (...);

-- 7. Atomic safe inventory deduction procedure
CREATE OR REPLACE FUNCTION public.deduct_product_inventory(...) ...;

-- 8. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
...
-- 9. Includes 14 sample products and category seed data.`}
                </pre>
              </div>
              <p className="text-[11px] text-slate-500">
                You can also open the file directly at <code>/supabase/schema.sql</code>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span>Supabase PostgreSQL v15+</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
