import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Star,
  ShoppingBag,
  Heart,
  Truck,
  RotateCcw,
  ShieldCheck,
  Check,
  ChevronRight,
  ArrowRight,
  Share2,
  ThumbsUp,
  MessageSquare,
  Zap,
  ZoomIn,
  X,
  Maximize2,
  Sliders,
  Sparkles,
  Award,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { Product, PageView, Review } from '../types';
import { PRODUCTS, MOCK_REVIEWS } from '../data/mockData';
import { ProductImage } from '../components/common/ProductImage';
import { formatPrice } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchProductById } from '../services/productService';

interface ProductDetailPageProps {
  productId: string;
  onNavigate: (page: PageView, params?: { productId?: string; category?: string; query?: string }) => void;
  onQuickView: (product: Product) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  productId,
  onNavigate,
  onQuickView,
}) => {
  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const { showToast } = useToast();

  // Find initial fallback product
  const initialProduct = useMemo(() => {
    return PRODUCTS.find((p) => p.id === productId) || PRODUCTS[0];
  }, [productId]);

  const [product, setProduct] = useState<Product>(initialProduct);
  const [isFromSupabase, setIsFromSupabase] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadProduct() {
      const res = await fetchProductById(productId);
      if (isMounted && res.product) {
        setProduct(res.product);
        setIsFromSupabase(res.isFromSupabase);
        if (res.product.colors && res.product.colors.length > 0) {
          setSelectedColor(res.product.colors[0].name);
        }
        if (res.product.sizes && res.product.sizes.length > 0) {
          setSelectedSize(res.product.sizes[0]);
        }
      }
    }
    loadProduct();
    return () => {
      isMounted = false;
    };
  }, [productId]);

  // Gallery view angles definition
  const galleryViews = useMemo(() => [
    { id: 'hero', name: 'Studio Hero', label: 'Perspective View', transform: 'scale(1)' },
    { id: 'profile', name: 'Profile Angle', label: 'Side Profile', transform: 'rotate(-4deg) scale(0.98)' },
    { id: 'macro', name: 'Material Macro', label: 'Detail Focus', transform: 'scale(1.25)' },
    { id: 'lifestyle', name: 'Studio Context', label: 'Ambient View', transform: 'rotate(3deg) scale(1.02)' },
  ], []);

  // Component States
  const [selectedColor, setSelectedColor] = useState(initialProduct.colors[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState(initialProduct.sizes ? initialProduct.sizes[0] : '');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'details' | 'specs' | 'reviews' | 'shipping'>('details');
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);

  // Interactive Image Zoom States
  const [isZooming, setIsZooming] = useState(false);
  const [zoomCoords, setZoomCoords] = useState({ x: 50, y: 50 });
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1.5);

  // Review Form States
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [newReviewAuthor, setNewReviewAuthor] = useState('');
  const [newReviewTitle, setNewReviewTitle] = useState('');
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [helpfulVotes, setHelpfulVotes] = useState<Record<string, number>>({});

  // Dynamic reset whenever productId shifts
  useEffect(() => {
    setSelectedColor(product.colors[0]?.name || '');
    setSelectedSize(product.sizes ? product.sizes[0] : '');
    setQuantity(1);
    setActiveGalleryIndex(0);
    setIsZooming(false);
    setIsWriteReviewOpen(false);

    // Load or seed reviews for current product
    const existing = MOCK_REVIEWS.filter((r) => r.productId === product.id);
    if (existing.length > 0) {
      setReviews(existing);
    } else {
      setReviews([
        {
          id: `rev-${product.id}-1`,
          productId: product.id,
          author: 'Michael R.',
          rating: 5,
          date: 'October 28, 2026',
          title: 'Exceeded all my expectations',
          comment: `The build quality of the ${product.name} is simply extraordinary. Attention to detail is evident in every single millimeter. Arrived impeccably boxed with zero plastic.`,
          verified: true,
        },
        {
          id: `rev-${product.id}-2`,
          productId: product.id,
          author: 'Elena Rostova',
          rating: 5,
          date: 'October 22, 2026',
          title: 'Premium grade design and feel',
          comment: `Looks even better in person than the photos. Materials are authentic, finish is flawless, and it was delivered within 48 hours. Five stars!`,
          verified: true,
        },
      ]);
    }

    // Scroll to top of viewport
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [productId, product]);

  const activeColorObj = product.colors.find((c) => c.name === selectedColor) || product.colors[0];

  // Mouse Move handler for fluid cursor zoom lens
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setZoomCoords({ x, y });
  };

  const handleAddToCart = () => {
    addToCart(product, quantity, selectedColor, selectedSize);
    showToast(`Added ${quantity}x ${product.name} (${selectedColor || 'Standard'}) to cart!`, 'success');
  };

  const handleBuyNow = () => {
    addToCart(product, quantity, selectedColor, selectedSize);
    showToast(`Proceeding to checkout with ${product.name}`, 'info');
    onNavigate('checkout');
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      showToast('Product link copied to clipboard!', 'info');
    }
  };

  const handleHelpfulClick = (revId: string) => {
    setHelpfulVotes((prev) => ({
      ...prev,
      [revId]: (prev[revId] || 12) + 1,
    }));
    showToast('Thank you for your feedback!', 'info');
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewAuthor.trim() || !newReviewComment.trim()) {
      showToast('Please fill in your name and review', 'error');
      return;
    }

    const review: Review = {
      id: 'rev-' + Date.now(),
      productId: product.id,
      author: newReviewAuthor.trim(),
      rating: newReviewRating,
      date: 'Just now',
      title: newReviewTitle.trim() || 'Verified Customer Review',
      comment: newReviewComment.trim(),
      verified: true,
    };

    setReviews([review, ...reviews]);
    setIsWriteReviewOpen(false);
    setNewReviewAuthor('');
    setNewReviewTitle('');
    setNewReviewComment('');
    showToast('Thank you! Your verified review has been published.', 'success');
  };

  // Related products (guaranteed 4 distinct products)
  const relatedProducts = useMemo(() => {
    const sameCategory = PRODUCTS.filter(
      (p) => p.category === product.category && p.id !== product.id
    );
    if (sameCategory.length >= 4) {
      return sameCategory.slice(0, 4);
    }
    const others = PRODUCTS.filter(
      (p) => p.category !== product.category && p.id !== product.id
    );
    return [...sameCategory, ...others].slice(0, 4);
  }, [product.category, product.id]);

  const isInWish = isInWishlist(product.id);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12 bg-white">
      {/* 1. Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <button
          onClick={() => onNavigate('home')}
          className="hover:text-[#0b5c37] transition-colors cursor-pointer"
        >
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <button
          onClick={() => onNavigate('shop')}
          className="hover:text-[#0b5c37] transition-colors cursor-pointer"
        >
          Shop
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <button
          onClick={() => onNavigate('shop', { category: product.category })}
          className="hover:text-[#0b5c37] transition-colors cursor-pointer font-medium"
        >
          {product.category}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-bold truncate max-w-xs">{product.name}</span>
      </nav>

      {/* 2. Main Contiguous Product Showcase (PDP) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: Large Product Image Gallery & Zoom */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col-reverse sm:flex-row gap-4 items-start">
            {/* Gallery Thumbnails Column */}
            <div className="flex sm:flex-col gap-2.5 overflow-x-auto sm:overflow-visible w-full sm:w-24 shrink-0 pb-2 sm:pb-0">
              {galleryViews.map((view, idx) => (
                <button
                  key={view.id}
                  onClick={() => setActiveGalleryIndex(idx)}
                  className={`p-1.5 rounded-2xl border bg-white transition-all cursor-pointer text-left flex sm:flex-col items-center gap-2 sm:gap-1.5 ${
                    activeGalleryIndex === idx
                      ? 'border-[#0b5c37] ring-2 ring-[#0b5c37]/30 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'
                  }`}
                  title={view.label}
                >
                  <div className="w-14 sm:w-full h-14 sm:h-16 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden">
                    <div style={{ transform: view.transform }}>
                      <ProductImage
                        product={product}
                        size="sm"
                        showBadge={false}
                        selectedColor={activeColorObj?.hex}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 block truncate text-center w-full px-1">
                    {view.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Main Interactive Image Canvas with Zoom Lens */}
            <div className="flex-1 w-full bg-white rounded-3xl border border-slate-200/90 shadow-2xs relative overflow-hidden group">
              <div
                className="relative w-full h-96 sm:h-[480px] flex items-center justify-center p-6 cursor-crosshair overflow-hidden select-none"
                onMouseEnter={() => setIsZooming(true)}
                onMouseLeave={() => setIsZooming(false)}
                onMouseMove={handleMouseMove}
                onClick={() => setIsLightboxOpen(true)}
              >
                {/* Visual Canvas with Hover Zoom */}
                <div
                  className="w-full h-full flex items-center justify-center transition-transform"
                  style={{
                    transformOrigin: `${zoomCoords.x}% ${zoomCoords.y}%`,
                    transform: isZooming
                      ? `scale(2.2) ${galleryViews[activeGalleryIndex].transform}`
                      : galleryViews[activeGalleryIndex].transform,
                    transition: isZooming ? 'transform 0.05s ease-out' : 'transform 0.3s ease-out',
                  }}
                >
                  <ProductImage
                    product={product}
                    size="xl"
                    selectedColor={activeColorObj?.hex}
                  />
                </div>

                {/* Zoom Helper Indicator */}
                <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-lg pointer-events-none transition-opacity duration-200 opacity-80 group-hover:opacity-100">
                  <ZoomIn className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isZooming ? 'Zoom Active' : 'Hover to Zoom · Click to Enlarge'}</span>
                </div>

                {/* Discount Tag */}
                {product.discountPercentage && product.discountPercentage > 0 && (
                  <span className="absolute top-4 left-4 bg-[#0b5c37] text-white text-xs font-black px-3 py-1 rounded-lg shadow-sm">
                    -{product.discountPercentage}% OFF
                  </span>
                )}

                {/* Floating Action Icons: Share & Wishlist */}
                <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLightboxOpen(true);
                    }}
                    className="p-2.5 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-[#0b5c37] shadow-md transition-colors cursor-pointer"
                    title="Fullscreen Lightbox"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShare();
                    }}
                    className="p-2.5 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-[#0b5c37] shadow-md transition-colors cursor-pointer"
                    title="Share product"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWishlist(product.id);
                    }}
                    className={`p-2.5 rounded-full shadow-md transition-colors cursor-pointer ${
                      isInWish
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/90 hover:bg-white text-slate-700 hover:text-rose-500'
                    }`}
                    title={isInWish ? 'Remove from wishlist' : 'Save to wishlist'}
                  >
                    <Heart className={`w-4 h-4 ${isInWish ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Color Palette Strip under Gallery */}
          {product.colors.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Available Color Finishes:</span>
                <span className="text-xs font-extrabold text-[#0b5c37]">{selectedColor}</span>
              </div>
              <div className="flex items-center gap-2.5">
                {product.colors.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setSelectedColor(c.name)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      selectedColor === c.name
                        ? 'border-[#0b5c37] bg-white text-emerald-950 ring-2 ring-[#0b5c37]/20 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Contiguous Purchase Module */}
        <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-2xs space-y-6">
          <div>
            {/* Brand & Category Header */}
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <button
                onClick={() => onNavigate('shop', { query: product.brand })}
                className="font-extrabold uppercase tracking-wider text-[#0b5c37] hover:text-[#08482b] transition-colors cursor-pointer"
              >
                {product.brand}
              </button>
              <span className="text-[11px] font-mono font-medium text-slate-400">
                SKU: {product.id.toUpperCase()}
              </span>
            </div>

            {/* Product Title */}
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950 leading-tight">
              {product.name}
            </h1>

            {/* Ratings & Reviews Tally */}
            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < Math.floor(product.rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-black text-slate-900">{product.rating}</span>
              <span className="text-slate-300">·</span>
              <button
                onClick={() => setActiveTab('reviews')}
                className="text-xs text-[#0b5c37] hover:underline font-bold cursor-pointer"
              >
                {reviews.length} verified reviews
              </button>
            </div>
          </div>

          {/* Pricing Box & Savings */}
          <div className="p-5 rounded-2xl bg-emerald-50/40 border border-emerald-200/70 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black text-slate-950 tabular-nums">
                  {formatPrice(product.price)}
                </span>
                {product.originalPrice > product.price && (
                  <span className="text-base sm:text-lg text-slate-400 line-through tabular-nums font-semibold">
                    {formatPrice(product.originalPrice)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Includes all applicable taxes · Free insured courier shipping
              </p>
            </div>

            {product.discountPercentage && product.discountPercentage > 0 && (
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-[#0b5c37] text-white text-xs font-black rounded-lg shadow-2xs">
                  Save ${product.originalPrice - product.price} ({product.discountPercentage}%)
                </span>
              </div>
            )}
          </div>

          {/* Product Description Short Summary */}
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {product.shortDescription}
          </p>

          {/* Color Selector */}
          {product.colors.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-800">
                <span>Color Finish:</span>
                <span className="text-[#0b5c37]">{selectedColor}</span>
              </div>
              <div className="flex items-center gap-3">
                {product.colors.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setSelectedColor(c.name)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedColor === c.name
                        ? 'ring-2 ring-[#0b5c37] ring-offset-2 scale-110 shadow-sm'
                        : 'hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {selectedColor === c.name && (
                      <Check className="w-4 h-4 text-white drop-shadow-sm" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Available Sizes Selector */}
          {product.sizes && product.sizes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Select Size:</span>
                <span className="text-slate-500 text-[11px] font-normal underline cursor-pointer hover:text-slate-800">
                  Size Guide & Measurements
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSize(s)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      selectedSize === s
                        ? 'border-[#0b5c37] bg-[#0b5c37] text-white shadow-xs'
                        : 'border-slate-200 text-slate-700 hover:border-slate-400 bg-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock Availability & Quantity Selector */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <div>
              <span className="text-xs font-bold text-slate-700 block mb-1.5">Quantity:</span>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
                >
                  -
                </button>
                <span className="px-4 py-2 text-xs font-black text-slate-900 tabular-nums">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(Math.min(product.stockCount, quantity + 1))}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="text-right">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>In Stock & Ready to Dispatch</span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                Only <strong>{product.stockCount} units</strong> available in warehouse
              </span>
            </div>
          </div>

          {/* Primary Action Buttons: Add to Cart + Buy Now */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleAddToCart}
              className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-2 group cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>Add to Shopping Cart</span>
            </button>

            <button
              onClick={handleBuyNow}
              className="w-full py-4 px-6 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs sm:text-sm font-black rounded-xl transition-all shadow-lg shadow-emerald-900/10 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>Buy Now — Instant Checkout</span>
            </button>
          </div>

          {/* Confidence & Delivery Guarantees */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <Truck className="w-4 h-4 text-[#0b5c37] shrink-0" />
              <span>
                Free express courier shipping · Arrives in <strong>2-3 Business Days</strong>
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <RotateCcw className="w-4 h-4 text-[#0b5c37] shrink-0" />
              <span>30-Day unconditional money-back returns with free pickup</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#0b5c37] shrink-0" />
              <span>Official manufacturer warranty & 24/7 dedicated customer care</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Deep Dive Tabs: Description, Specs, Reviews, Shipping */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Tab Headers */}
        <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-6 py-4 text-xs sm:text-sm font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'details'
                ? 'border-[#0b5c37] text-[#0b5c37] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Product Overview & Highlights
          </button>
          <button
            onClick={() => setActiveTab('specs')}
            className={`px-6 py-4 text-xs sm:text-sm font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'specs'
                ? 'border-[#0b5c37] text-[#0b5c37] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Technical Specifications
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-6 py-4 text-xs sm:text-sm font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'reviews'
                ? 'border-[#0b5c37] text-[#0b5c37] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Customer Reviews ({reviews.length})
          </button>
          <button
            onClick={() => setActiveTab('shipping')}
            className={`px-6 py-4 text-xs sm:text-sm font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'shipping'
                ? 'border-[#0b5c37] text-[#0b5c37] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Shipping & Returns
          </button>
        </div>

        {/* Tab Content Panes */}
        <div className="p-6 sm:p-8">
          {/* Tab 1: Overview & Features */}
          {activeTab === 'details' && (
            <div className="space-y-8">
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Detailed Overview</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-4xl">
                  {product.fullDescription}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0b5c37]" />
                  <span>Key Features & Engineering Highlights</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {product.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-700"
                    >
                      <Check className="w-4 h-4 text-[#0b5c37] shrink-0 mt-0.5" />
                      <span className="leading-relaxed font-semibold">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Specifications */}
          {activeTab === 'specs' && (
            <div className="space-y-6">
              <h3 className="text-base font-bold text-slate-900">Comprehensive Technical Specifications</h3>
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-w-3xl">
                {Object.entries(product.specs).map(([specKey, specVal]) => (
                  <div key={specKey} className="grid grid-cols-1 sm:grid-cols-3 p-4 text-xs">
                    <span className="font-bold text-slate-500">{specKey}</span>
                    <span className="sm:col-span-2 text-slate-900 font-semibold">{specVal}</span>
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-3 p-4 text-xs">
                  <span className="font-bold text-slate-500">Department</span>
                  <span className="sm:col-span-2 text-slate-900 font-semibold">{product.category}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 p-4 text-xs">
                  <span className="font-bold text-slate-500">Brand Maker</span>
                  <span className="sm:col-span-2 text-slate-900 font-semibold">{product.brand}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 p-4 text-xs">
                  <span className="font-bold text-slate-500">Package Contents</span>
                  <span className="sm:col-span-2 text-slate-900 font-semibold">
                    1x {product.name}, Warranty Card, User Guide, Eco-Packaging
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Customer Reviews */}
          {activeTab === 'reviews' && (
            <div className="space-y-8">
              {/* Rating Summary Bar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 sm:p-8 bg-slate-50 rounded-3xl border border-slate-200/80 items-center">
                <div className="md:col-span-4 flex flex-col items-center sm:items-start text-center sm:text-left space-y-1">
                  <div className="text-5xl font-black text-slate-950 tabular-nums">
                    {product.rating}
                  </div>
                  <div className="flex items-center text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Based on {reviews.length} customer ratings
                  </span>
                </div>

                {/* Rating Distribution Bars */}
                <div className="md:col-span-5 space-y-1.5 text-xs">
                  {[
                    { stars: 5, pct: '85%' },
                    { stars: 4, pct: '12%' },
                    { stars: 3, pct: '3%' },
                    { stars: 2, pct: '0%' },
                    { stars: 1, pct: '0%' },
                  ].map((row) => (
                    <div key={row.stars} className="flex items-center gap-2">
                      <span className="w-12 text-slate-500 font-semibold">{row.stars} stars</span>
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: row.pct }}
                        />
                      </div>
                      <span className="w-8 text-right text-slate-400 tabular-nums">{row.pct}</span>
                    </div>
                  ))}
                </div>

                <div className="md:col-span-3 flex justify-center md:justify-end">
                  <button
                    onClick={() => setIsWriteReviewOpen(true)}
                    className="px-5 py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-900/10 flex items-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Write a Review</span>
                  </button>
                </div>
              </div>

              {/* Review Write Form Modal / Dropdown */}
              {isWriteReviewOpen && (
                <form
                  onSubmit={handleAddReview}
                  className="p-6 bg-emerald-50/60 rounded-3xl border border-emerald-200 space-y-4 animate-in fade-in-50"
                >
                  <h4 className="text-sm font-black text-slate-900">Share Your Experience</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Your Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Jordan Hayes"
                        value={newReviewAuthor}
                        onChange={(e) => setNewReviewAuthor(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0b5c37]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Rating *</label>
                      <select
                        value={newReviewRating}
                        onChange={(e) => setNewReviewRating(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0b5c37] font-bold"
                      >
                        <option value="5">★★★★★ 5 Stars (Outstanding Quality)</option>
                        <option value="4">★★★★☆ 4 Stars (Very Good)</option>
                        <option value="3">★★★☆☆ 3 Stars (Satisfactory)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Review Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Flawless craftsmanship and rapid delivery"
                      value={newReviewTitle}
                      onChange={(e) => setNewReviewTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0b5c37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Review Comments *</label>
                    <textarea
                      rows={3}
                      placeholder="Share details of your experience with build quality, ergonomics, packaging, and performance..."
                      value={newReviewComment}
                      onChange={(e) => setNewReviewComment(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0b5c37]"
                      required
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsWriteReviewOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl cursor-pointer shadow-md"
                    >
                      Publish Review
                    </button>
                  </div>
                </form>
              )}

              {/* Reviews List */}
              <div className="space-y-4">
                {reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center text-amber-400">
                          {[...Array(rev.rating)].map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-slate-900">{rev.title}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">{rev.date}</span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-slate-700">
                        {rev.author}{' '}
                        {rev.verified && (
                          <span className="text-[#0b5c37] font-bold">· Verified Buyer</span>
                        )}
                      </span>
                      <button
                        onClick={() => handleHelpfulClick(rev.id)}
                        className="flex items-center gap-1 hover:text-[#0b5c37] cursor-pointer font-medium"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>Helpful ({helpfulVotes[rev.id] || 12})</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Shipping & Returns */}
          {activeTab === 'shipping' && (
            <div className="space-y-6 max-w-4xl text-xs sm:text-sm text-slate-600 leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#0b5c37]" />
                    <span>Free Standard Shipping</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Complimentary carbon-neutral standard delivery takes 2–4 business days. Dispatched directly from our regional fulfillment centers within 24 hours of order placement.
                  </p>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-[#0b5c37]" />
                    <span>30-Day Money-Back Returns</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    If this item doesn’t completely exceed your expectations, initiate a hassle-free return within 30 days for a 100% refund and prepaid courier collection label.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Related Products Section */}
      {relatedProducts.length > 0 && (
        <section className="space-y-6 pt-4">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#0b5c37] block mb-1">
                You Might Also Like
              </span>
              <h2 className="text-2xl font-black text-slate-950 tracking-tight">
                Related Products
              </h2>
            </div>
            <button
              onClick={() => onNavigate('shop', { category: product.category })}
              className="text-xs font-bold text-[#0b5c37] hover:text-[#08482b] flex items-center gap-1 cursor-pointer"
            >
              <span>Explore more in {product.category}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedProducts.map((relProduct) => (
              <div
                key={relProduct.id}
                className="group bg-white rounded-3xl border border-slate-200/90 hover:border-[#0b5c37] hover:shadow-xl transition-all duration-300 p-4 flex flex-col justify-between"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => onNavigate('product', { productId: relProduct.id })}
                >
                  <ProductImage product={relProduct} size="md" />

                  <div className="pt-3">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="font-extrabold uppercase text-[#0b5c37]">
                        {relProduct.brand}
                      </span>
                      <span className="flex items-center gap-1 text-slate-800 font-bold">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{relProduct.rating}</span>
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#0b5c37] transition-colors line-clamp-1">
                      {relProduct.name}
                    </h4>

                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {relProduct.shortDescription}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-black text-slate-950 tabular-nums">
                      {formatPrice(relProduct.price)}
                    </span>
                    {relProduct.originalPrice > relProduct.price && (
                      <span className="text-[11px] text-slate-400 line-through tabular-nums">
                        ${relProduct.originalPrice}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onQuickView(relProduct)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      title="Quick View"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => addToCart(relProduct, 1)}
                      className="p-2 rounded-xl bg-slate-900 hover:bg-[#0b5c37] text-white transition-colors cursor-pointer"
                      title="Add to Cart"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Fullscreen Lightbox Zoom Modal */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center">
            {/* Lightbox Header */}
            <div className="w-full flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-bold uppercase text-[#0b5c37] tracking-wider">
                  {product.brand}
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  {product.name} — High Definition Inspector
                </h3>
              </div>
              <button
                onClick={() => setIsLightboxOpen(false)}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lightbox Visual Area */}
            <div className="w-full h-96 sm:h-[450px] flex items-center justify-center p-8 overflow-hidden">
              <div
                style={{
                  transform: `scale(${lightboxScale}) ${galleryViews[activeGalleryIndex].transform}`,
                  transition: 'transform 0.2s ease-out',
                }}
              >
                <ProductImage
                  product={product}
                  size="xl"
                  showBadge={false}
                  selectedColor={activeColorObj?.hex}
                />
              </div>
            </div>

            {/* Lightbox Zoom Controls & Color Swatches */}
            <div className="w-full pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-slate-500">Scale:</span>
                {[1, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setLightboxScale(s)}
                    className={`px-3 py-1 rounded-lg border cursor-pointer ${
                      lightboxScale === s
                        ? 'border-[#0b5c37] bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s * 100}%
                  </button>
                ))}
              </div>

              {/* Color switcher inside lightbox */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Color:</span>
                <div className="flex items-center gap-2">
                  {product.colors.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setSelectedColor(c.name)}
                      className={`w-6 h-6 rounded-full border cursor-pointer ${
                        selectedColor === c.name ? 'ring-2 ring-[#0b5c37] scale-110' : ''
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  setIsLightboxOpen(false);
                  handleAddToCart();
                }}
                className="px-5 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Add to Cart ({formatPrice(product.price)})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
