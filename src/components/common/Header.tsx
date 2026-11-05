import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  ShoppingCart,
  User as UserIcon,
  Heart,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Package,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Laptop,
  Shirt,
  Home,
  Database,
  ArrowRight,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { PageView } from '../../types';
import { PRODUCTS, CATEGORIES } from '../../data/mockData';
import { isSupabaseConfigured } from '../../lib/supabase';
import { AmazonLogo } from './AmazonLogo';
import { formatPrice } from '../../utils/format';

interface HeaderProps {
  currentPage: PageView;
  onNavigate: (page: PageView, params?: { productId?: string; category?: string; query?: string; tab?: string }) => void;
  onSearch: (query: string, category: string) => void;
  onOpenSupabaseModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  onSearch,
  onOpenSupabaseModal,
}) => {
  const { cartCount, setIsCartDrawerOpen, wishlist } = useCart();
  const { user, isAuthenticated, logout } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery.trim(), selectedCategory);
    setIsSearchFocused(false);
    onNavigate('shop', { query: searchQuery.trim(), category: selectedCategory });
  };

  const filteredSuggestions = searchQuery.trim()
    ? PRODUCTS.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.brand.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* 1. TOP ANNOUNCEMENT BAR (DARK GREEN MATCHING SCREENSHOT) */}
      <div className="bg-[#093d22] text-white text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-4 font-medium">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
            <span className="text-xs sm:text-sm shrink-0">🌱</span>
            <span className="tracking-wide truncate text-[10px] sm:text-xs">
              Summer Sale: Up to 50% Off on Top Brands | Limited Time Offer!
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-auto">
            {/* Database status indicator badge */}
            <button
              onClick={() => onOpenSupabaseModal?.()}
              className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold tracking-wider uppercase border cursor-pointer transition-all ${
                isSupabaseConfigured()
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900 shadow-xs'
                  : 'bg-amber-950/90 text-amber-300 border-amber-500/50 hover:bg-amber-900 shadow-xs'
              }`}
              title="Click to view database connection status and enter Supabase credentials"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="hidden sm:inline">{isSupabaseConfigured() ? 'LIVE SUPABASE' : 'LOCAL STORAGE FALLBACK'}</span>
              <span className="sm:hidden">{isSupabaseConfigured() ? 'LIVE' : 'FALLBACK'}</span>
            </button>

            <button
              onClick={() => onNavigate('shop')}
              className="px-2.5 sm:px-3.5 py-0.5 sm:py-1 bg-white hover:bg-slate-100 text-[#093d22] text-[10px] sm:text-[11px] font-bold rounded-md shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              Shop Now
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN HEADER BAR (CRISP WHITE AMAZON STYLE - FULLY RESPONSIVE) */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-6">
          {/* Top Row on Mobile: Hamburger + Logo on left, User Actions on right */}
          <div className="flex items-center justify-between w-full md:w-auto gap-2">
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-slate-800 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
                aria-label="Toggle navigation"
              >
                <Menu className="w-6 h-6 stroke-[2]" />
              </button>

              {/* Amazon Logo with Smile */}
              <div onClick={() => onNavigate('home')}>
                <AmazonLogo variant="dark" size="md" />
              </div>
            </div>

            {/* Mobile Actions: Account + Cart (visible on mobile, hidden on md+) */}
            <div className="flex items-center gap-1 sm:gap-2 md:hidden text-slate-800">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="px-2 py-1.5 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-900 flex items-center gap-1 min-h-[40px] cursor-pointer"
                aria-label="Account menu"
              >
                <span className="text-[11px] font-semibold text-slate-700 max-w-[80px] truncate">
                  {isAuthenticated && user ? user.name.split(' ')[0] : 'Sign in'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>

              <button
                onClick={() => setIsCartDrawerOpen(true)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer relative min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Shopping Cart"
              >
                <div className="relative">
                  <ShoppingCart className="w-6 h-6 stroke-[2] text-slate-900" />
                  <span className="absolute -top-1.5 -right-2 bg-[#0b5c37] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Center Search Bar: Full width on mobile (< md), flex-1 on tablet & desktop (md+) */}
          <div ref={searchContainerRef} className="w-full md:flex-1 md:max-w-2xl relative">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              {/* Category selector on left (hidden on small screens, shown on md+) */}
              <div className="relative hidden md:block">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-[#f3f4f6] hover:bg-[#e5e7eb] text-xs font-semibold text-slate-700 pl-3 pr-6 py-2.5 rounded-l-md border border-r-0 border-slate-300 focus:outline-none appearance-none cursor-pointer transition-colors"
                >
                  <option value="all">All</option>
                  <option value="Mobiles">Mobiles</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Fashion">Fashion</option>
                  <option value="Home & Kitchen">Home & Kitchen</option>
                  <option value="Beauty">Beauty</option>
                  <option value="Toys & Games">Toys & Games</option>
                  <option value="Sports">Sports</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Search input field */}
              <input
                type="text"
                placeholder="Search Shop Cart"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                onFocus={() => setIsSearchFocused(true)}
                className="w-full py-2 sm:py-2.5 px-3.5 text-xs sm:text-sm bg-white text-slate-900 placeholder:text-slate-500 border border-slate-300 focus:outline-none focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] md:rounded-l-none rounded-l-md transition-all min-h-[40px]"
              />

              {/* Dark Forest Green Search Button */}
              <button
                type="submit"
                className="p-2 sm:p-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded-r-md border border-[#0b5c37] transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-xs min-h-[40px] min-w-[42px]"
                title="Search"
              >
                <Search className="w-4 h-4 stroke-[2.5]" />
              </button>
            </form>

            {/* Autocomplete dropdown suggestions */}
            {isSearchFocused && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50 max-h-72 overflow-y-auto">
                <div className="p-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                  Quick Matching Suggestions
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredSuggestions.map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => {
                        onNavigate('product', { productId: prod.id });
                        setIsSearchFocused(false);
                      }}
                      className="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">{prod.name}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">in {prod.category}</span>
                      </div>
                      <span className="text-xs font-bold text-[#0b5c37] tabular-nums shrink-0">
                        {formatPrice(prod.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Right Action Cluster: Flag, Account, Orders, Cart (shown on md+) */}
          <div className="hidden md:flex items-center gap-2 sm:gap-4 shrink-0 text-slate-800">
            {/* Language / Country Selector: Indian Flag EN */}
            <div className="relative hidden lg:block">
              <button
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="flex items-center gap-1.5 p-1.5 hover:bg-slate-100 rounded-md transition-colors cursor-pointer text-xs font-bold"
              >
                <span className="text-base" role="img" aria-label="India flag">🇮🇳</span>
                <span>EN</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>
            </div>

            {/* Hello, Sign in / Account & Lists */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="text-left px-2 py-1 hover:bg-slate-100 rounded-md transition-colors cursor-pointer flex flex-col justify-center leading-tight"
              >
                <span className="text-[10px] text-slate-500 font-normal">
                  {isAuthenticated && user ? `Hello, ${user.name.split(' ')[0]}` : 'Hello, Sign in'}
                </span>
                <span className="text-xs font-bold text-slate-900 flex items-center gap-0.5">
                  <span>Account &amp; Lists</span>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </span>
              </button>

              {/* User Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-24px)] bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in-50 duration-150 text-slate-800">
                  {!isAuthenticated ? (
                    <div className="pb-3 border-b border-slate-100 text-center">
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('login');
                        }}
                        className="w-full py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                      >
                        Sign in
                      </button>
                      <p className="text-[11px] text-slate-500 mt-2">
                        New customer?{' '}
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onNavigate('register');
                          }}
                          className="text-[#0b5c37] font-semibold hover:underline cursor-pointer"
                        >
                          Start here.
                        </button>
                      </p>
                    </div>
                  ) : (
                    <div className="pb-3 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-900">{user?.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                    </div>
                  )}

                  <div className="py-2 space-y-1 text-xs">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('account');
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-md font-medium text-slate-700 hover:text-slate-900"
                    >
                      Your Account
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('account');
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-md font-medium text-slate-700 hover:text-slate-900"
                    >
                      Your Orders &amp; Tracking
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('account', { tab: 'wishlist' });
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-md font-medium text-slate-700 hover:text-slate-900 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                        <span>Your Wishlist</span>
                      </span>
                      {wishlist.length > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-600 rounded-full border border-rose-200">
                          {wishlist.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigate('admin-login');
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-md font-medium text-[#0b5c37] hover:text-[#08482b] flex items-center justify-between"
                    >
                      <span>Merchant / Staff Portal</span>
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                    {onOpenSupabaseModal && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenSupabaseModal();
                        }}
                        className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-md font-medium text-slate-700 flex items-center justify-between"
                      >
                        <span>Database Setup</span>
                        <Database className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    )}
                  </div>

                  {isAuthenticated && (
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        onClick={async () => {
                          setIsUserMenuOpen(false);
                          await logout();
                          onNavigate('home');
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-md font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Returns & Orders */}
            <button
              onClick={() => onNavigate(isAuthenticated ? 'account' : 'login')}
              className="hidden sm:flex flex-col text-left px-2 py-1 hover:bg-slate-100 rounded-md transition-colors cursor-pointer leading-tight"
            >
              <span className="text-[10px] text-slate-500 font-normal">Returns</span>
              <span className="text-xs font-bold text-slate-900">&amp; Orders</span>
            </button>

            {/* Shopping Cart with Count Badge */}
            <button
              onClick={() => setIsCartDrawerOpen(true)}
              className="flex items-center gap-1 p-2 hover:bg-slate-100 rounded-md transition-colors cursor-pointer relative"
              aria-label="Shopping Cart"
            >
              <div className="relative">
                <ShoppingCart className="w-6 h-6 stroke-[2] text-slate-900" />
                <span className="absolute -top-1.5 -right-2 bg-[#0b5c37] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              </div>
              <span className="text-xs font-bold text-slate-900 hidden sm:inline ml-1">Cart</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. SUB-NAVIGATION STRIP (MATCHING REFERENCE EXACTLY) */}
      <div className="bg-[#f8f9fa] border-t border-b border-slate-200/80 px-3 sm:px-6 lg:px-8 py-1.5 text-xs text-slate-700 font-medium overflow-x-auto no-scrollbar touch-pan-x">
        <div className="max-w-7xl mx-auto flex items-center gap-3 sm:gap-6 whitespace-nowrap">
          {/* All menu */}
          <button
            onClick={() => onNavigate('shop')}
            className="flex items-center gap-1.5 font-bold text-slate-900 hover:text-[#0b5c37] transition-colors cursor-pointer py-1"
          >
            <Menu className="w-4 h-4" />
            <span>All</span>
          </button>

          <button onClick={() => onNavigate('shop', { category: 'Groceries' })} className="hover:text-[#0b5c37] transition-colors cursor-pointer py-1">
            Fresh
          </button>
          <button onClick={() => onNavigate('shop', { category: 'Electronics' })} className="hover:text-[#0b5c37] transition-colors cursor-pointer py-1">
            Shop Cart TV
          </button>
          <button onClick={() => onNavigate('admin-login')} className="hover:text-[#0b5c37] transition-colors cursor-pointer font-semibold text-[#0b5c37] py-1">
            Sell
          </button>
          <button onClick={() => onNavigate('shop', { query: 'bestseller' })} className="hover:text-[#0b5c37] transition-colors cursor-pointer py-1">
            Best Sellers
          </button>
          <button onClick={() => onNavigate('shop', { category: 'Mobiles' })} className="hover:text-[#0b5c37] transition-colors cursor-pointer py-1">
            Mobiles
          </button>
          <button onClick={() => onNavigate('shop', { query: 'deal' })} className="hover:text-[#0b5c37] transition-colors cursor-pointer font-semibold text-rose-600 py-1">
            Today&apos;s Deals
          </button>
          <button onClick={() => onNavigate('home')} className="hover:text-[#0b5c37] transition-colors cursor-pointer flex items-center gap-0.5 py-1">
            <span>Prime</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
          <button onClick={() => onNavigate('shop', { query: 'new' })} className="hover:text-[#0b5c37] transition-colors cursor-pointer py-1">
            New Releases
          </button>
          <button onClick={() => onNavigate('contact')} className="hover:text-[#0b5c37] transition-colors cursor-pointer py-1">
            Customer Service
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex md:hidden animate-in fade-in duration-150">
          <div className="w-[85vw] max-w-sm bg-white h-full shadow-2xl p-5 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <AmazonLogo variant="dark" size="md" />
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 rounded-md text-slate-500 hover:text-slate-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Shop by Category</h4>
              {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    onNavigate('shop', { category: cat.name });
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left py-2 px-2 hover:bg-slate-100 rounded-md text-sm font-semibold text-slate-800 flex items-center justify-between"
                >
                  <span>{cat.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Help &amp; Settings</h4>
              <button
                onClick={() => {
                  onNavigate('account');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 text-sm text-slate-700"
              >
                Your Account
              </button>
              <button
                onClick={() => {
                  onNavigate('contact');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 text-sm text-slate-700"
              >
                Customer Service
              </button>
              <button
                onClick={() => {
                  onNavigate('admin-login');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 text-sm font-bold text-[#0b5c37]"
              >
                Merchant Staff Portal
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
