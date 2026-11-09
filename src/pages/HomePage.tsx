import React, { useState, useEffect } from 'react';
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
  Music,
  ShoppingBag,
  ExternalLink,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Product, PageView } from '../types';
import { PRODUCTS, CATEGORIES } from '../data/mockData';
import { ProductImage } from '../components/common/ProductImage';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../utils/format';
import { ScrollReveal } from '../components/common/ScrollReveal';
import { PWAInstallButton } from '../components/common/PWAInstallButton';

interface HomePageProps {
  onNavigate: (page: PageView, params?: { productId?: string; category?: string }) => void;
  onQuickView: (product: Product) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onQuickView }) => {
  const { addToCart } = useCart();
  const { showToast } = useToast();

  // Hero Slider State
  const [heroSlide, setHeroSlide] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);

  // Today's Deals pagination state
  const [dealsPage, setDealsPage] = useState(0);

  // Auto-play hero slider every 6.5s unless hovered
  useEffect(() => {
    if (isHeroHovered) return;
    const interval = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % 3);
    }, 6500);
    return () => clearInterval(interval);
  }, [isHeroHovered]);

  // Today's Deals from products
  const todaysDeals = PRODUCTS.filter((p) => p.isSpecialOffer);
  const dealsPerPage = 5;
  const totalDealsPages = Math.ceil(todaysDeals.length / dealsPerPage);
  const currentDeals = todaysDeals.slice(dealsPage * dealsPerPage, (dealsPage + 1) * dealsPerPage);

  // Categories matching reference screenshot
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

  return (
    <div className="bg-[#f8f9fa] text-slate-900 min-h-screen space-y-8 pb-16 selection:bg-[#0b5c37] selection:text-white">
      {/* --------------------------------------------------------------------- */}
      {/* 1. HERO BANNER: MULTI-SLIDE CAROUSEL WITH INTERACTIVE ARROWS & DOTS */}
      {/* --------------------------------------------------------------------- */}
      <section
        onMouseEnter={() => setIsHeroHovered(true)}
        onMouseLeave={() => setIsHeroHovered(false)}
        className="relative overflow-hidden bg-gradient-to-b from-[#f3f6f4] via-[#f7f9f8] to-[#f8f9fa] border-b border-slate-200"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-14 relative min-h-[460px] sm:min-h-[500px] flex items-center">
          {/* Subtle palm leaf shadow graphic in top right */}
          <div className="absolute top-0 right-0 w-80 h-80 opacity-20 pointer-events-none overflow-hidden">
            <svg viewBox="0 0 200 200" fill="#0b5c37" className="w-full h-full transform translate-x-16 -translate-y-16 scale-125">
              <path d="M40 0 C60 40 100 80 180 80 C150 110 110 130 60 140 C80 100 70 50 40 0 Z" opacity="0.6" />
              <path d="M90 0 C110 50 140 100 200 120 C160 140 120 150 70 150 C90 110 90 60 90 0 Z" opacity="0.4" />
            </svg>
          </div>

          {/* Left Arrow */}
          <button
            onClick={handlePrevSlide}
            className="absolute left-1 sm:left-4 z-20 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white shadow-md border border-slate-200/90 flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Right Arrow */}
          <button
            onClick={handleNextSlide}
            className="absolute right-1 sm:right-4 z-20 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white shadow-md border border-slate-200/90 flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* SLIDE 0: UPGRADE YOUR EVERYDAY (REFERENCE SCREENSHOT THEME) */}
          {heroSlide === 0 && (
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-500">
              {/* Left Column: Heading, Subtitle, CTA & 3 Badges */}
              <div className="lg:col-span-5 space-y-4 sm:space-y-5 z-10">
                <div className="space-y-1">
                  <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-[#111827] tracking-tight leading-tight">
                    Upgrade your
                  </h1>
                  <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#0b5c37] tracking-tight leading-none">
                    Everyday
                  </div>
                </div>

                <p className="text-sm sm:text-base text-slate-600 max-w-md font-medium">
                  Shop the best of Electronics, Home, Fashion &amp; more
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onNavigate('shop')}
                    className="px-6 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-md transition-all cursor-pointer inline-flex items-center gap-2 active:scale-98"
                  >
                    <span>Shop Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onNavigate('shop', { category: 'Electronics' })}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm rounded-md border border-slate-200 shadow-xs transition-colors cursor-pointer"
                  >
                    Tech Deals
                  </button>
                </div>

                {/* 3 Value Badges from Reference Screenshot */}
                <div className="pt-4 flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-slate-700 font-semibold border-t border-slate-200/80">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-[#0b5c37] text-white flex items-center justify-center text-[10px]">
                      <Percent className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span>Great Prices</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-[#0b5c37] text-white flex items-center justify-center text-[10px]">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>100% Original</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-[#0b5c37] text-white flex items-center justify-center text-[10px]">
                      <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span>Easy Returns</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Multi-pedestal Studio Showcase (Headphones, Smartwatch, Blender, Plant) */}
              <div className="lg:col-span-7 relative flex items-center justify-center">
                <div className="relative w-full max-w-xl aspect-[16/11] flex items-center justify-center">
                  {/* Pedestals Base Graphic */}
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

                  {/* Overlaid Products exactly matching screenshot */}
                  {/* 1. Headphones */}
                  <div
                    onClick={() => onNavigate('product', { productId: 'deal-prod-1' })}
                    className="absolute left-[8%] bottom-[26%] w-[34%] max-w-[170px] cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-xl"
                    title="AeroTune Studio Headphones"
                  >
                    <ProductImage
                      product={PRODUCTS.find((p) => p.visualType === 'headphones') || PRODUCTS[0]}
                      size="sm"
                      showBadge={false}
                    />
                  </div>

                  {/* 2. Smartwatch */}
                  <div
                    onClick={() => onNavigate('product', { productId: 'deal-prod-2' })}
                    className="absolute left-[36%] bottom-[32%] w-[28%] max-w-[140px] cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-xl z-10"
                    title="Noise ColorFit Pro 4 Smartwatch"
                  >
                    <ProductImage
                      product={PRODUCTS.find((p) => p.id === 'deal-prod-2') || PRODUCTS[1]}
                      size="sm"
                      showBadge={false}
                    />
                  </div>

                  {/* 3. Blender */}
                  <div
                    onClick={() => onNavigate('product', { productId: 'hero-prod-blender' })}
                    className="absolute right-[8%] bottom-[24%] w-[32%] max-w-[160px] cursor-pointer hover:scale-105 transition-transform duration-300 drop-shadow-xl"
                    title="Philips Kitchen Blender"
                  >
                    <ProductImage
                      product={PRODUCTS.find((p) => p.visualType === 'blender') || PRODUCTS[7]}
                      size="sm"
                      showBadge={false}
                    />
                  </div>

                  {/* Small succulent */}
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
          )}

          {/* SLIDE 1: MEGA TECH DEALS & WIRELESS AUDIO */}
          {heroSlide === 1 && (
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-500">
              <div className="lg:col-span-5 space-y-5 z-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100/80 text-[#0b5c37] rounded-full text-xs font-bold uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Limited Time Deal Festival</span>
                </div>

                <div className="space-y-1">
                  <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-[#111827] tracking-tight leading-tight">
                    Smart Tech &amp;
                  </h1>
                  <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#0b5c37] tracking-tight leading-none">
                    Wireless Audio
                  </div>
                </div>

                <p className="text-sm sm:text-base text-slate-600 max-w-md font-medium">
                  Up to 45% off on boAt Airdopes 141 Pro, OLED ultrabooks, and titanium wearables.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onNavigate('shop', { category: 'Electronics' })}
                    className="px-6 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <span>Shop Electronics</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onNavigate('shop', { category: 'Mobiles' })}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm rounded-md border border-slate-200 shadow-xs transition-colors cursor-pointer"
                  >
                    View Mobiles
                  </button>
                </div>

                <div className="pt-4 flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-slate-700 font-semibold border-t border-slate-200/80">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#0b5c37]" />
                    <span>Free 24hr Shipping</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#0b5c37]" />
                    <span>1-Yr Warranty</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#0b5c37]" />
                    <span>Verified Genuine</span>
                  </div>
                </div>
              </div>

              {/* Showcase visuals for Slide 1 */}
              <div className="lg:col-span-7 relative flex items-center justify-center">
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div
                    onClick={() => onNavigate('product', { productId: 'deal-prod-1' })}
                    className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center space-y-2"
                  >
                    <div className="w-28 h-28 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <ProductImage product={PRODUCTS.find((p) => p.visualType === 'earbuds') || PRODUCTS[0]} size="sm" showBadge={false} />
                    </div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-[#0b5c37]">boAt Airdopes 141</span>
                    <span className="text-xs font-black text-[#0b5c37]">₹5,999</span>
                  </div>

                  <div
                    onClick={() => onNavigate('product', { productId: 'deal-prod-2' })}
                    className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center space-y-2"
                  >
                    <div className="w-28 h-28 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <ProductImage product={PRODUCTS.find((p) => p.id === 'deal-prod-2') || PRODUCTS[1]} size="sm" showBadge={false} />
                    </div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-[#0b5c37]">Noise ColorFit Pro</span>
                    <span className="text-xs font-black text-[#0b5c37]">₹12,999</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 2: HOME LUXURY & KITCHEN ESSENTIALS */}
          {heroSlide === 2 && (
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-500">
              <div className="lg:col-span-5 space-y-5 z-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Curated Home Sanctuary</span>
                </div>

                <div className="space-y-1">
                  <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-[#111827] tracking-tight leading-tight">
                    Modern Living &amp;
                  </h1>
                  <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#0b5c37] tracking-tight leading-none">
                    Home Kitchen
                  </div>
                </div>

                <p className="text-sm sm:text-base text-slate-600 max-w-md font-medium">
                  Premium stainless cookers, ergonomic chairs, and high-efficiency smart appliances.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onNavigate('shop', { category: 'Home & Kitchen' })}
                    className="px-6 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <span>Shop Home &amp; Kitchen</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onNavigate('shop', { category: 'Fashion' })}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm rounded-md border border-slate-200 shadow-xs transition-colors cursor-pointer"
                  >
                    Shop Fashion
                  </button>
                </div>

                <div className="pt-4 flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-slate-700 font-semibold border-t border-slate-200/80">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#0b5c37]" />
                    <span>Food-Grade Safe</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-[#0b5c37]" />
                    <span>10-Day Exchange</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-[#0b5c37]" />
                    <span>Special Bundles</span>
                  </div>
                </div>
              </div>

              {/* Visuals for Slide 2 */}
              <div className="lg:col-span-7 relative flex items-center justify-center">
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div
                    onClick={() => onNavigate('product', { productId: 'deal-prod-5' })}
                    className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center space-y-2"
                  >
                    <div className="w-28 h-28 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <ProductImage product={PRODUCTS.find((p) => p.id === 'deal-prod-5') || PRODUCTS[4]} size="sm" showBadge={false} />
                    </div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-[#0b5c37]">Prestige Cooker</span>
                    <span className="text-xs font-black text-[#0b5c37]">₹2,399</span>
                  </div>

                  <div
                    onClick={() => onNavigate('product', { productId: 'deal-prod-3' })}
                    className="p-5 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer group flex flex-col items-center text-center space-y-2"
                  >
                    <div className="w-28 h-28 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <ProductImage product={PRODUCTS.find((p) => p.id === 'deal-prod-3') || PRODUCTS[2]} size="sm" showBadge={false} />
                    </div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-[#0b5c37]">Safari Travel Backpack</span>
                    <span className="text-xs font-black text-[#0b5c37]">₹999</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dots navigation matching screenshot */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
            {[0, 1, 2].map((idx) => (
              <button
                key={idx}
                onClick={() => setHeroSlide(idx)}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  heroSlide === idx
                    ? 'w-6 h-2 bg-[#0b5c37]'
                    : 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 2. VALUE PROPOSITION STRIP (4 PILLARS IN CLEAN WHITE CARD) */}
      {/* --------------------------------------------------------------------- */}
      <ScrollReveal animation="fade-up" delay={50} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {/* Pillar 1: Fast & Free Delivery */}
          <div className="flex items-center gap-3.5 pt-2 sm:pt-0">
            <div className="text-[#0b5c37] shrink-0">
              <Truck className="w-7 h-7 stroke-[1.8]" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Fast &amp; Free Delivery</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">On millions of items</p>
            </div>
          </div>

          {/* Pillar 2: Pay on Delivery */}
          <div className="flex items-center gap-3.5 pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[#0b5c37] shrink-0">
              <ShieldCheck className="w-7 h-7 stroke-[1.8]" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Pay on Delivery</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Cash on delivery available</p>
            </div>
          </div>

          {/* Pillar 3: Top Brands */}
          <div className="flex items-center gap-3.5 pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[#0b5c37] shrink-0">
              <Award className="w-7 h-7 stroke-[1.8]" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Top Brands</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">100% Original Products</p>
            </div>
          </div>

          {/* Pillar 4: 24/7 Customer Support */}
          <div className="flex items-center gap-3.5 pt-2 sm:pt-0 sm:pl-6">
            <div className="text-[#0b5c37] shrink-0">
              <Headphones className="w-7 h-7 stroke-[1.8]" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">24/7 Customer Support</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">We&apos;re here to help</p>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* --------------------------------------------------------------------- */}
      {/* 3. SHOP BY CATEGORY (CIRCULAR ICONS MATCHING SCREENSHOT) */}
      {/* --------------------------------------------------------------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <ScrollReveal animation="fade-in" className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Shop by Category</h2>
          <button
            onClick={() => onNavigate('shop')}
            className="text-xs sm:text-sm font-bold text-[#0b5c37] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>See all</span>
            <span>&rarr;</span>
          </button>
        </ScrollReveal>

        {/* 7 Circular Category Badges - Swipeable on mobile, pristine grid on desktop */}
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
      {/* 4. TODAY'S DEALS CAROUSEL / ROW (MATCHING REFERENCE EXACTLY) */}
      {/* --------------------------------------------------------------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <ScrollReveal animation="fade-in" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Today&apos;s Deals</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
              {todaysDeals.length} Special Offers
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Carousel navigation controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrevDeals}
                className="p-1.5 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                aria-label="Previous deals"
                title="Previous deals"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextDeals}
                className="p-1.5 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                aria-label="Next deals"
                title="Next deals"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => onNavigate('shop')}
              className="text-xs sm:text-sm font-bold text-[#0b5c37] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>See all deals</span>
              <span>&rarr;</span>
            </button>
          </div>
        </ScrollReveal>

        {/* Deals Grid matching screenshot items */}
        <div className="relative">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {currentDeals.map((deal, idx) => (
              <ScrollReveal
                key={deal.id}
                animation="fade-up"
                delay={idx * 70}
                className="bg-white rounded-lg border border-slate-200 p-2.5 sm:p-3.5 flex flex-col justify-between hover:shadow-md transition-all duration-200 cursor-pointer group"
              >
                <div onClick={() => onNavigate('product', { productId: deal.id })}>
                  {/* Product Image Canvas */}
                  <div className="relative aspect-square flex items-center justify-center p-2 bg-white">
                    <ProductImage product={deal} size="md" showBadge={false} />
                  </div>

                  {/* Deal Details */}
                  <div className="pt-3 space-y-1.5">
                    {/* Red Discount Tag */}
                    <div>
                      <span className="inline-block bg-[#cc0c39] text-white text-[11px] font-black px-2 py-0.5 rounded-sm">
                        {deal.discountPercentage}% off
                      </span>
                    </div>

                    {/* Price & Strikethrough Original Price */}
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

                    {/* Product Title */}
                    <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 group-hover:text-[#0b5c37] transition-colors leading-snug">
                      {deal.name}
                    </h3>

                    {/* Rating Stars & Count */}
                    <div className="flex items-center gap-1 pt-1 text-xs text-slate-500">
                      <div className="flex items-center text-[#f59e0b]">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-current stroke-none" />
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
                    className="w-full py-1.5 bg-slate-50 hover:bg-[#0b5c37] text-slate-700 hover:text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ShoppingBag className="w-3 h-3" />
                    <span>Add to Cart</span>
                  </button>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* 5. SHOP CART PRIME MEMBERSHIP BANNER (MATCHING REFERENCE EXACTLY) */}
      {/* --------------------------------------------------------------------- */}
      <ScrollReveal animation="fade-up" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl overflow-hidden bg-[#a3c3a4] border border-slate-200/80 shadow-sm relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
            {/* Left curved white shape */}
            <div className="lg:col-span-6 bg-white p-6 sm:p-10 lg:rounded-r-[100px] space-y-4 z-10">
              <div className="flex items-center gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-[#0b5c37] tracking-tight">
                  shop cart
                </span>
                <span className="text-xl sm:text-2xl font-bold text-[#0b5c37] tracking-tight italic">
                  prime
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  One membership,
                  <br />
                  many benefits
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium pt-1">
                  Free delivery, top movies, exclusive deals &amp; more
                </p>
              </div>

              <div>
                <button
                  onClick={() => {
                    showToast('Welcome to Shop Cart Prime Free Trial! Enjoy free express delivery.', 'success');
                    onNavigate('shop');
                  }}
                  className="px-5 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs sm:text-sm rounded-md shadow-sm transition-colors cursor-pointer"
                >
                  Join Prime Now
                </button>
              </div>
            </div>

            {/* Right side: Delivery boxes, Popcorn, and Video streaming tablet */}
            <div className="lg:col-span-6 p-6 sm:p-8 flex items-center justify-center relative min-h-[220px]">
              <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
                {/* Stack of Delivery Boxes */}
                <div className="flex flex-col items-center">
                  <div className="w-20 h-16 sm:w-28 sm:h-20 bg-[#d4a373] rounded-sm border border-[#bc8a5f] shadow-md p-2 flex flex-col justify-between">
                    <span className="text-[8px] font-mono font-bold text-slate-800">shop cart</span>
                    <div className="h-0.5 bg-[#bc8a5f] w-full" />
                  </div>
                  <div className="w-28 h-20 sm:w-36 sm:h-24 bg-[#cca379] rounded-sm border border-[#bc8a5f] shadow-lg -mt-3 p-2.5 flex flex-col justify-between">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-[#111827]">shop cart</span>
                      <span className="text-[8px] font-mono bg-[#0b5c37] text-white px-1 rounded">prime</span>
                    </div>
                    <div className="h-1 bg-[#0b5c37] w-12 rounded" />
                  </div>
                </div>

                {/* Popcorn Bowl */}
                <div className="w-16 h-14 sm:w-20 sm:h-16 relative flex flex-col items-center justify-end">
                  <div className="text-sm">🍿</div>
                  <div className="w-16 h-10 bg-white rounded-b-full border border-slate-300 shadow-sm flex items-center justify-center text-[9px] font-bold text-slate-700">
                    Prime
                  </div>
                </div>

                {/* Tablet Display */}
                <div
                  onClick={() => {
                    showToast('Opening Shop Cart Prime Video Player...', 'info');
                  }}
                  className="w-40 sm:w-52 aspect-[16/10] bg-slate-950 rounded-lg p-1.5 border-2 border-slate-700 shadow-xl flex flex-col justify-between overflow-hidden relative cursor-pointer group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 flex flex-col justify-between p-2 group-hover:scale-105 transition-transform">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-sky-400">prime video</span>
                      <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <h4 className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">THE BOYS</h4>
                      <p className="text-[8px] text-slate-400">Stream New Season Now</p>
                    </div>
                    <div className="flex items-center gap-1 text-[8px] text-slate-300">
                      <Play className="w-2.5 h-2.5 fill-white" />
                      <span>Watch Trailer</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom 4 Benefits Strip */}
          <div className="bg-white border-t border-slate-200/90 py-3 px-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-slate-800">
            <div className="flex items-center justify-center gap-2">
              <Truck className="w-4 h-4 text-[#0b5c37]" />
              <span>FREE Delivery</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Play className="w-4 h-4 text-[#0b5c37]" />
              <span>Prime Video</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Tag className="w-4 h-4 text-[#0b5c37]" />
              <span>Exclusive Deals</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Music className="w-4 h-4 text-[#0b5c37]" />
              <span>Prime Music</span>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* --------------------------------------------------------------------- */}
      {/* 6. BEST SELLERS / POPULAR PRODUCTS GRID */}
      {/* --------------------------------------------------------------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <ScrollReveal animation="fade-in" className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Featured &amp; Best Sellers</h2>
          <button
            onClick={() => onNavigate('shop')}
            className="text-xs sm:text-sm font-bold text-[#0b5c37] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Explore full catalog</span>
            <span>&rarr;</span>
          </button>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {PRODUCTS.slice(5).map((prod, idx) => (
            <ScrollReveal
              key={prod.id}
              animation="fade-up"
              delay={idx * 50}
              className="bg-white rounded-lg border border-slate-200 p-4 flex flex-col justify-between hover:shadow-md transition-all cursor-pointer group"
            >
              <div onClick={() => onNavigate('product', { productId: prod.id })}>
                {/* Product Image */}
                <div className="relative aspect-square flex items-center justify-center bg-white p-2">
                  <ProductImage product={prod} size="md" showBadge={false} />
                  {prod.badge && (
                    <span className="absolute top-2 left-2 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">
                      {prod.badge}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="pt-3 space-y-1">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    {prod.brand}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-[#0b5c37] transition-colors leading-snug">
                    {prod.name}
                  </h3>

                  <div className="flex items-center gap-1 text-xs text-slate-500 pt-0.5">
                    <div className="flex items-center text-[#f59e0b]">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-current stroke-none" />
                      ))}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      ({prod.reviewsCount})
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 pt-1.5">
                    <span className="text-lg font-bold text-slate-900 tabular-nums">
                      {formatPrice(prod.price)}
                    </span>
                    {prod.originalPrice > prod.price && (
                      <span className="text-xs text-slate-400 line-through tabular-nums">
                        {formatPrice(prod.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Add to Cart button */}
              <div className="pt-3">
                <button
                  onClick={(e) => handleAddToCart(e, prod)}
                  className="w-full py-2 bg-[#f3f4f6] hover:bg-[#0b5c37] text-slate-800 hover:text-white text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Add to Cart</span>
                </button>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* PWA Mobile App Download / Install Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <PWAInstallButton variant="banner" />
      </section>
    </div>
  );
};
