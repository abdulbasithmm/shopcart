import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Star,
  Truck,
  ShieldCheck,
  Award,
  Headphones,
  Check,
  RotateCcw,
  Percent,
  Play,
  Tag,
  ShoppingBag,
  Sparkles,
  Zap,
  Heart,
  Share2,
  User as UserIcon,
  ShoppingCart,
  Film,
} from 'lucide-react';
import { Product, PageView, VideoItem } from '../types';
import { PRODUCTS } from '../data/mockData';
import { fetchProducts } from '../services/productService';
import { fetchDemoVideos, toggleVideoLike, getEmbeddableVideoInfo } from '../services/videoService';
import { ProductImage } from '../components/common/ProductImage';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { formatPrice } from '../utils/format';
import { ScrollReveal } from '../components/common/ScrollReveal';
import { PWAInstallButton } from '../components/common/PWAInstallButton';
import { LanguageSwitcher } from '../components/navigation/LanguageSwitcher';
import { AmazonLogo } from '../components/common/AmazonLogo';
import { ShareModal } from '../components/common/ShareModal';
import { SharePayload, buildVideoShareUrl, triggerNativeShare } from '../utils/share';

interface HomePageProps {
  onNavigate: (page: PageView, params?: { productId?: string; category?: string; query?: string }) => void;
  onQuickView: (product: Product) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { addToCart, cartCount, setIsCartDrawerOpen } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();

