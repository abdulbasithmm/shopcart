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
import { AdminPage } from './pages/AdminPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';

// Helper to parse current browser URL (supporting both pathnames and hashes)
function parseCurrentRoute(): { page: PageView; productId?: string } {
  if (typeof window === 'undefined') return { page: 'home' };

  const pathname = window.location.pathname.toLowerCase().replace(/\/$/, '');
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '').replace(/\/$/, '');

  // 1. Password recovery
  if (hash.includes('type=recovery') || hash.startsWith('reset-password') || pathname.startsWith('/reset-password')) {
    return { page: 'reset-password' };
  }

  // 2. Admin Login route: /admin/login or #/admin/login or #admin-login
  if (
    pathname === '/admin/login' ||
    pathname === '/admin-login' ||
    hash === 'admin/login' ||
    hash === 'admin-login'
  ) {
    return { page: 'admin-login' };
  }

  // 3. Admin Dashboard route: /admin/dashboard or /admin or #/admin/dashboard or #admin
  if (
    pathname === '/admin/dashboard' ||
    pathname === '/admin' ||
    hash === 'admin/dashboard' ||
    hash === 'admin'
  ) {
    return { page: 'admin' };
  }

  // 4. Access Denied route
  if (
    pathname === '/access-denied' ||
    pathname === '/admin/unauthorized' ||
    hash === 'access-denied' ||
    hash === 'admin/unauthorized'
  ) {
    return { page: 'access-denied' };
  }

  // 5. Product Detail check
  if (hash.startsWith('product-')) {
    const prodId = hash.replace('product-', '');
    return { page: 'product', productId: prodId };
  }
  if (pathname.startsWith('/product/')) {
    const prodId = pathname.replace('/product/', '');
    return { page: 'product', productId: prodId };
  }

  // 6. Common storefront pages
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
  const [selectedProductId, setSelectedProductId] = useState<string>(initialRoute.productId || 'eko-prod-1');
  const [shopCategory, setShopCategory] = useState<string>('all');
  const [shopSearchQuery, setShopSearchQuery] = useState<string>('');
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<'profile' | 'orders' | 'wishlist' | 'security'>('profile');

  // Synchronize with URL pathname and hash for browser back/forward and direct links
  useEffect(() => {
    const handleLocationChange = () => {
      const route = parseCurrentRoute();
      setCurrentPage(route.page);
      if (route.productId) {
        setSelectedProductId(route.productId);
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
    params?: { productId?: string; category?: string; query?: string; tab?: string }
  ) => {
    if (params?.tab) {
      setAccountTab(params.tab as any);
    }

    let targetPath = '/';
    let targetHash = '';

    if (params?.productId) {
      setSelectedProductId(params.productId);
      targetPath = `/product/${params.productId}`;
      targetHash = `product-${params.productId}`;
    } else if (page === 'admin-login') {
      targetPath = '/admin/login';
      targetHash = '/admin/login';
    } else if (page === 'admin') {
      targetPath = '/admin/dashboard';
      targetHash = '/admin/dashboard';
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
      window.location.hash = targetHash;
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
      window.location.hash = 'shop';
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
          onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
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
          onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
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
