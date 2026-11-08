import React, { useState, useEffect } from 'react';
import { PageView, Product } from './types';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { CartDrawer } from './components/common/CartDrawer';
import { QuickViewModal } from './components/common/QuickViewModal';
import { SupabaseStatusModal } from './components/common/SupabaseStatusModal';
import { AdminGuard } from './components/AdminGuard';
import { BackToTop } from './components/common/BackToTop';

// Pages
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ContactPage } from './pages/ContactPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AccountPage } from './pages/AccountPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AdminPage, AdminSection } from './pages/AdminPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';

// Helper to parse current browser URL (supporting single-domain /admin/*, hash fallbacks, and admin.* subdomains)
function parseCurrentRoute(): { page: PageView; productId?: string; adminSection?: AdminSection } {
  if (typeof window === 'undefined') return { page: 'home' };

  const hostname = window.location.hostname.toLowerCase();
  const isAdminSubdomain = hostname.startsWith('admin.');
  const rawPath = window.location.pathname.toLowerCase();
  const pathname = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
  const rawHash = window.location.hash.toLowerCase();
  const hash = rawHash.split('?')[0].replace(/^#\/?/, '').replace(/\/+$/, '');

  // 1. Password recovery
  if (hash.includes('type=recovery') || hash.startsWith('reset-password') || pathname.startsWith('/reset-password')) {
    return { page: 'reset-password' };
  }

  // 2. Admin subdomain routing (e.g. admin.shopcart.com)
  if (isAdminSubdomain) {
    if (pathname === '/login' || hash === 'login') {
      return { page: 'admin-login' };
    }
    const cleanSub = pathname.replace(/^\//, '') || hash;
    if (!cleanSub || cleanSub === 'dashboard') {
      return { page: 'admin', adminSection: 'dashboard' };
    }
    const subSectionMap: Record<string, AdminSection> = {
      orders: 'orders',
      products: 'products',
      categories: 'categories',
      customers: 'customers',
      inventory: 'inventory',
      payments: 'payments',
      analytics: 'analytics',
      profile: 'settings',
      settings: 'settings',
    };
    if (subSectionMap[cleanSub]) {
      return { page: 'admin', adminSection: subSectionMap[cleanSub] };
    }
    return { page: 'admin', adminSection: 'dashboard' };
  }

  // 3. Admin Login route: /admin/login or /admin-login or #/admin/login or #admin/login or #admin-login
  if (
    pathname === '/admin/login' ||
    pathname === '/admin-login' ||
    hash === 'admin/login' ||
    hash === '/admin/login' ||
    hash === 'admin-login'
  ) {
    return { page: 'admin-login' };
  }

  // 4. Admin section routes helper: /admin, /admin/dashboard, /admin/orders, etc.
  const checkAdminSection = (pathStr: string): AdminSection | null => {
    const clean = pathStr.replace(/^#\/?/, '').replace(/^\//, '').replace(/\/+$/, '');
    if (clean === 'admin' || clean === 'admin/dashboard') return 'dashboard';
    if (clean === 'admin/orders') return 'orders';
    if (clean === 'admin/products') return 'products';
    if (clean === 'admin/categories') return 'categories';
    if (clean === 'admin/customers') return 'customers';
    if (clean === 'admin/inventory') return 'inventory';
    if (clean === 'admin/payments') return 'payments';
    if (clean === 'admin/analytics') return 'analytics';
    if (clean === 'admin/profile' || clean === 'admin/settings') return 'settings';
    return null;
  };

  const parsedAdminSec = checkAdminSection(pathname) || checkAdminSection(hash);
  if (parsedAdminSec) {
    return { page: 'admin', adminSection: parsedAdminSec };
  }

  // 5. Access Denied route
  if (
    pathname === '/access-denied' ||
    pathname === '/admin/unauthorized' ||
    hash === 'access-denied' ||
    hash === 'admin/unauthorized'
  ) {
    return { page: 'access-denied' };
  }

  // 6. Product Detail check
  if (hash.startsWith('product-')) {
    const prodId = hash.replace('product-', '');
    return { page: 'product', productId: prodId };
  }
  if (pathname.startsWith('/product/')) {
    const prodId = pathname.replace('/product/', '');
    return { page: 'product', productId: prodId };
  }

  // 7. Common storefront pages
  const candidate = (hash || pathname.replace(/^\//, '')) as PageView;
  if (
    [
      'home',
      'shop',
      'cart',
      'checkout',
      'contact',
      'login',
      'register',
      'account',
      'forgot-password',
      'reset-password',
    ].includes(candidate)
  ) {
    return { page: candidate };
  }

  return { page: 'home' };
}

function AppContent() {
  const { isPasswordRecovery } = useAuth();
  const initialRoute = parseCurrentRoute();
  const [currentPage, setCurrentPage] = useState<PageView>(initialRoute.page);
  const [adminSection, setAdminSection] = useState<AdminSection>(initialRoute.adminSection || 'dashboard');
  const [selectedProductId, setSelectedProductId] = useState<string>(initialRoute.productId || 'eko-prod-1');
  const [shopCategory, setShopCategory] = useState<string>('all');
  const [shopSearchQuery, setShopSearchQuery] = useState<string>('');
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<'profile' | 'orders' | 'wishlist' | 'security'>('profile');

  // Synchronize with URL pathname and hash for browser back/forward and direct links
  useEffect(() => {
    // Normalize URL if duplicate hash is present (e.g., /admin/dashboard#/admin/dashboard)
    try {
      const rawHash = window.location.hash;
      const rawPath = window.location.pathname;
      if (rawHash && rawPath.startsWith('/admin') && (rawHash.includes('admin') || rawHash.includes('dashboard'))) {
        window.history.replaceState(null, '', rawPath);
      }
    } catch {
      // Ignore
    }

    const handleLocationChange = () => {
      const route = parseCurrentRoute();
      setCurrentPage(route.page);
      if (route.productId) {
        setSelectedProductId(route.productId);
      }
      if (route.adminSection) {
        setAdminSection(route.adminSection);
      }
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // If auth state triggers password recovery from Supabase redirect
  useEffect(() => {
    if (isPasswordRecovery) {
      setCurrentPage('reset-password');
    }
  }, [isPasswordRecovery]);

  const handleNavigate = (
    page: PageView,
    params?: { productId?: string; category?: string; query?: string; tab?: string; adminSection?: AdminSection }
  ) => {
    if (params?.tab) {
      setAccountTab(params.tab as any);
    }

    const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const isAdminSubdomain = hostname.startsWith('admin.');

    let targetPath = '/';
    let targetHash = '';

    if (params?.productId) {
      setSelectedProductId(params.productId);
      targetPath = `/product/${params.productId}`;
      targetHash = `product-${params.productId}`;
    } else if (page === 'admin-login') {
      targetPath = isAdminSubdomain ? '/login' : '/admin/login';
      targetHash = isAdminSubdomain ? '/login' : '/admin/login';
    } else if (page === 'admin') {
      const sec = params?.adminSection || adminSection || 'dashboard';
      const secPath = sec === 'settings' ? 'profile' : sec;
      targetPath = isAdminSubdomain ? `/${secPath}` : `/admin/${secPath}`;
      targetHash = isAdminSubdomain ? `/${secPath}` : `/admin/${secPath}`;
      setAdminSection(sec);
    } else if (page === 'access-denied') {
      targetPath = '/access-denied';
      targetHash = '/access-denied';
    } else if (page === 'home') {
      targetPath = '/';
      targetHash = '';
    } else {
      targetPath = `/${page}`;
      targetHash = page;
    }

    try {
      window.history.pushState(null, '', targetPath);
    } catch {
      window.location.hash = targetHash;
    }

    if (params?.category) {
      setShopCategory(params.category);
    }

    if (params?.query !== undefined) {
      setShopSearchQuery(params.query);
    }

    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchFromHeader = (query: string, category: string) => {
    setShopSearchQuery(query);
    setShopCategory(category);
    setCurrentPage('shop');
    try {
      window.history.pushState(null, '', '/shop');
    } catch {
      window.location.hash = 'shop';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isAdminRoute = currentPage === 'admin' || currentPage === 'admin-login' || currentPage === 'access-denied';

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 selection:bg-[#0b5c37] selection:text-white">
      {/* Top Header - Hidden on dedicated Admin portal views for clean separation */}
      {!isAdminRoute && (
        <Header
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onSearch={handleSearchFromHeader}
        />
      )}

      {/* Main Viewport Content */}
      <main className="flex-1">
        {currentPage === 'home' && (
          <HomePage
            onNavigate={handleNavigate}
            onQuickView={(prod) => setQuickViewProduct(prod)}
          />
        )}

        {currentPage === 'shop' && (
          <ShopPage
            initialCategory={shopCategory}
            initialQuery={shopSearchQuery}
            onNavigate={handleNavigate}
            onQuickView={(prod) => setQuickViewProduct(prod)}
          />
        )}

        {currentPage === 'product' && (
          <ProductDetailPage
            productId={selectedProductId}
            onNavigate={handleNavigate}
            onQuickView={(prod) => setQuickViewProduct(prod)}
          />
        )}

        {currentPage === 'cart' && <CartPage onNavigate={handleNavigate} />}

        {currentPage === 'checkout' && <CheckoutPage onNavigate={handleNavigate} />}

        {currentPage === 'contact' && <ContactPage onNavigate={handleNavigate} />}

        {currentPage === 'login' && <LoginPage onNavigate={handleNavigate} />}

        {currentPage === 'register' && <RegisterPage onNavigate={handleNavigate} />}

        {currentPage === 'account' && (
          <AccountPage onNavigate={handleNavigate} initialTab={accountTab} />
        )}

        {currentPage === 'reset-password' && <ResetPasswordPage onNavigate={handleNavigate} />}

        {currentPage === 'forgot-password' && <LoginPage onNavigate={handleNavigate} />}

        {currentPage === 'admin-login' && (
          <AdminLoginPage onNavigate={handleNavigate} />
        )}

        {currentPage === 'access-denied' && (
          <AccessDeniedPage onNavigate={handleNavigate} />
        )}

        {currentPage === 'admin' && (
          <AdminGuard onNavigate={handleNavigate}>
            <AdminPage
              initialSection={adminSection}
              onSectionChange={(sec) => {
                setAdminSection(sec);
                const secPath = sec === 'settings' ? 'profile' : sec;
                try {
                  window.history.pushState(null, '', `/admin/${secPath}`);
                } catch {
                  window.location.hash = `/admin/${secPath}`;
                }
              }}
              onNavigate={handleNavigate}
              onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
            />
          </AdminGuard>
        )}
      </main>

      {/* Footer - Hidden on dedicated Admin portal views */}
      {!isAdminRoute && (
        <Footer
          onNavigate={handleNavigate}
        />
      )}

      {/* Slide-out Cart Drawer - Active only on Storefront */}
      {!isAdminRoute && <CartDrawer onNavigate={handleNavigate} />}

      {/* Quick View Modal */}
      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onViewFullDetails={(prodId) => {
          setQuickViewProduct(null);
          handleNavigate('product', { productId: prodId });
        }}
      />

      {/* Supabase Connection & Schema Assistant */}
      <SupabaseStatusModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />

      {/* Floating Back to Top Button */}
      <BackToTop />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