  // Hero Slider State (3000ms auto-slide)
  const [heroSlide, setHeroSlide] = useState(0);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isAtPageTop, setIsAtPageTop] = useState(true);

  // Today's Deals pagination state
  const [dealsPage, setDealsPage] = useState(0);

  // Live Supabase products & demo videos
  const [allProducts, setAllProducts] = useState<Product[]>(PRODUCTS);
  const [demoVideos, setDemoVideos] = useState<VideoItem[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const onMotionChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.('change', onMotionChange);

    const handleScroll = () => {
      setIsAtPageTop(window.scrollY <= 48);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      mq.removeEventListener?.('change', onMotionChange);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Auto-play hero slider every 3 seconds (3000ms) unless hovered, focused, touched, or reduced motion
  useEffect(() => {
    if (isHeroPaused || prefersReducedMotion) return;
    const interval = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, [isHeroPaused, prefersReducedMotion]);

  useEffect(() => {
    let isMounted = true;
    async function loadLiveProducts() {
      try {
        const res = await fetchProducts();
        if (isMounted && res.products && res.products.length > 0) {
          setAllProducts(res.products);
        }
      } catch (err) {
        console.warn('Could not fetch live products for homepage:', err);
      }
    }
    loadLiveProducts();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadVideos = useCallback(async () => {
    setIsLoadingVideos(true);
    try {
      const res = await fetchDemoVideos();
      setDemoVideos(res.videos || []);
    } finally {
      setIsLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos, user?.id]);

  // Today's Deals from live products
  const specialOffers = allProducts.filter((p) => p.isSpecialOffer);
  const todaysDeals = specialOffers.length > 0 ? specialOffers : allProducts.slice(0, 8);
  const dealsPerPage = 5;
  const totalDealsPages = Math.max(1, Math.ceil(todaysDeals.length / dealsPerPage));
  const currentDeals = todaysDeals.slice(dealsPage * dealsPerPage, (dealsPage + 1) * dealsPerPage);

  const categoryList = [
    { name: 'Mobiles', visualType: 'mobile', label: 'Mobiles' },
    { name: 'Electronics', visualType: 'laptop', label: 'Electronics' },
    { name: 'Fashion', visualType: 'coat', label: 'Fashion' },
    { name: 'Home & Kitchen', visualType: 'chair', label: 'Home & Kitchen' },
    { name: 'Beauty', visualType: 'beauty', label: 'Beauty' },
    { name: 'Toys & Games', visualType: 'toys', label: 'Toys & Games' },
    { name: 'Sports', visualType: 'sports', label: 'Sports' },
  ];

  const handleAddToCart = (e: React.MouseEvent, prod: Product) => {
    e.stopPropagation();
    addToCart(prod, 1);
    showToast(`Added ${prod.name} to cart`, 'success');
  };

  const handlePrevSlide = () => {
    setHeroSlide((prev) => (prev > 0 ? prev - 1 : 2));
  };

  const handleNextSlide = () => {
    setHeroSlide((prev) => (prev < 2 ? prev + 1 : 0));
  };

  const handlePrevDeals = () => {
    setDealsPage((prev) => (prev > 0 ? prev - 1 : totalDealsPages - 1));
  };

  const handleNextDeals = () => {
    setDealsPage((prev) => (prev < totalDealsPages - 1 ? prev + 1 : 0));
  };

  const handleLikeVideo = async (video: VideoItem) => {
    if (!isAuthenticated) {
      showToast(t.videos.signInToLike, 'info');
      onNavigate('login');
      return;
    }

    const res = await toggleVideoLike(video.id);
    if (res.requiresAuth) {
      showToast(t.videos.signInToLike, 'info');
      onNavigate('login');
      return;
    }
    if (!res.success) {
      showToast(res.error || 'Could not update like', 'error');
      return;
    }

    setDemoVideos((prev) =>
      prev.map((v) =>
        v.id === video.id
          ? { ...v, userHasLiked: Boolean(res.liked), likesCount: Number(res.likesCount ?? v.likesCount) }
          : v
      )
    );
  };

  const handleShareVideo = async (video: VideoItem) => {
    const payload: SharePayload = {
      title: video.title,
      text: video.description || `${video.title} — Shop Cart Demo Video`,
      url: buildVideoShareUrl(video.id),
    };
    const outcome = await triggerNativeShare(payload);
    if (outcome === 'fallback') {
      setSharePayload(payload);
    }
  };

  // Hero showcase items resolved from live catalog
  const heroHeadphones =
    allProducts.find((p) => p.visualType === 'headphones' || p.id === 'deal-prod-1') || allProducts[0];
  const heroWatch =
    allProducts.find((p) => p.visualType === 'watch' || p.id === 'deal-prod-2') || allProducts[1] || allProducts[0];
  const heroBlender =
    allProducts.find((p) => p.visualType === 'blender' || p.id === 'hero-prod-blender') || allProducts[7] || allProducts[0];
  const slide1Left =
    allProducts.find((p) => p.visualType === 'earbuds' || p.id === 'deal-prod-1') || allProducts[0];
  const slide1Right =
    allProducts.find((p) => p.visualType === 'watch' || p.id === 'deal-prod-2') || allProducts[1] || allProducts[0];
  const slide2Left =
    allProducts.find((p) => p.id === 'deal-prod-5' || p.category === 'Home & Kitchen') || allProducts[4] || allProducts[0];
  const slide2Right =
    allProducts.find((p) => p.id === 'deal-prod-3' || p.visualType === 'backpack' || p.category === 'Fashion') ||
    allProducts[2] ||
    allProducts[0];

  return (
    <div className="bg-[#f8f9fa] text-slate-900 space-y-5 sm:space-y-7 pb-2 sm:pb-6 selection:bg-[#0b5c37] selection:text-white w-full overflow-x-clip">
      {/* --------------------------------------------------------------------- */}
      {/* 1. HERO BANNER + VALUE PROPOSITION FEATURE BAR (FULL-WIDTH GROUP)     */}
      {/* --------------------------------------------------------------------- */}
      <div className="w-full space-y-3 sm:space-y-5">
        <section
          aria-roledescription="carousel"
          aria-label="Featured collections"
          onMouseEnter={() => setIsHeroPaused(true)}
          onMouseLeave={() => setIsHeroPaused(false)}
          onFocusCapture={() => setIsHeroPaused(true)}
          onBlurCapture={() => setIsHeroPaused(false)}
          onTouchStart={() => setIsHeroPaused(true)}
          onTouchEnd={() => setIsHeroPaused(false)}
          className="relative overflow-hidden bg-gradient-to-b from-[#f3f6f4] via-[#f7f9f8] to-[#f8f9fa] border-b border-slate-200 w-full"
        >
          {/* Decorative background accents distributed across the full-width hero canvas */}
          <div className="absolute -left-24 top-1/2 -translate-y-1/2 w-72 sm:w-96 h-72 sm:h-96 bg-emerald-200/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 right-0 w-64 sm:w-80 lg:w-96 h-64 sm:h-80 lg:h-96 opacity-20 pointer-events-none overflow-hidden">
            <svg viewBox="0 0 200 200" fill="#0b5c37" className="w-full h-full transform translate-x-16 -translate-y-16 scale-125">
              <path d="M40 0 C60 40 100 80 180 80 C150 110 110 130 60 140 C80 100 70 50 40 0 Z" opacity="0.6" />
              <path d="M90 0 C110 50 140 100 200 120 C160 140 120 150 70 150 C90 110 90 60 90 0 Z" opacity="0.4" />
            </svg>
          </div>

          {/* Minimal top bar visible when main header is hidden at page top (aligned edge-to-edge) */}
          <div
            className={`w-full px-3 sm:px-6 lg:px-10 xl:px-14 pt-2.5 sm:pt-3.5 pb-1 flex items-center justify-between gap-2 relative z-30 transition-opacity duration-200 ${
              isAtPageTop ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div onClick={() => onNavigate('home')} className="cursor-pointer shrink-0">
              <AmazonLogo variant="dark" size="sm" />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <LanguageSwitcher variant="floating" />

              <button
                type="button"
                onClick={() => onNavigate(isAuthenticated ? 'account' : 'login')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white/95 hover:bg-white border border-slate-200/90 shadow-xs text-xs font-bold text-slate-800 transition-colors cursor-pointer"
              >
                <UserIcon className="w-3.5 h-3.5 text-[#0b5c37]" />
                <span className="max-w-[80px] truncate">
                  {isAuthenticated && user ? user.name.split(' ')[0] : t.common.signIn}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsCartDrawerOpen(true)}
                aria-label={t.nav.cart}
                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white/95 hover:bg-white border border-slate-200/90 shadow-xs text-xs font-bold text-slate-800 transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-[#0b5c37]" />
                <span className="hidden sm:inline">{t.nav.cart}</span>
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#0b5c37] text-white text-[10px] font-black flex items-center justify-center">
                  {cartCount}
                </span>
              </button>
            </div>
          </div>

          {/* Full-width Carousel Container */}
          <div className="w-full px-3 sm:px-14 lg:px-16 xl:px-20 pt-2 pb-11 sm:py-7 lg:py-8 relative sm:min-h-[420px] lg:min-h-[450px] flex items-center">
            {/* Left Arrow (Tablet & Desktop, anchored cleanly near left viewport edge) */}
            <button
              type="button"
              onClick={handlePrevSlide}
              className="hidden sm:flex absolute left-2 sm:left-3 lg:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-white/95 hover:bg-white shadow-md border border-slate-200/90 items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Right Arrow (Tablet & Desktop, anchored cleanly near right viewport edge) */}
            <button
              type="button"
              onClick={handleNextSlide}
              className="hidden sm:flex absolute right-2 sm:right-3 lg:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-white/95 hover:bg-white shadow-md border border-slate-200/90 items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label="Next slide"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Horizontal Smooth Slide Track */}
            <div className="overflow-hidden w-full">
              <div
                className={`flex ${prefersReducedMotion ? '' : 'transition-transform duration-500 ease-out'}`}
                style={{ transform: `translateX(-${heroSlide * 100}%)` }}
              >
                {/* SLIDE 0 */}
                <div className="w-full shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-10 xl:gap-14 items-center">
                  <div className="lg:col-span-6 xl:col-span-5 space-y-4 sm:space-y-5 z-10 min-w-0">
                    <div className="space-y-1">
                      <h1 className="text-2xl sm:text-4xl lg:text-[2.75rem] xl:text-5xl font-extrabold text-[#111827] tracking-tight leading-tight">
                        {t.home.heroSlide1TitleTop}
                      </h1>
                      <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#0b5c37] tracking-tight leading-none">
                        {t.home.heroSlide1TitleAccent}
                      </div>
                    </div>

                    <p className="text-sm sm:text-base text-slate-600 max-w-xl font-medium leading-relaxed">
                      {t.home.heroSlide1Subtitle}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => onNavigate('shop')}
                        className="px-6 py-2.5 min-h-[42px] bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                      >
                        <span>{t.common.shopNow}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onNavigate('shop', { category: 'Electronics' })}
                        className="px-4 py-2.5 min-h-[42px] bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm rounded-md border border-slate-200 shadow-xs transition-colors cursor-pointer"
                      >
                        {t.home.heroSlide1SecondaryCta}
                      </button>
                    </div>

                    <div className="pt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-6 text-xs text-slate-700 font-semibold border-t border-slate-200/80">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-[#0b5c37] text-white flex items-center justify-center text-[10px] shrink-0">
                          <Percent className="w-3 h-3 stroke-[2.5]" />
                        </div>
                        <span>{t.home.heroBadgePrices}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-[#0b5c37] text-white flex items-center justify-center text-[10px] shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                        <span>{t.home.heroBadgeOriginal}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-[#0b5c37] text-white flex items-center justify-center text-[10px] shrink-0">
                          <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                        </div>
                        <span>{t.home.heroBadgeReturns}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Studio Pedestal Showcase */}
                  <div className="lg:col-span-6 xl:col-span-7 relative flex items-center justify-center lg:justify-end min-w-0">
                    <div className="relative w-full max-w-2xl xl:max-w-[740px] aspect-[3/2] flex items-center justify-center">
                      <svg viewBox="0 0 600 400" className="w-full h-full" fill="none">
                        <ellipse cx="180" cy="330" rx="90" ry="24" fill="#000000" opacity="0.08" />
                        <ellipse cx="330" cy="315" rx="80" ry="22" fill="#000000" opacity="0.1" />
                        <ellipse cx="460" cy="340" rx="95" ry="25" fill="#000000" opacity="0.09" />

                        <path d="M 90 290 L 90 325 C 90 340, 270 340, 270 325 L 270 290 Z" fill="#e2e8f0" />
                        <ellipse cx="180" cy="290" rx="90" ry="20" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />

                        <path d="M 250 270 L 250 310 C 250 324, 410 324, 410 310 L 410 270 Z" fill="#cbd5e1" />
                        <ellipse cx="330" cy="270" rx="80" ry="18" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />

                        <path d="M 370 300 L 370 335 C 370 350, 550 350, 550 335 L 550 300 Z" fill="#e2e8f0" />
                        <ellipse cx="460" cy="300" rx="90" ry="20" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
                      </svg>

                      {heroHeadphones && (
                        <div
                          onClick={() => onNavigate('product', { productId: heroHeadphones.id })}
                          className="absolute left-[8%] bottom-[26%] w-[30%] max-w-[180px] cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-xl"
                          title={heroHeadphones.name}
                        >
                          <ProductImage product={heroHeadphones} size="sm" showBadge={false} className="!h-auto aspect-square p-1.5 sm:p-2.5" />
                        </div>
                      )}

                      {heroWatch && (
                        <div
                          onClick={() => onNavigate('product', { productId: heroWatch.id })}
                          className="absolute left-[36.5%] bottom-[32%] w-[26%] max-w-[155px] cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-xl z-10"
                          title={heroWatch.name}
                        >
                          <ProductImage product={heroWatch} size="sm" showBadge={false} className="!h-auto aspect-square p-1.5 sm:p-2.5" />
                        </div>
                      )}

                      {heroBlender && (
                        <div
                          onClick={() => onNavigate('product', { productId: heroBlender.id })}
                          className="absolute right-[8%] bottom-[24%] w-[29%] max-w-[175px] cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-xl"
                          title={heroBlender.name}
                        >
                          <ProductImage product={heroBlender} size="sm" showBadge={false} className="!h-auto aspect-square p-1.5 sm:p-2.5" />
                        </div>
                      )}

                      <div className="absolute right-[3%] bottom-[22%] w-10 sm:w-12 h-14 pointer-events-none drop-shadow-md">
                        <svg viewBox="0 0 40 60" fill="none" className="w-full h-full">
                          <rect x="10" y="32" width="20" height="20" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
                          <path d="M 20 8 Q 15 24 16 32 Q 22 28 20 8 Z" fill="#0b5c37" />
                          <path d="M 20 8 Q 28 20 25 32 Q 20 28 20 8 Z" fill="#047857" />
                          <path d="M 20 16 Q 10 24 12 32 Q 18 30 20 16 Z" fill="#10b981" />
                          <path d="M 20 16 Q 32 24 28 32 Q 22 30 20 16 Z" fill="#059669" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SLIDE 1 */}
                <div className="w-full shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-10 xl:gap-14 items-center">
                  <div className="lg:col-span-6 xl:col-span-5 space-y-4 sm:space-y-5 z-10 min-w-0">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100/80 text-[#0b5c37] rounded-lg text-xs font-bold uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>{t.home.heroSlide2Badge}</span>
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-2xl sm:text-4xl lg:text-[2.75rem] xl:text-5xl font-extrabold text-[#111827] tracking-tight leading-tight">
                        {t.home.heroSlide2TitleTop}
                      </h2>
                      <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#0b5c37] tracking-tight leading-none">
                        {t.home.heroSlide2TitleAccent}
                      </div>
                    </div>

                    <p className="text-sm sm:text-base text-slate-600 max-w-xl font-medium leading-relaxed">
                      {t.home.heroSlide2Subtitle}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => onNavigate('shop', { category: 'Electronics' })}
                        className="px-6 py-2.5 min-h-[42px] bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                      >
                        <span>{t.home.heroSlide2PrimaryCta}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onNavigate('shop', { category: 'Mobiles' })}
                        className="px-4 py-2.5 min-h-[42px] bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm rounded-md border border-slate-200 shadow-xs transition-colors cursor-pointer"
                      >
                        {t.home.heroSlide2SecondaryCta}
                      </button>
                    </div>

                    <div className="pt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-6 text-xs text-slate-700 font-semibold border-t border-slate-200/80">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-[#0b5c37] shrink-0" />
                        <span>{t.home.pillarFastDeliveryTitle}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-[#0b5c37] shrink-0" />
                        <span>1-Yr Warranty</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#0b5c37] shrink-0" />
                        <span>{t.home.heroBadgeOriginal}</span>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-6 xl:col-span-7 relative flex items-center justify-center lg:justify-end min-w-0">
                    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:gap-6 w-full max-w-2xl xl:max-w-[680px]">
                      {slide1Left && (
                        <div
                          onClick={() => onNavigate('product', { productId: slide1Left.id })}
                          className="p-3 sm:p-5 lg:p-6 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center justify-between space-y-2.5"
                        >
                          <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <ProductImage product={slide1Left} size="sm" showBadge={false} className="!h-full" />
                          </div>
                          <div className="space-y-1 w-full">
                            <span className="block text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0b5c37] line-clamp-1">
                              {slide1Left.name}
                            </span>
                            <span className="block text-xs sm:text-sm font-black text-[#0b5c37]">
                              {formatPrice(slide1Left.price)}
                            </span>
                          </div>
                        </div>
                      )}

                      {slide1Right && (
                        <div
                          onClick={() => onNavigate('product', { productId: slide1Right.id })}
                          className="p-3 sm:p-5 lg:p-6 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center justify-between space-y-2.5"
                        >
                          <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <ProductImage product={slide1Right} size="sm" showBadge={false} className="!h-full" />
                          </div>
                          <div className="space-y-1 w-full">
                            <span className="block text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0b5c37] line-clamp-1">
                              {slide1Right.name}
                            </span>
                            <span className="block text-xs sm:text-sm font-black text-[#0b5c37]">
                              {formatPrice(slide1Right.price)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SLIDE 2 */}
                <div className="w-full shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-10 xl:gap-14 items-center">
                  <div className="lg:col-span-6 xl:col-span-5 space-y-4 sm:space-y-5 z-10 min-w-0">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t.home.heroSlide3Badge}</span>
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-2xl sm:text-4xl lg:text-[2.75rem] xl:text-5xl font-extrabold text-[#111827] tracking-tight leading-tight">
                        {t.home.heroSlide3TitleTop}
                      </h2>
                      <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#0b5c37] tracking-tight leading-none">
                        {t.home.heroSlide3TitleAccent}
                      </div>
                    </div>

                    <p className="text-sm sm:text-base text-slate-600 max-w-xl font-medium leading-relaxed">
                      {t.home.heroSlide3Subtitle}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => onNavigate('shop', { category: 'Home & Kitchen' })}
                        className="px-6 py-2.5 min-h-[42px] bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                      >
                        <span>{t.home.heroSlide3PrimaryCta}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onNavigate('shop', { category: 'Fashion' })}
                        className="px-4 py-2.5 min-h-[42px] bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm rounded-md border border-slate-200 shadow-xs transition-colors cursor-pointer"
                      >
                        {t.home.heroSlide3SecondaryCta}
                      </button>
                    </div>

                    <div className="pt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-6 text-xs text-slate-700 font-semibold border-t border-slate-200/80">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-[#0b5c37] shrink-0" />
                        <span>Food-Grade Safe</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4 text-[#0b5c37] shrink-0" />
                        <span>10-Day Exchange</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Percent className="w-4 h-4 text-[#0b5c37] shrink-0" />
                        <span>Special Bundles</span>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-6 xl:col-span-7 relative flex items-center justify-center lg:justify-end min-w-0">
                    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:gap-6 w-full max-w-2xl xl:max-w-[680px]">
                      {slide2Left && (
                        <div
                          onClick={() => onNavigate('product', { productId: slide2Left.id })}
                          className="p-3 sm:p-5 lg:p-6 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center justify-between space-y-2.5"
                        >
                          <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <ProductImage product={slide2Left} size="sm" showBadge={false} className="!h-full" />
                          </div>
                          <div className="space-y-1 w-full">
                            <span className="block text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0b5c37] line-clamp-1">
                              {slide2Left.name}
                            </span>
                            <span className="block text-xs sm:text-sm font-black text-[#0b5c37]">
                              {formatPrice(slide2Left.price)}
                            </span>
                          </div>
                        </div>
                      )}

                      {slide2Right && (
                        <div
                          onClick={() => onNavigate('product', { productId: slide2Right.id })}
                          className="p-3 sm:p-5 lg:p-6 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center justify-between space-y-2.5"
                        >
                          <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <ProductImage product={slide2Right} size="sm" showBadge={false} className="!h-full" />
                          </div>
                          <div className="space-y-1 w-full">
                            <span className="block text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0b5c37] line-clamp-1">
                              {slide2Right.name}
                            </span>
                            <span className="block text-xs sm:text-sm font-black text-[#0b5c37]">
                              {formatPrice(slide2Right.price)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Dots & mobile prev/next navigation */}
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-20">
              <button
                type="button"
                onClick={handlePrevSlide}
                className="sm:hidden w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-700 shadow-xs cursor-pointer"
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-2">
                {[0, 1, 2].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setHeroSlide(idx)}
                    className={`transition-all duration-300 rounded-full cursor-pointer ${
                      heroSlide === idx
                        ? 'w-7 h-2.5 bg-[#0b5c37]'
                        : 'w-2.5 h-2.5 bg-slate-300 hover:bg-slate-400'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={handleNextSlide}
                className="sm:hidden w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-700 shadow-xs cursor-pointer"
                aria-label="Next slide"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------------- */}
        {/* 2. VALUE PROPOSITION STRIP (FULL-WIDTH COMPACT BAR)                  */}
        {/* --------------------------------------------------------------------- */}
        <ScrollReveal animation="fade-up" delay={50} className="w-full px-3 sm:px-6 lg:px-10 xl:px-14">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-4 grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-3 sm:gap-x-5 sm:gap-y-4 lg:gap-6 lg:divide-x divide-slate-100 items-center">
            <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0">
              <div className="text-[#0b5c37] shrink-0 mt-0.5 sm:mt-0">
                <Truck className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 stroke-[1.8]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">{t.home.pillarFastDeliveryTitle}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.home.pillarFastDeliverySub}</p>
              </div>
            </div>

            <div className="flex items-start sm:items-center gap-2 sm:gap-3 lg:pl-6 min-w-0">
              <div className="text-[#0b5c37] shrink-0 mt-0.5 sm:mt-0">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 stroke-[1.8]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">{t.home.pillarUpiTitle}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.home.pillarUpiSub}</p>
              </div>
            </div>

            <div className="flex items-start sm:items-center gap-2 sm:gap-3 lg:pl-6 min-w-0">
              <div className="text-[#0b5c37] shrink-0 mt-0.5 sm:mt-0">
                <Award className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 stroke-[1.8]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">{t.home.pillarBrandsTitle}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.home.pillarBrandsSub}</p>
              </div>
            </div>

            <div className="flex items-start sm:items-center gap-2 sm:gap-3 lg:pl-6 min-w-0">
              <div className="text-[#0b5c37] shrink-0 mt-0.5 sm:mt-0">
                <Headphones className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 stroke-[1.8]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">{t.home.pillarSupportTitle}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.home.pillarSupportSub}</p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 3. SHOP BY CATEGORY */}
      {/* --------------------------------------------------------------------- */}
      <section className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 space-y-3 sm:space-y-4">
        <ScrollReveal animation="fade-in" className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">{t.home.shopByCategory}</h2>
          <button
            onClick={() => onNavigate('shop')}
            className="text-xs sm:text-sm font-bold text-[#0b5c37] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{t.home.seeAll}</span>
            <span>&rarr;</span>
          </button>
        </ScrollReveal>

        <div className="flex md:grid md:grid-cols-7 gap-4 sm:gap-6 overflow-x-auto no-scrollbar touch-pan-x pb-2 md:pb-0 justify-start md:justify-center">
          {categoryList.map((cat, idx) => (
            <ScrollReveal
              key={idx}
              animation="zoom-in"
              delay={idx * 60}
              className="flex flex-col items-center gap-2.5 cursor-pointer group select-none text-center shrink-0 w-20 sm:w-24 md:w-auto"
            >
              <div
                onClick={() => onNavigate('shop', { category: cat.name })}
                className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-[#f1f5f9] border border-slate-200/80 flex items-center justify-center p-3 group-hover:shadow-md group-hover:scale-105 group-hover:border-[#0b5c37] transition-all duration-200"
              >
                <ProductImage
                  product={{
                    id: `temp-${cat.name}`,
                    name: cat.name,
                    brand: 'Shop Cart',
                    category: cat.name,
                    price: 0,
                    originalPrice: 0,
                    rating: 5,
                    reviewsCount: 0,
                    inStock: true,
                    stockCount: 10,
                    shortDescription: '',
                    fullDescription: '',
                    features: [],
                    specs: {},
                    colors: [{ name: 'Default', hex: '#0b5c37' }],
                    visualType: cat.visualType,
                    accentColor: '#0b5c37',
                    tags: [],
                  }}
                  size="sm"
                  showBadge={false}
                  className="!h-full !p-0 !bg-transparent"
                />
              </div>
              <span
                onClick={() => onNavigate('shop', { category: cat.name })}
                className="text-xs font-semibold text-slate-800 group-hover:text-[#0b5c37] transition-colors"
              >
                {cat.label}
              </span>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 4. TODAY'S DEALS CAROUSEL */}
      {/* --------------------------------------------------------------------- */}
      <section className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 space-y-3 sm:space-y-4">
        <ScrollReveal animation="fade-in" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">{t.home.todaysDeals}</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200">
              {todaysDeals.length} Offers
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrevDeals}
                className="p-2 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                aria-label="Previous deals"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextDeals}
                className="p-2 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                aria-label="Next deals"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => onNavigate('shop')}
              className="text-xs sm:text-sm font-bold text-[#0b5c37] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{t.home.seeAll}</span>
              <span>&rarr;</span>
            </button>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          {currentDeals.map((deal, idx) => (
            <ScrollReveal
              key={deal.id}
              animation="fade-up"
              delay={idx * 70}
              className="bg-white rounded-lg border border-slate-200 p-2 sm:p-3.5 flex flex-col justify-between hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div onClick={() => onNavigate('product', { productId: deal.id })}>
                <div className="relative aspect-square flex items-center justify-center p-2 bg-white">
                  <ProductImage product={deal} size="md" showBadge={false} />
                </div>

                <div className="pt-3 space-y-1.5">
                  <div>
                    <span className="inline-block bg-[#cc0c39] text-white text-[11px] font-black px-2 py-0.5 rounded-sm">
                      {deal.discountPercentage}% {t.home.dealBadgeOff}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-base sm:text-lg font-extrabold text-slate-900 tabular-nums">
                      {formatPrice(deal.price)}
                    </span>
                    {deal.originalPrice && (
                      <span className="text-xs text-slate-400 line-through tabular-nums">
                        {formatPrice(deal.originalPrice)}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 group-hover:text-[#0b5c37] transition-colors leading-snug">
                    {deal.name}
                  </h3>

                  <div className="flex items-center gap-1 pt-1 text-xs text-slate-500">
                    <div className="flex items-center text-[#f59e0b]">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < Math.round(deal.rating || 5)
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-slate-200 text-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {deal.reviewsCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2.5">
                <button
                  onClick={(e) => handleAddToCart(e, deal)}
                  className="w-full py-2 bg-slate-50 hover:bg-[#0b5c37] text-slate-700 hover:text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ShoppingBag className="w-3 h-3" />
                  <span>{t.common.addToCart}</span>
                </button>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 5. REAL SUPABASE DEMO VIDEOS & LIKES SECTION */}
      {/* --------------------------------------------------------------------- */}
      <section className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 space-y-3 sm:space-y-4">
        <ScrollReveal animation="fade-in" className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Film className="w-5 h-5 text-[#0b5c37]" />
              <span>{t.home.demoVideosTitle}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.home.demoVideosSubtitle}</p>
          </div>
          <button
            onClick={() => onNavigate('play')}
            className="text-xs sm:text-sm font-bold text-[#0b5c37] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>{t.home.watchAllVideos}</span>
            <span>&rarr;</span>
          </button>
        </ScrollReveal>

        {isLoadingVideos ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((skeleton) => (
              <div
                key={skeleton}
                className="bg-white rounded-xl border border-slate-200 p-4 h-72 flex items-center justify-center text-xs text-slate-400"
              >
                {t.common.loading}
              </div>
            ))}
          </div>
        ) : demoVideos.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-2">
            <Film className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-800">{t.home.noVideosYet}</p>
            <button
              onClick={() => onNavigate('play')}
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{t.home.watchAllVideos}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {demoVideos.slice(0, 3).map((video) => {
              const embedInfo = getEmbeddableVideoInfo(video.videoUrl);
              const linkedProduct = video.productId
                ? allProducts.find((p) => p.id === video.productId)
                : undefined;

              return (
                <div
                  key={video.id}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-video bg-slate-950 relative overflow-hidden">
                      {embedInfo.type === 'direct' ? (
                        <video
                          src={embedInfo.src}
                          poster={video.thumbnailUrl || undefined}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <iframe
                          src={embedInfo.src}
                          title={video.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      )}
                    </div>

                    <div className="p-4 space-y-1.5">
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{video.title}</h3>
                      {video.description && (
                        <p className="text-xs text-slate-500 line-clamp-2">{video.description}</p>
                      )}
                      {linkedProduct && (
                        <button
                          type="button"
                          onClick={() => onNavigate('product', { productId: linkedProduct.id })}
                          className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0b5c37] hover:underline cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>{linkedProduct.name}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
                    <button
                      type="button"
                      onClick={() => handleLikeVideo(video)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        video.userHasLiked
                          ? 'bg-rose-50 border-rose-200 text-rose-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${video.userHasLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                      <span>{video.likesCount}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleShareVideo(video)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5 text-[#0b5c37]" />
                        <span>{t.common.share}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onNavigate('play')}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{t.nav.play}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 6. SHOP CART MEMBERSHIP BANNER */}
      {/* --------------------------------------------------------------------- */}
      <ScrollReveal animation="fade-up" className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="rounded-2xl overflow-hidden bg-[#a3c3a4] border border-slate-200/80 shadow-sm relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
            <div className="lg:col-span-6 bg-white p-4 sm:p-10 lg:rounded-r-[100px] space-y-3 sm:space-y-4 z-10">
              <div className="flex items-center gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-[#0b5c37] tracking-tight">
                  shop cart
                </span>
                <span className="text-xl sm:text-2xl font-bold text-[#0b5c37] tracking-tight italic">
                  plus
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  {t.home.membershipTitle}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium pt-1">
                  {t.home.membershipSubtitle}
                </p>
              </div>

              <div>
                <button
                  onClick={() => onNavigate('shop')}
                  className="px-5 py-2.5 min-h-[42px] bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-sm transition-colors cursor-pointer"
                >
                  {t.home.membershipCta}
                </button>
              </div>
            </div>

            {/* Authentic Delivery Boxes & ShopCart Demo Video Hub Card */}
            <div className="lg:col-span-6 p-4 sm:p-8 flex items-center justify-center relative sm:min-h-[220px]">
              <div className="flex items-center justify-center gap-5 sm:gap-7 flex-wrap">
                <div className="flex flex-col items-center">
                  <div className="w-20 h-16 sm:w-28 sm:h-20 bg-[#d4a373] rounded-sm border border-[#bc8a5f] shadow-md p-2 flex flex-col justify-between">
                    <span className="text-[8px] font-mono font-bold text-slate-800">shop cart</span>
                    <div className="h-0.5 bg-[#bc8a5f] w-full" />
                  </div>
                  <div className="w-28 h-20 sm:w-36 sm:h-24 bg-[#cca379] rounded-sm border border-[#bc8a5f] shadow-lg -mt-3 p-2.5 flex flex-col justify-between">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-[#111827]">shop cart</span>
                      <span className="text-[8px] font-mono bg-[#0b5c37] text-white px-1 rounded">express</span>
                    </div>
                    <div className="h-1 bg-[#0b5c37] w-12 rounded" />
                  </div>
                </div>

                <div
                  onClick={() => onNavigate('play')}
                  className="w-48 sm:w-56 aspect-[16/10] bg-slate-950 rounded-xl p-3 border-2 border-slate-700 shadow-xl flex flex-col justify-between overflow-hidden relative cursor-pointer group hover:border-emerald-500 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-emerald-400">ShopCart Play</span>
                    <Film className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-left space-y-0.5">
                    <h4 className="text-xs sm:text-sm font-extrabold text-white tracking-tight">
                      {t.home.demoVideosTitle}
                    </h4>
                    <p className="text-[10px] text-slate-400 line-clamp-1">
                      {demoVideos.length > 0
                        ? `${demoVideos.length} ${t.home.watchAllVideos}`
                        : t.home.demoVideosSubtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                    <Play className="w-3 h-3 fill-emerald-300" />
                    <span>{t.home.watchAllVideos}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border-t border-slate-200/90 py-3 px-3 sm:px-6 grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4 text-xs font-semibold text-slate-800">
            <div className="flex items-center justify-center gap-2">
              <Truck className="w-4 h-4 text-[#0b5c37]" />
              <span>{t.home.membershipBenefitDelivery}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Play className="w-4 h-4 text-[#0b5c37]" />
              <span>{t.home.membershipBenefitVideos}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Tag className="w-4 h-4 text-[#0b5c37]" />
              <span>{t.home.membershipBenefitDeals}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Headphones className="w-4 h-4 text-[#0b5c37]" />
              <span>{t.home.membershipBenefitSupport}</span>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* --------------------------------------------------------------------- */}
      {/* 7. BEST SELLERS / POPULAR PRODUCTS GRID */}
      {/* --------------------------------------------------------------------- */}
      <section className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 space-y-3 sm:space-y-4">
        <ScrollReveal animation="fade-in" className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">{t.home.featuredBestSellers}</h2>
          <button
            onClick={() => onNavigate('shop')}
            className="text-xs sm:text-sm font-bold text-[#0b5c37] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{t.home.exploreFullCatalog}</span>
            <span>&rarr;</span>
          </button>
        </ScrollReveal>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-5">
          {allProducts.slice(0, 12).map((prod, idx) => (
            <ScrollReveal
              key={prod.id}
              animation="fade-up"
              delay={idx * 50}
              className="bg-white rounded-lg border border-slate-200 p-2 sm:p-4 flex flex-col justify-between hover:shadow-md transition-all cursor-pointer group"
            >
              <div onClick={() => onNavigate('product', { productId: prod.id })}>
                <div className="relative aspect-square flex items-center justify-center bg-white p-1.5 sm:p-2">
                  <ProductImage product={prod} size="md" showBadge={false} />
                  {prod.badge && (
                    <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-slate-900 text-white text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-sm uppercase tracking-wider">
                      {prod.badge}
                    </span>
                  )}
                </div>

                <div className="pt-2.5 sm:pt-3 space-y-1">
                  <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    {prod.brand}
                  </span>
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-[#0b5c37] transition-colors leading-snug">
                    {prod.name}
                  </h3>

                  <div className="flex items-center gap-1 text-xs text-slate-500 pt-0.5">
                    <div className="flex items-center text-[#f59e0b]">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < Math.round(prod.rating || 5)
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-slate-200 text-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                      ({prod.reviewsCount})
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 sm:gap-2 pt-1">
                    <span className="text-sm sm:text-lg font-bold text-slate-900 tabular-nums">
                      {formatPrice(prod.price)}
                    </span>
                    {prod.originalPrice > prod.price && (
                      <span className="text-[11px] sm:text-xs text-slate-400 line-through tabular-nums">
                        {formatPrice(prod.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2.5 sm:pt-3">
                <button
                  onClick={(e) => handleAddToCart(e, prod)}
                  className="w-full py-2 bg-[#f3f4f6] hover:bg-[#0b5c37] text-slate-800 hover:text-white text-[11px] sm:text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{t.common.addToCart}</span>
                </button>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* PWA Mobile App Download / Install Banner */}
      <section className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 pb-2">
        <PWAInstallButton variant="banner" />
      </section>

      {/* Social Share Fallback Modal */}
      <ShareModal payload={sharePayload} onClose={() => setSharePayload(null)} />
    </div>
  );
};
