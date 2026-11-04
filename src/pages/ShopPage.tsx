import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Filter,
  Grid,
  List,
  Star,
  ShoppingBag,
  Heart,
  Eye,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  X,
  Search,
  Zap,
  Check,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react';
import { Product, PageView } from '../types';
import { PRODUCTS as FALLBACK_PRODUCTS, CATEGORIES as FALLBACK_CATEGORIES } from '../data/mockData';
import { ProductImage } from '../components/common/ProductImage';
import { formatPrice } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchProducts, fetchCategories } from '../services/productService';
import { isSupabaseConfigured } from '../lib/supabase';

interface ShopPageProps {
  initialCategory?: string;
  initialQuery?: string;
  onNavigate: (page: PageView, params?: { productId?: string; category?: string }) => void;
  onQuickView: (product: Product) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({
  initialCategory = 'all',
  initialQuery = '',
  onNavigate,
  onQuickView,
}) => {
  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const { showToast } = useToast();

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(25000);
  const [minRating, setMinRating] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'popularity' | 'price-low' | 'price-high' | 'rating' | 'newest'>('popularity');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Pagination & Load More States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(9);
  const [visibleCount, setVisibleCount] = useState(9);

  const productGridRef = useRef<HTMLDivElement>(null);

  // Sync props when user searches or clicks category externally
  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
      setCurrentPage(1);
      setVisibleCount(itemsPerPage);
    }
  }, [initialCategory]);

  useEffect(() => {
    if (initialQuery !== undefined) {
      setSearchQuery(initialQuery);
      setCurrentPage(1);
      setVisibleCount(itemsPerPage);
    }
  }, [initialQuery]);

  // Supabase real-time data state
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [isLiveFromSupabase, setIsLiveFromSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadShopData() {
      setIsLoading(true);
      const res = await fetchProducts();
      const cats = await fetchCategories();
      if (isMounted) {
        if (res.products && res.products.length > 0) {
          setProducts(res.products);
          setIsLiveFromSupabase(res.isFromSupabase);
        }
        if (cats && cats.length > 0) {
          setCategories(cats);
        }
        setIsLoading(false);
      }
    }
    loadShopData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Extract all unique brands dynamically
  const allBrands = useMemo(() => {
    const brandsSet = new Set<string>();
    products.forEach((p) => brandsSet.add(p.brand));
    return Array.from(brandsSet).sort();
  }, [products]);

  // Filter products by search, category, brands, price range, rating, in-stock
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // 1. Category Filter
      if (selectedCategory !== 'all' && product.category !== selectedCategory) {
        return false;
      }

      // 2. Search Query (Name, Brand, Category, Tags, Description)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesBrand = product.brand.toLowerCase().includes(query);
        const matchesCategory = product.category.toLowerCase().includes(query);
        const matchesTags = product.tags.some((t) => t.toLowerCase().includes(query));
        const matchesDesc = product.shortDescription.toLowerCase().includes(query);

        if (!matchesName && !matchesBrand && !matchesCategory && !matchesTags && !matchesDesc) {
          return false;
        }
      }

      // 3. Brand Filter (Multi-select)
      if (selectedBrands.length > 0 && !selectedBrands.includes(product.brand)) {
        return false;
      }

      // 4. Price Range
      if (product.price < minPrice || product.price > maxPrice) {
        return false;
      }

      // 5. Rating Filter
      if (minRating > 0 && product.rating < minRating) {
        return false;
      }

      // 6. In Stock Filter
      if (inStockOnly && !product.inStock) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      // Sorting Options
      if (sortBy === 'price-low') {
        return a.price - b.price;
      }
      if (sortBy === 'price-high') {
        return b.price - a.price;
      }
      if (sortBy === 'rating') {
        return b.rating - a.rating;
      }
      if (sortBy === 'newest') {
        const aNew = a.isNewArrival ? 1 : 0;
        const bNew = b.isNewArrival ? 1 : 0;
        if (bNew !== aNew) return bNew - aNew;
        return b.id.localeCompare(a.id);
      }
      // 'popularity' (Default)
      const aScore = (a.isBestSeller ? 100 : 0) + a.rating * 10 + a.reviewsCount * 0.1;
      const bScore = (b.isBestSeller ? 100 : 0) + b.rating * 10 + b.reviewsCount * 0.1;
      return bScore - aScore;
    });
  }, [selectedCategory, searchQuery, selectedBrands, minPrice, maxPrice, minRating, inStockOnly, sortBy]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setVisibleCount(itemsPerPage);
  }, [selectedCategory, searchQuery, selectedBrands, minPrice, maxPrice, minRating, inStockOnly, sortBy, itemsPerPage]);

  // Paginated slices
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // For Load More view
  const loadMoreProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    if (productGridRef.current) {
      productGridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(prev + itemsPerPage, filteredProducts.length));
  };

  const handleToggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  const resetFilters = () => {
    setSelectedCategory('all');
    setSelectedBrands([]);
    setSearchQuery('');
    setMinPrice(0);
    setMaxPrice(25000);
    setMinRating(0);
    setInStockOnly(false);
    setSortBy('popularity');
    setCurrentPage(1);
    setVisibleCount(itemsPerPage);
  };

  const handleBuyNow = (product: Product) => {
    addToCart(product, 1);
    showToast(`Proceeding to checkout with ${product.name}`, 'info');
    onNavigate('checkout');
  };

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    selectedBrands.length > 0 ||
    searchQuery.trim() !== '' ||
    minPrice > 0 ||
    maxPrice < 25000 ||
    minRating > 0 ||
    inStockOnly;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <button
          onClick={() => onNavigate('home')}
          className="hover:text-[#0b5c37] transition-colors cursor-pointer"
        >
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-semibold">Shop Catalog</span>
        {selectedCategory !== 'all' && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[#0b5c37] font-semibold">{selectedCategory}</span>
          </>
        )}
      </nav>

      {/* Page Header Strip & Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
              {selectedCategory === 'all' ? 'All Curated Products' : selectedCategory}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-xs">
              {filteredProducts.length} items
            </span>
            {isLiveFromSupabase ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Supabase Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-medium">
                Demo Catalog
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Browse our hand-picked inventory with free insured shipping on orders over ₹499.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* In-page Search Bar */}
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Search in catalog..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2 pl-8 pr-7 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-900 placeholder:text-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0b5c37] transition-all"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Mobile Filter Trigger Button */}
          <button
            onClick={() => setIsMobileFiltersOpen(true)}
            className="lg:hidden flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs cursor-pointer hover:bg-slate-50"
          >
            <Filter className="w-4 h-4 text-[#0b5c37]" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-[#0b5c37]" />
            )}
          </button>

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 hidden xl:inline font-medium">Sort By:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0b5c37] appearance-none cursor-pointer shadow-2xs"
              >
                <option value="popularity">Popularity & Best Sellers</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Highest Customer Rating</option>
                <option value="newest">Newest Arrivals First</option>
              </select>
              <ArrowUpDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Grid / List Layout Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Shop Layout: Sidebar Filters + Products Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden lg:block space-y-6 sticky top-24">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#0b5c37]" />
                <span>Filters</span>
              </span>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="text-[11px] font-bold text-[#0b5c37] hover:text-[#08482b] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset All</span>
                </button>
              )}
            </div>

            {/* 1. Category Filter */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2.5">
                Categories
              </h4>
              <div className="space-y-1">
                {categories.map((cat) => {
                  const count =
                    cat.id === 'all'
                      ? products.length
                      : products.filter((p) => p.category === cat.id).length;
                  const isSelected = selectedCategory === cat.id;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#0b5c37] text-white font-bold shadow-xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full tabular-nums ${
                          isSelected
                            ? 'bg-[#08482b] text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Brand Filter (Multi-select) */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Brands
                </h4>
                {selectedBrands.length > 0 && (
                  <button
                    onClick={() => setSelectedBrands([])}
                    className="text-[10px] text-[#0b5c37] hover:underline font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {allBrands.map((brand) => {
                  const count = products.filter((p) => p.brand === brand).length;
                  const isChecked = selectedBrands.includes(brand);

                  return (
                    <label
                      key={brand}
                      className="flex items-center justify-between p-1.5 rounded-lg text-xs hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleBrand(brand)}
                          className="w-4 h-4 rounded border-slate-300 text-[#0b5c37] focus:ring-[#0b5c37] accent-[#0b5c37] cursor-pointer"
                        />
                        <span className={`text-xs ${isChecked ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                          {brand}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums">({count})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 3. Price Filter */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Price Range
                </h4>
                <span className="text-xs font-extrabold text-[#0b5c37] tabular-nums">
                  ${minPrice} — {formatPrice(maxPrice)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="400"
                step="10"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-[#0b5c37] cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>₹0</span>
                <span>₹25,000+</span>
              </div>

              {/* Quick price bracket pills */}
              <div className="grid grid-cols-2 gap-1.5 mt-3">
                {[
                  { label: 'Under ₹1,000', min: 0, max: 1000 },
                  { label: '₹1,000 to ₹5,000', min: 1000, max: 5000 },
                  { label: '₹5,000 to ₹15,000', min: 5000, max: 15000 },
                  { label: '₹15,000 & Above', min: 15000, max: 50000 },
                ].map((tier) => (
                  <button
                    key={tier.label}
                    onClick={() => {
                      setMinPrice(tier.min);
                      setMaxPrice(tier.max);
                    }}
                    className={`px-2 py-1 text-[11px] rounded-lg border text-center transition-colors cursor-pointer ${
                      minPrice === tier.min && maxPrice === tier.max
                        ? 'border-[#0b5c37] bg-emerald-50 text-emerald-950 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Minimum Rating Filter */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                Minimum Rating
              </h4>
              <div className="space-y-1.5">
                {[4, 3, 0].map((star) => (
                  <label
                    key={star}
                    className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer hover:text-slate-900"
                  >
                    <input
                      type="radio"
                      name="rating"
                      checked={minRating === star}
                      onChange={() => setMinRating(star)}
                      className="accent-[#0b5c37] cursor-pointer"
                    />
                    {star === 0 ? (
                      <span>All Ratings</span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{star} Stars & Above</span>
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* 5. In Stock Filter */}
            <div className="pt-4 border-t border-slate-100">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-semibold text-slate-700">In Stock Items Only</span>
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="w-4 h-4 rounded text-[#0b5c37] focus:ring-[#0b5c37] accent-[#0b5c37] cursor-pointer"
                />
              </label>
            </div>
          </div>
        </aside>

        {/* Main Content: Products Grid / List */}
        <main className="lg:col-span-3 space-y-6" ref={productGridRef}>
          {/* Active Filter Pills Bar */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
              <span className="text-xs text-slate-400 font-medium">Applied:</span>

              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 text-xs font-semibold">
                  <span>Category: {selectedCategory}</span>
                  <button onClick={() => setSelectedCategory('all')} className="cursor-pointer">
                    <X className="w-3 h-3 text-[#08482b] hover:text-emerald-950" />
                  </button>
                </span>
              )}

              {searchQuery.trim() && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-xs font-semibold">
                  <span>Search: &quot;{searchQuery}&quot;</span>
                  <button onClick={() => setSearchQuery('')} className="cursor-pointer">
                    <X className="w-3 h-3 text-slate-600 hover:text-slate-900" />
                  </button>
                </span>
              )}

              {selectedBrands.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-xs font-semibold"
                >
                  <span>Brand: {b}</span>
                  <button onClick={() => handleToggleBrand(b)} className="cursor-pointer">
                    <X className="w-3 h-3 text-slate-600 hover:text-slate-900" />
                  </button>
                </span>
              ))}

              {(minPrice > 0 || maxPrice < 25000) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-xs font-semibold">
                  <span>Price: ${minPrice} – {formatPrice(maxPrice)}</span>
                  <button
                    onClick={() => {
                      setMinPrice(0);
                      setMaxPrice(25000);
                    }}
                    className="cursor-pointer"
                  >
                    <X className="w-3 h-3 text-slate-600 hover:text-slate-900" />
                  </button>
                </span>
              )}

              {minRating > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-xs font-semibold">
                  <span>{minRating}+ Stars</span>
                  <button onClick={() => setMinRating(0)} className="cursor-pointer">
                    <X className="w-3 h-3 text-slate-600 hover:text-slate-900" />
                  </button>
                </span>
              )}

              {inStockOnly && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-xs font-semibold">
                  <span>In Stock Only</span>
                  <button onClick={() => setInStockOnly(false)} className="cursor-pointer">
                    <X className="w-3 h-3 text-slate-600 hover:text-slate-900" />
                  </button>
                </span>
              )}

              <button
                onClick={resetFilters}
                className="text-xs font-bold text-[#0b5c37] hover:text-[#08482b] hover:underline ml-auto cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Empty State */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/90 shadow-2xs space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#0b5c37] flex items-center justify-center mx-auto shadow-inner">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">No products match your criteria</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Try widening your price range, deselecting specific brands, or clearing your search term.
                </p>
              </div>
              <button
                onClick={resetFilters}
                className="px-6 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-colors shadow-md shadow-emerald-900/10 cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* Responsive Product Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {paginatedProducts.map((product) => {
                const inWish = isInWishlist(product.id);
                return (
                  <div
                    key={product.id}
                    className="group bg-white rounded-3xl border border-slate-200/90 hover:border-[#0b5c37] hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden"
                  >
                    {/* Image Area with Badges & Action Buttons */}
                    <div
                      className="relative cursor-pointer p-4 pb-2"
                      onClick={() => onNavigate('product', { productId: product.id })}
                    >
                      <ProductImage product={product} size="md" />

                      {/* Floating Action Buttons */}
                      <div className="absolute top-6 right-6 flex flex-col gap-2 z-10">
                        {/* Wishlist Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWishlist(product.id);
                          }}
                          className={`w-9 h-9 rounded-full shadow-md flex items-center justify-center transition-all cursor-pointer ${
                            inWish
                              ? 'bg-rose-500 text-white'
                              : 'bg-white/90 text-slate-700 hover:bg-white hover:text-rose-500'
                          }`}
                          title={inWish ? 'Remove from Wishlist' : 'Add to Wishlist'}
                        >
                          <Heart className={`w-4 h-4 ${inWish ? 'fill-current' : ''}`} />
                        </button>

                        {/* Quick View Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickView(product);
                          }}
                          className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-[#0b5c37] shadow-md flex items-center justify-center transition-all cursor-pointer"
                          title="Quick View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Stock Indicator Pill */}
                      <div className="absolute bottom-4 left-6">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 backdrop-blur-xs text-slate-700 shadow-2xs border border-slate-200/80">
                          <span className={`w-1.5 h-1.5 rounded-full ${product.inStock ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span>{product.inStock ? `In Stock (${product.stockCount})` : 'Out of Stock'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Product Metadata & Actions */}
                    <div className="p-5 pt-2 flex-1 flex flex-col justify-between space-y-4">
                      <div>
                        {/* Brand & Rating Header */}
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="uppercase tracking-wider font-extrabold text-[#0b5c37]">
                            {product.brand}
                          </span>
                          <span className="flex items-center gap-1 text-slate-800 font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>{product.rating}</span>
                            <span className="text-slate-400 text-[10px]">({product.reviewsCount})</span>
                          </span>
                        </div>

                        {/* Product Title */}
                        <h3
                          onClick={() => onNavigate('product', { productId: product.id })}
                          className="text-sm font-bold text-slate-900 group-hover:text-[#0b5c37] transition-colors line-clamp-1 cursor-pointer"
                        >
                          {product.name}
                        </h3>

                        {/* Short Description */}
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {product.shortDescription}
                        </p>
                      </div>

                      {/* Pricing Breakdown */}
                      <div className="pt-3 border-t border-slate-100">
                        <div className="flex items-baseline justify-between mb-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-black text-slate-950 tabular-nums">
                              {formatPrice(product.price)}
                            </span>
                            {product.originalPrice > product.price && (
                              <span className="text-xs text-slate-400 line-through tabular-nums">
                                {formatPrice(product.originalPrice)}
                              </span>
                            )}
                          </div>
                          {product.discountPercentage && product.discountPercentage > 0 && (
                            <span className="text-[11px] font-extrabold text-[#08482b] bg-emerald-50 px-2 py-0.5 rounded-md">
                              Save {product.discountPercentage}%
                            </span>
                          )}
                        </div>

                        {/* Dual Action Buttons: Add to Cart + Buy Now */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => addToCart(product, 1)}
                            className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Add to Cart</span>
                          </button>

                          <button
                            onClick={() => handleBuyNow(product)}
                            className="py-2.5 px-3 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-emerald-900/10"
                          >
                            <Zap className="w-3.5 h-3.5 fill-current" />
                            <span>Buy Now</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="space-y-4">
              {paginatedProducts.map((product) => {
                const inWish = isInWishlist(product.id);
                return (
                  <div
                    key={product.id}
                    className="group bg-white rounded-3xl border border-slate-200/90 hover:border-[#0b5c37] hover:shadow-lg transition-all p-4 sm:p-5 flex flex-col sm:flex-row gap-5 items-center justify-between"
                  >
                    <div
                      className="w-full sm:w-48 h-48 shrink-0 rounded-2xl overflow-hidden cursor-pointer"
                      onClick={() => onNavigate('product', { productId: product.id })}
                    >
                      <ProductImage product={product} size="md" />
                    </div>

                    <div className="flex-1 flex flex-col justify-between w-full h-full space-y-3">
                      <div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
                          <span className="uppercase tracking-wider font-extrabold text-[#0b5c37]">
                            {product.brand}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-slate-700">{product.category}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-slate-800 font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>{product.rating}</span>
                            <span className="text-slate-400 text-[10px]">({product.reviewsCount})</span>
                          </span>
                        </div>

                        <h3
                          onClick={() => onNavigate('product', { productId: product.id })}
                          className="text-base font-bold text-slate-900 hover:text-[#0b5c37] transition-colors cursor-pointer"
                        >
                          {product.name}
                        </h3>

                        <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                          {product.fullDescription}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-black text-slate-950 tabular-nums">
                            {formatPrice(product.price)}
                          </span>
                          {product.originalPrice > product.price && (
                            <span className="text-xs text-slate-400 line-through tabular-nums">
                              {formatPrice(product.originalPrice)}
                            </span>
                          )}
                          {product.discountPercentage && product.discountPercentage > 0 && (
                            <span className="text-[11px] font-bold text-[#08482b] bg-emerald-50 px-2 py-0.5 rounded">
                              Save {product.discountPercentage}%
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleWishlist(product.id)}
                            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                              inWish
                                ? 'bg-rose-500 border-rose-500 text-white'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-rose-500'
                            }`}
                            title="Wishlist"
                          >
                            <Heart className={`w-4 h-4 ${inWish ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            onClick={() => onQuickView(product)}
                            className="px-3.5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                          >
                            Quick View
                          </button>

                          <button
                            onClick={() => addToCart(product, 1)}
                            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Add to Cart</span>
                          </button>

                          <button
                            onClick={() => handleBuyNow(product)}
                            className="px-4 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-900/10"
                          >
                            <Zap className="w-3.5 h-3.5 fill-current" />
                            <span>Buy Now</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination & Load More Footer */}
          {filteredProducts.length > 0 && (
            <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                Showing{' '}
                <strong className="text-slate-900 font-bold">
                  {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(currentPage * itemsPerPage, filteredProducts.length)}
                </strong>{' '}
                of <strong className="text-slate-900 font-bold">{filteredProducts.length}</strong> items
              </div>

              {/* Numbered Pagination Buttons */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 cursor-pointer"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-9 h-9 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        currentPage === pageNum
                          ? 'bg-[#0b5c37] text-white shadow-md shadow-emerald-900/20'
                          : 'border border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 cursor-pointer"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Items Per Page Selector */}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Per Page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    const newCount = Number(e.target.value);
                    setItemsPerPage(newCount);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value={6}>6</option>
                  <option value={9}>9</option>
                  <option value={12}>12</option>
                  <option value={24}>All</option>
                </select>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Filters Drawer Modal */}
      {isMobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileFiltersOpen(false)}
          />
          <div className="relative w-full max-w-xs bg-white h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto z-10 animate-in slide-in-from-right duration-200">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#0b5c37]" />
                  <span>Filter Catalog</span>
                </h3>
                <button
                  onClick={() => setIsMobileFiltersOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Department Categories */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                  Categories
                </h4>
                <div className="space-y-1">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setIsMobileFiltersOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex justify-between items-center cursor-pointer ${
                        selectedCategory === cat.id
                          ? 'bg-[#0b5c37] text-white font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-[10px] opacity-80">
                        {cat.id === 'all'
                          ? products.length
                          : products.filter((p) => p.category === cat.id).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brands */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                  Brands
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {allBrands.map((brand) => (
                    <label key={brand} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBrands.includes(brand)}
                        onChange={() => handleToggleBrand(brand)}
                        className="rounded text-[#0b5c37] accent-[#0b5c37]"
                      />
                      <span>{brand}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span>Max Price:</span>
                  <span className="text-[#0b5c37]">{formatPrice(maxPrice)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="400"
                  step="10"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-[#0b5c37]"
                />
              </div>

              {/* In stock */}
              <div className="pt-4 border-t border-slate-100">
                <label className="flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer">
                  <span>In Stock Only</span>
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="accent-[#0b5c37]"
                  />
                </label>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-2">
              <button
                onClick={() => setIsMobileFiltersOpen(false)}
                className="w-full py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
              >
                Show Results ({filteredProducts.length})
              </button>
              <button
                onClick={() => {
                  resetFilters();
                  setIsMobileFiltersOpen(false);
                }}
                className="w-full py-2.5 text-slate-600 text-xs font-bold hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
