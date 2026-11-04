import React from 'react';
import { X, Trash2, ArrowRight, ShoppingBag, ShieldCheck } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { ProductImage } from './ProductImage';
import { formatPrice } from '../../utils/format';

interface CartDrawerProps {
  onNavigate: (page: 'cart' | 'checkout' | 'shop') => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onNavigate }) => {
  const {
    cart,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    removeFromCart,
    updateQuantity,
    subtotal,
    cartCount,
  } = useCart();

  if (!isCartDrawerOpen) return null;

  const freeShippingThreshold = 499;
  const progressPercent = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));
  const amountNeeded = Math.max(0, freeShippingThreshold - subtotal);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={() => setIsCartDrawerOpen(false)}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#0b5c37]" />
            <h2 className="text-base font-bold text-slate-900">Shopping Cart</h2>
            <span className="text-xs bg-[#0b5c37]/10 text-[#0b5c37] font-bold px-2 py-0.5 rounded-full">
              {cartCount} {cartCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            onClick={() => setIsCartDrawerOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free shipping bar */}
        <div className="p-4 bg-emerald-50/70 border-b border-emerald-100">
          <div className="flex justify-between text-xs font-medium text-emerald-950 mb-1.5">
            {amountNeeded > 0 ? (
              <span>Add <strong className="font-bold text-[#0b5c37]">{formatPrice(amountNeeded)}</strong> more for <strong>FREE Delivery!</strong></span>
            ) : (
              <span className="font-bold text-[#0b5c37] flex items-center gap-1">
                🎉 Congratulations! Your order qualifies for FREE Delivery!
              </span>
            )}
            <span className="font-bold text-[#0b5c37]">{progressPercent}%</span>
          </div>
          <div className="w-full bg-emerald-200/60 h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#0b5c37] h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">Your Shop Cart is empty</h3>
              <p className="text-xs text-slate-500 mb-6 max-w-xs">
                Explore today’s deals, electronics, fashion, and home essentials!
              </p>
              <button
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  onNavigate('shop');
                }}
                className="px-5 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={`${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`}
                className="flex gap-3 p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-colors bg-white shadow-2xs"
              >
                {/* Product thumbnail */}
                <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-slate-50">
                  <ProductImage
                    product={item.product}
                    size="sm"
                    showBadge={false}
                    selectedColor={
                      item.selectedColor
                        ? item.product.colors?.find((c) => c.name === item.selectedColor)?.hex
                        : undefined
                    }
                  />
                </div>

                {/* Info */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="text-xs font-semibold text-slate-900 line-clamp-2">
                        {item.product.name}
                      </h4>
                      <button
                        onClick={() =>
                          removeFromCart(item.product.id, item.selectedColor, item.selectedSize)
                        }
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                      {item.selectedColor && (
                        <span>Color: <strong>{item.selectedColor}</strong></span>
                      )}
                      {item.selectedSize && (
                        <span>Size: <strong>{item.selectedSize}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Quantity and Price */}
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
                    <div className="flex items-center border border-slate-200 rounded-md">
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.quantity - 1,
                            item.selectedColor,
                            item.selectedSize
                          )
                        }
                        className="px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        -
                      </button>
                      <span className="px-2.5 py-0.5 text-xs font-semibold text-slate-900 tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.quantity + 1,
                            item.selectedColor,
                            item.selectedSize
                          )
                        }
                        className="px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-xs font-bold text-slate-900 tabular-nums">
                      {formatPrice(item.product.price * item.quantity)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        {cart.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/70 space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({cartCount} {cartCount === 1 ? 'item' : 'items'}):</span>
                <span className="font-bold text-slate-900 tabular-nums text-sm">
                  {formatPrice(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Delivery Charges</span>
                <span className="text-[#0b5c37] font-semibold">FREE</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  onNavigate('cart');
                }}
                className="w-full py-2.5 px-3 border border-slate-300 hover:bg-white text-slate-800 text-xs font-semibold rounded-lg transition-colors text-center"
              >
                Go to Cart
              </button>

              <button
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  onNavigate('checkout');
                }}
                className="w-full py-2.5 px-3 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                Proceed to Buy <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0b5c37]" />
              <span>Safe 256-Bit SSL Encrypted Checkout</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
