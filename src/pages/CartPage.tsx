import React, { useState } from 'react';
import {
  ShoppingBag,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Tag,
  Check,
  ChevronRight,
  ArrowLeft,
  Bookmark,
  RotateCcw,
  Truck,
  Lock,
  Star,
  Plus,
  Minus,
  Info,
} from 'lucide-react';
import { PageView, CartItem, Product } from '../types';
import { useCart } from '../context/CartContext';
import { ProductImage } from '../components/common/ProductImage';
import { PRODUCTS } from '../data/mockData';
import { formatPrice } from '../utils/format';

interface CartPageProps {
  onNavigate: (page: PageView, params?: { productId?: string; category?: string }) => void;
}

export const CartPage: React.FC<CartPageProps> = ({ onNavigate }) => {
  const {
    cart,
    savedForLater,
    removeFromCart,
    updateQuantity,
    saveForLater,
    moveToCart,
    removeSavedForLater,
    clearCart,
    addToCart,
    subtotal,
    discountAmount,
    shippingFee,
    taxAmount,
    total,
    coupon,
    applyCoupon,
    removeCoupon,
  } = useCart();

  const [couponInput, setCouponInput] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const freeShippingThreshold = 499;
  const progressPercent = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));
  const amountNeeded = Math.max(0, freeShippingThreshold - subtotal);

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (couponInput.trim()) {
      applyCoupon(couponInput.trim());
      setCouponInput('');
    }
  };

  const handleQuickApply = (code: string) => {
    applyCoupon(code);
  };

  const handleQuantityInputChange = (
    item: CartItem,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      updateQuantity(item.product.id, val, item.selectedColor, item.selectedSize);
    }
  };

  // Recommended products for empty state and recommendations row
  const recommendedProducts = PRODUCTS.slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-white min-h-[calc(100vh-280px)]">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <button
          onClick={() => onNavigate('home')}
          className="hover:text-[#0b5c37] transition-colors cursor-pointer"
        >
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-semibold">Shopping Cart</span>
      </nav>

      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-slate-200 pb-4 gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <span>Shopping Cart</span>
            {cart.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-[#08482b]">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review your selected products, adjust quantities, and proceed to secure checkout.
          </p>
        </div>

        {cart.length > 0 && (
          <div className="flex items-center gap-3">
            {showClearConfirm ? (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                <span className="text-xs text-rose-700 font-semibold">Clear all items?</span>
                <button
                  onClick={() => {
                    clearCart();
                    setShowClearConfirm(false);
                  }}
                  className="text-xs font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer"
                >
                  Yes, clear
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer ml-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1.5 cursor-pointer py-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cart</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cart Content: Empty State vs Populated Cart */}
      {cart.length === 0 ? (
        <div className="space-y-12">
          {/* Empty Cart Banner */}
          <div className="bg-gradient-to-b from-emerald-50/40 via-white to-white rounded-3xl p-10 sm:p-16 text-center border border-slate-200 shadow-sm max-w-2xl mx-auto">
            <div className="w-24 h-24 rounded-3xl bg-emerald-100/70 border border-emerald-200 flex items-center justify-center mx-auto mb-6 text-[#0b5c37] shadow-inner">
              <ShoppingBag className="w-12 h-12 stroke-[1.75]" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">
              Your shopping cart is empty
            </h2>
            <p className="text-sm text-slate-600 mb-8 max-w-md mx-auto leading-relaxed">
              Looks like you haven't added any products yet. Browse through our premium selection of electronics, fashion, home essentials, and more.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => onNavigate('shop')}
                className="px-6 py-3.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-emerald-900/10 inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Start Shopping</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate('shop', { category: 'Electronics' })}
                className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm rounded-xl transition-colors cursor-pointer"
              >
                Browse Top Deals
              </button>
            </div>
          </div>

          {/* Saved for Later section if any items exist */}
          {savedForLater.length > 0 && (
            <div className="space-y-4 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-[#0b5c37]" />
                    <span>Saved for Later ({savedForLater.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Items you saved while shopping. Move them back to your cart whenever you are ready.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedForLater.map((item) => (
                  <div
                    key={`saved-${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`}
                    className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex gap-4 items-center"
                  >
                    <div
                      className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-slate-50 cursor-pointer"
                      onClick={() => onNavigate('product', { productId: item.product.id })}
                    >
                      <ProductImage
                        product={item.product}
                        size="sm"
                        showBadge={false}
                        selectedColor={
                          item.selectedColor
                            ? item.product.colors.find((c) => c.name === item.selectedColor)?.hex
                            : undefined
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0b5c37]">
                        {item.product.brand}
                      </span>
                      <h4
                        onClick={() => onNavigate('product', { productId: item.product.id })}
                        className="text-xs font-bold text-slate-900 truncate hover:text-[#0b5c37] cursor-pointer"
                      >
                        {item.product.name}
                      </h4>
                      <div className="text-xs font-black text-slate-900 mt-1">
                        {formatPrice(item.product.price)}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => moveToCart(item)}
                          className="px-2.5 py-1 bg-[#0b5c37] hover:bg-[#08482b] text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Move to Cart
                        </button>
                        <button
                          onClick={() =>
                            removeSavedForLater(
                              item.product.id,
                              item.selectedColor,
                              item.selectedSize
                            )
                          }
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended for You Grid */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-[#0b5c37] fill-[#0b5c37]" />
                  <span>Popular Recommendations</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Customers frequently add these top-rated items to their shopping bags.
                </p>
              </div>
              <button
                onClick={() => onNavigate('shop')}
                className="text-xs font-bold text-[#0b5c37] hover:text-[#08482b] flex items-center gap-1 cursor-pointer"
              >
                <span>View Full Catalog</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {recommendedProducts.map((prod) => (
                <div
                  key={prod.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs hover:shadow-md transition-shadow flex flex-col group"
                >
                  <div
                    className="h-44 bg-slate-50 cursor-pointer overflow-hidden relative"
                    onClick={() => onNavigate('product', { productId: prod.id })}
                  >
                    <ProductImage product={prod} size="sm" showBadge={false} />
                    {prod.originalPrice && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-rose-600 text-white text-[10px] font-bold rounded-md shadow-xs">
                        {Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100)}% OFF
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0b5c37]">
                      {prod.brand}
                    </span>
                    <h4
                      onClick={() => onNavigate('product', { productId: prod.id })}
                      className="text-xs font-bold text-slate-900 hover:text-[#0b5c37] cursor-pointer line-clamp-1 mt-0.5"
                    >
                      {prod.name}
                    </h4>
                    <div className="flex items-center gap-1 text-[11px] text-amber-500 font-bold mt-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{prod.rating}</span>
                      <span className="text-slate-400 font-normal">({prod.reviewsCount})</span>
                    </div>
                    <div className="mt-auto pt-3 flex items-center justify-between">
                      <div className="text-sm font-extrabold text-slate-900">
                        {formatPrice(prod.price)}
                      </div>
                      <button
                        onClick={() => addToCart(prod, 1)}
                        className="px-3 py-1.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Cart Items List & Saved for Later */}
          <div className="lg:col-span-8 space-y-6">
            {/* Free shipping bar indicator */}
            <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200">
              <div className="flex justify-between items-center text-xs font-bold text-emerald-950 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-[#0b5c37] shrink-0" />
                  {amountNeeded > 0 ? (
                    <span>
                      Add <strong className="text-[#08482b]">{formatPrice(amountNeeded)}</strong> more to unlock <strong>FREE Express Shipping</strong>!
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                      <Check className="w-4 h-4 text-emerald-600" />
                      Congratulations! You unlocked FREE Express Delivery!
                    </span>
                  )}
                </span>
                <span className="text-[#08482b]">{progressPercent}%</span>
              </div>
              <div className="w-full bg-emerald-200/80 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#0b5c37] h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Itemized Table / Cards */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {cart.map((item) => {
                const maxStock = item.product.stockCount || 99;
                const isMaxReached = item.quantity >= maxStock;

                return (
                  <div
                    key={`${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`}
                    className="p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between hover:bg-slate-50/40 transition-colors"
                  >
                    {/* Product Visual & Info */}
                    <div className="flex items-start sm:items-center gap-4 w-full sm:w-auto flex-1">
                      <div
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 bg-slate-50 border border-slate-200/70 cursor-pointer"
                        onClick={() => onNavigate('product', { productId: item.product.id })}
                      >
                        <ProductImage
                          product={item.product}
                          size="sm"
                          showBadge={false}
                          selectedColor={
                            item.selectedColor
                              ? item.product.colors.find((c) => c.name === item.selectedColor)?.hex
                              : undefined
                          }
                        />
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#0b5c37]">
                            {item.product.brand}
                          </span>
                          {item.product.inStock && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              In Stock ({maxStock} left)
                            </span>
                          )}
                        </div>

                        <h3
                          onClick={() => onNavigate('product', { productId: item.product.id })}
                          className="text-sm font-bold text-slate-900 hover:text-[#0b5c37] transition-colors cursor-pointer line-clamp-1"
                        >
                          {item.product.name}
                        </h3>

                        {/* Selected Variants */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-0.5">
                          {item.selectedColor && (
                            <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-700">
                              Color: <strong>{item.selectedColor}</strong>
                            </span>
                          )}
                          {item.selectedSize && (
                            <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-700">
                              Size: <strong>{item.selectedSize}</strong>
                            </span>
                          )}
                        </div>

                        {/* Mobile unit price */}
                        <div className="text-xs font-bold text-slate-900 sm:hidden pt-1">
                          {formatPrice(item.product.price)} / unit
                        </div>

                        {/* Inline Actions */}
                        <div className="flex items-center gap-4 pt-2">
                          <button
                            onClick={() =>
                              saveForLater(
                                item.product.id,
                                item.selectedColor,
                                item.selectedSize
                              )
                            }
                            className="text-xs font-semibold text-slate-600 hover:text-[#0b5c37] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Bookmark className="w-3.5 h-3.5" />
                            <span>Save for later</span>
                          </button>

                          <button
                            onClick={() =>
                              removeFromCart(
                                item.product.id,
                                item.selectedColor,
                                item.selectedSize
                              )
                            }
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quantity Stepper & Line Total */}
                    <div className="flex items-center justify-between w-full sm:w-auto sm:gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {/* Stepper with direct numeric typing & stock protection */}
                      <div className="flex flex-col items-center">
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                          <button
                            onClick={() =>
                              updateQuantity(
                                item.product.id,
                                item.quantity - 1,
                                item.selectedColor,
                                item.selectedSize
                              )
                            }
                            className="p-2 text-slate-600 hover:bg-slate-100 hover:text-[#0b5c37] transition-colors cursor-pointer"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <input
                            type="number"
                            min="1"
                            max={maxStock}
                            value={item.quantity}
                            onChange={(e) => handleQuantityInputChange(item, e)}
                            className="w-12 text-center text-xs font-bold text-slate-900 py-1.5 focus:outline-none focus:bg-emerald-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            title="Direct quantity entry"
                          />

                          <button
                            onClick={() =>
                              updateQuantity(
                                item.product.id,
                                item.quantity + 1,
                                item.selectedColor,
                                item.selectedSize
                              )
                            }
                            disabled={isMaxReached}
                            className={`p-2 transition-colors ${
                              isMaxReached
                                ? 'text-slate-300 bg-slate-50 cursor-not-allowed'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-[#0b5c37] cursor-pointer'
                            }`}
                            title={isMaxReached ? 'Max stock reached' : 'Increase quantity'}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {isMaxReached && (
                          <span className="text-[10px] text-amber-600 font-semibold mt-1">
                            Max limit ({maxStock})
                          </span>
                        )}
                      </div>

                      {/* Line Total */}
                      <div className="text-right min-w-24">
                        <div className="text-base font-extrabold text-slate-900 tabular-nums">
                          {formatPrice(item.product.price * item.quantity)}
                        </div>
                        <div className="text-[11px] text-slate-400 hidden sm:block">
                          ({formatPrice(item.product.price)} / unit)
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Continue shopping button */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => onNavigate('shop')}
                className="text-xs font-bold text-slate-600 hover:text-[#0b5c37] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Continue Browsing Products</span>
              </button>

              <div className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Safe & Secure Checkout Guaranteed</span>
              </div>
            </div>

            {/* Saved For Later Section (below active cart) */}
            {savedForLater.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-2xs space-y-4 mt-8">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-[#0b5c37]" />
                    <h3 className="text-base font-bold text-slate-900">
                      Saved for Later ({savedForLater.length})
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    Will remain saved until moved to cart or removed
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {savedForLater.map((item) => (
                    <div
                      key={`saved-${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`}
                      className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div
                          className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 cursor-pointer"
                          onClick={() => onNavigate('product', { productId: item.product.id })}
                        >
                          <ProductImage
                            product={item.product}
                            size="sm"
                            showBadge={false}
                            selectedColor={
                              item.selectedColor
                                ? item.product.colors.find((c) => c.name === item.selectedColor)?.hex
                                : undefined
                            }
                          />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#0b5c37]">
                            {item.product.brand}
                          </span>
                          <h4
                            onClick={() => onNavigate('product', { productId: item.product.id })}
                            className="text-xs font-bold text-slate-900 hover:text-[#0b5c37] cursor-pointer line-clamp-1"
                          >
                            {item.product.name}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span>{formatPrice(item.product.price)}</span>
                            {item.selectedColor && <span>• Color: {item.selectedColor}</span>}
                            {item.selectedSize && <span>• Size: {item.selectedSize}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => moveToCart(item)}
                          className="px-3 py-1.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
                        >
                          Move to Cart
                        </button>
                        <button
                          onClick={() =>
                            removeSavedForLater(
                              item.product.id,
                              item.selectedColor,
                              item.selectedSize
                            )
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Remove from saved for later"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Order Summary & Coupon */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/90 shadow-2xs space-y-6">
              <h2 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-100 flex items-center justify-between">
                <span>Order Summary</span>
                <span className="text-xs text-slate-400 font-normal">
                  {cart.length} distinct {cart.length === 1 ? 'item' : 'items'}
                </span>
              </h2>

              {/* Coupon Form */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Have a Promo Code?
                </label>
                {coupon ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[#0b5c37] shrink-0" />
                      <div>
                        <strong className="text-emerald-950 font-bold">{coupon.code}</strong>
                        <span className="block text-[11px] text-[#08482b]">
                          {coupon.description}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={removeCoupon}
                      className="text-rose-600 hover:text-rose-700 font-bold text-xs cursor-pointer ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyPromo} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. SHOPCART10"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl uppercase tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[#0b5c37]/20 focus:border-[#0b5c37] transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!couponInput.trim()}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </form>
                )}

                {/* Quick promo code suggestion badges */}
                {!coupon && (
                  <div className="pt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span>Available:</span>
                    <button
                      onClick={() => handleQuickApply('SHOPCART10')}
                      className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-[#08482b] font-mono font-bold rounded-md border border-emerald-200 cursor-pointer transition-colors"
                      title="10% discount on order"
                    >
                      SHOPCART10
                    </button>
                    <button
                      onClick={() => handleQuickApply('SAVE20')}
                      className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-[#08482b] font-mono font-bold rounded-md border border-emerald-200 cursor-pointer transition-colors"
                      title="₹200 off orders"
                    >
                      SAVE20
                    </button>
                  </div>
                )}
              </div>

              {/* Cost Breakdown */}
              <div className="space-y-3 pt-4 border-t border-slate-100 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatPrice(subtotal)}
                  </span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      Discount ({coupon?.code})
                    </span>
                    <span className="tabular-nums">-{formatPrice(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span className="flex items-center gap-1">
                    Estimated Shipping
                    {subtotal >= freeShippingThreshold && (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">
                        Threshold Met
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {shippingFee === 0 ? (
                      <strong className="text-emerald-600 font-bold">FREE</strong>
                    ) : (
                      `$${shippingFee.toFixed(2)}`
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Estimated Sales Tax (8%)</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatPrice(taxAmount)}
                  </span>
                </div>

                <div className="flex justify-between items-baseline pt-4 border-t border-slate-200 text-slate-900 font-extrabold text-base">
                  <span>Grand Total</span>
                  <div className="text-right">
                    <span className="text-2xl text-[#0b5c37] tabular-nums font-black block">
                      {formatPrice(total)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Includes tax and shipping
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkout CTA Button */}
              <button
                onClick={() => onNavigate('checkout')}
                className="w-full py-4 bg-[#0b5c37] hover:bg-[#08482b] text-white text-sm font-extrabold rounded-2xl transition-all shadow-lg shadow-emerald-900/10 flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Trust Badges */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>256-bit SSL encrypted & secure transactions</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <RotateCcw className="w-4 h-4 text-[#0b5c37] shrink-0" />
                  <span>30-Day hassle-free return guarantee</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Truck className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Free tracked express shipping on orders over ₹499</span>
                </div>
              </div>

              {/* Payment methods icons/strip */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-3 text-slate-400 text-[11px] font-semibold">
                <span className="px-2 py-1 rounded bg-slate-100">VISA</span>
                <span className="px-2 py-1 rounded bg-slate-100">Mastercard</span>
                <span className="px-2 py-1 rounded bg-slate-100">AMEX</span>
                <span className="px-2 py-1 rounded bg-slate-100">Apple Pay</span>
                <span className="px-2 py-1 rounded bg-slate-100">PayPal</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
