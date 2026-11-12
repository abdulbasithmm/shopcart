import React, { useState } from 'react';
import {
  Smartphone,
  Laptop,
  Shirt,
  Home,
  Sparkles,
  Smile,
  Activity,
  LayoutGrid,
  ChevronRight,
  TrendingUp,
  Tag,
  ArrowRight,
  Sparkle
} from 'lucide-react';
import { PageView } from '../types';
import { CATEGORIES, PRODUCTS } from '../data/mockData';
import { formatPrice } from '../utils/format';

interface CategoriesPageProps {
  onNavigate: (page: PageView, params?: { category?: string; productId?: string }) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  Smartphone: <Smartphone className="w-6 h-6" />,
  Laptop: <Laptop className="w-6 h-6" />,
  Shirt: <Shirt className="w-6 h-6" />,
  Home: <Home className="w-6 h-6" />,
  Sparkles: <Sparkles className="w-6 h-6" />,
  Smile: <Smile className="w-6 h-6" />,
  Activity: <Activity className="w-6 h-6" />,
  LayoutGrid: <LayoutGrid className="w-6 h-6" />,
};

const categoryGradients: Record<string, string> = {
  Mobiles: 'from-blue-500/10 to-indigo-500/10 border-blue-200 text-blue-700',
  Electronics: 'from-cyan-500/10 to-blue-500/10 border-cyan-200 text-cyan-700',
  Fashion: 'from-pink-500/10 to-rose-500/10 border-pink-200 text-pink-700',
  'Home & Kitchen': 'from-amber-500/10 to-orange-500/10 border-amber-200 text-amber-700',
  Beauty: 'from-purple-500/10 to-pink-500/10 border-purple-200 text-purple-700',
  'Toys & Games': 'from-emerald-500/10 to-teal-500/10 border-emerald-200 text-emerald-700',
  Sports: 'from-lime-500/10 to-green-500/10 border-lime-200 text-green-700',
};

export const CategoriesPage: React.FC<CategoriesPageProps> = ({ onNavigate }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Electronics');

  const filteredCategories = CATEGORIES.filter((c) => c.id !== 'all');
  const activeCategoryProducts = PRODUCTS.filter(
    (p) => selectedCategory === 'all' || p.category.toLowerCase() === selectedCategory.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-12">
      {/* Top Header Banner */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-16 z-10 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <LayoutGrid className="w-6 h-6 text-[#2874f0]" />
              <span>Explore All Categories</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Browse top deals, trending collections, and curated products
            </p>
          </div>
          <button
            onClick={() => onNavigate('shop', { category: 'all' })}
            className="text-xs font-bold text-[#2874f0] hover:text-blue-700 flex items-center gap-1 cursor-pointer bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
          >
            <span>View All Products</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Categories Grid - Mobile Quick Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-8">
          {filteredCategories.map((cat) => {
            const isSelected = selectedCategory.toLowerCase() === cat.id.toLowerCase();
            const styling = categoryGradients[cat.id] || 'from-slate-100 to-slate-200 border-slate-200 text-slate-700';

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 shadow-2xs group ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/30'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {iconMap[cat.icon] || <LayoutGrid className="w-6 h-6" />}
                </div>
                <div>
                  <span className={`text-xs font-bold block ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                    {cat.name}
                  </span>
                  <span className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                    {cat.count} items
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Category Header & Deep Link */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-[#2874f0]">
                Curated Showcase
              </span>
              <span className="text-xs text-slate-400">
                {activeCategoryProducts.length} items available
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
              Top Picks in {selectedCategory}
            </h2>
          </div>
          <button
            onClick={() => onNavigate('shop', { category: selectedCategory })}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <span>Open in Full Shop Filter</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Products in Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeCategoryProducts.map((prod) => (
            <div
              key={prod.id}
              onClick={() => onNavigate('product', { productId: prod.id })}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col cursor-pointer group"
            >
              <div className="relative aspect-4/3 bg-slate-50 p-4 flex items-center justify-center overflow-hidden">
                <img
                  src={prod.image || prod.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60'}
                  alt={prod.name}
                  className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
                {prod.discountPercentage && (
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">
                    {prod.discountPercentage}% OFF
                  </span>
                )}
                {prod.isFeatured && (
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold shadow-2xs flex items-center gap-0.5">
                    <Sparkle className="w-3 h-3 fill-current" />
                    <span>Featured</span>
                  </span>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    {prod.brand}
                  </span>
                  <h3 className="text-xs font-bold text-slate-900 group-hover:text-[#2874f0] transition-colors line-clamp-2 mt-0.5">
                    {prod.name}
                  </h3>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-black text-slate-900">
                      {formatPrice(prod.price)}
                    </span>
                    {prod.originalPrice > prod.price && (
                      <span className="text-xs text-slate-400 line-through ml-1.5">
                        {formatPrice(prod.originalPrice)}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-[#2874f0] group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                    View <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
