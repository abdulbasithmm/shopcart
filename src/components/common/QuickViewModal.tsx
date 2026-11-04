import React, { useState } from 'react';
import { X, Star, ShoppingBag, Check, ShieldCheck, ArrowRight } from 'lucide-react';
import { Product } from '../../types';
import { useCart } from '../../context/CartContext';
import { ProductImage } from './ProductImage';
import { formatPrice } from '../../utils/format';

interface QuickViewModalProps {
  product: Product | null;
  onClose: () => void;
  onViewFullDetails: (productId: string) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  product,
  onClose,
  onViewFullDetails,
}) => {
  const { addToCart, isInWishlist, toggleWishlist } = useCart();

  if (!product) return null;

  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState(product.sizes ? product.sizes[0] : '');
  const [quantity, setQuantity] = useState(1);

  const activeColorObj = product.colors.find((c) => c.name === selectedColor) || product.colors[0];

  const handleAddToCart = () => {
    addToCart(product, quantity, selectedColor, selectedSize);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col md:flex-row">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 text-slate-400 hover:text-slate-800 bg-white/80 hover:bg-white rounded-full shadow-sm transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Product Visual Left Column */}
        <div className="w-full md:w-1/2 p-6 bg-slate-50 flex items-center justify-center relative">
          <ProductImage
            product={product}
            size="lg"
            selectedColor={activeColorObj?.hex}
          />
        </div>

        {/* Product Details Right Column */}
        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span className="font-semibold uppercase tracking-wider text-[#0b5c37]">
                {product.brand}
              </span>
              <span>·</span>
              <span>{product.category}</span>
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2 leading-snug">
              {product.name}
            </h3>

            {/* Rating */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center text-amber-500">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < Math.floor(product.rating)
                        ? 'fill-amber-500 text-amber-500'
                        : 'text-slate-300'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-bold text-slate-800">{product.rating}</span>
              <span className="text-xs text-slate-400">({product.reviewsCount} reviews)</span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice > product.price && (
                <span className="text-sm text-slate-400 line-through tabular-nums">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
              {product.discountPercentage && (
                <span className="text-xs font-bold text-[#cc0c39] bg-rose-50 px-2 py-0.5 rounded-md">
                  {product.discountPercentage}% off
                </span>
              )}
            </div>

            {/* Short description */}
            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              {product.shortDescription}
            </p>

            {/* Color Swatches */}
            {product.colors.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold text-slate-800 mb-1.5 flex justify-between">
                  <span>Color:</span>
                  <span className="text-slate-500 font-normal">{selectedColor}</span>
                </div>
                <div className="flex items-center gap-2">
                  {product.colors.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setSelectedColor(c.name)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        selectedColor === c.name
                          ? 'ring-2 ring-[#0b5c37] ring-offset-2 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {selectedColor === c.name && (
                        <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size Options if applicable */}
            {product.sizes && product.sizes.length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-bold text-slate-800 mb-1.5">Size:</div>
                <div className="flex items-center gap-2">
                  {product.sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSize(s)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        selectedSize === s
                          ? 'border-[#0b5c37] bg-[#0b5c37] text-white shadow-xs'
                          : 'border-slate-200 text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity Stepper & Stock */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center border border-slate-200 rounded-lg">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-l-lg transition-colors font-bold text-sm cursor-pointer"
                >
                  -
                </button>
                <span className="px-4 py-2 text-xs font-bold text-slate-900 tabular-nums">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-r-lg transition-colors font-bold text-sm cursor-pointer"
                >
                  +
                </button>
              </div>

              <div className="text-xs text-[#0b5c37] font-semibold flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-[#0b5c37]" />
                <span>In Stock ({product.stockCount} available)</span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleAddToCart}
                className="w-full py-2.5 px-4 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Add to Cart</span>
              </button>

              <button
                onClick={() => toggleWishlist(product.id)}
                className={`w-full py-2.5 px-4 border text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  isInWishlist(product.id)
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isInWishlist(product.id) ? '♥ In Wishlist' : '♡ Save to Wishlist'}
              </button>
            </div>

            <button
              onClick={() => {
                onClose();
                onViewFullDetails(product.id);
              }}
              className="w-full py-2 text-center text-xs font-semibold text-slate-600 hover:text-[#0b5c37] transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>View Full Product Specifications</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
