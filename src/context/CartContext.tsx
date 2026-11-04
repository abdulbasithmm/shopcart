import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, CartItem } from '../types';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchUserCartFromSupabase, syncCartWithSupabase } from '../services/cartService';
import {
  fetchUserWishlistFromSupabase,
  addToWishlistSupabase,
  removeFromWishlistSupabase,
  syncWishlistWithSupabase,
} from '../services/wishlistService';

export interface Coupon {
  code: string;
  percentOff?: number;
  fixedOff?: number;
  description: string;
}

export interface CartContextType {
  cart: CartItem[];
  savedForLater: CartItem[];
  addToCart: (product: Product, quantity?: number, color?: string, size?: string) => void;
  removeFromCart: (productId: string, color?: string, size?: string) => void;
  updateQuantity: (productId: string, quantity: number, color?: string, size?: string) => void;
  saveForLater: (productId: string, color?: string, size?: string) => void;
  moveToCart: (item: CartItem) => void;
  removeSavedForLater: (productId: string, color?: string, size?: string) => void;
  clearCart: () => void;
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  coupon: Coupon | null;
  applyCoupon: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  total: number;
  cartCount: number;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  syncWithSupabase: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const VALID_COUPONS: Record<string, Coupon> = {
  'SHOPCART10': { code: 'SHOPCART10', percentOff: 10, description: '10% off entire order' },
  'SAVE20': { code: 'SAVE20', fixedOff: 200, description: '₹200 flat instant discount' },
  'WELCOME': { code: 'WELCOME', percentOff: 15, description: '15% exclusive welcome discount' },
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('shopcart_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [savedForLater, setSavedForLater] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('shopcart_saved_for_later');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('shopcart_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [coupon, setCoupon] = useState<Coupon | null>(() => {
    try {
      const saved = localStorage.getItem('shopcart_coupon');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  // Sync with Supabase on user sign-in
  useEffect(() => {
    let isCancelled = false;
    async function loadRemoteCart() {
      if (user && isSupabaseConfigured() && !user.id.startsWith('usr-demo')) {
        const remote = await fetchUserCartFromSupabase(user.id);
        if (!isCancelled && remote) {
          if (remote.cart.length > 0) {
            setCart(remote.cart);
          } else if (cart.length > 0) {
            // Push local cart to Supabase for the signed-in user
            syncCartWithSupabase(user.id, cart, savedForLater);
          }

          if (remote.savedForLater.length > 0) {
            setSavedForLater(remote.savedForLater);
          }
        }

        // Fetch customer's private wishlist from Supabase
        const remoteWishlist = await fetchUserWishlistFromSupabase(user.id);
        if (!isCancelled && remoteWishlist) {
          if (remoteWishlist.productIds.length > 0) {
            setWishlist(remoteWishlist.productIds);
          } else if (wishlist.length > 0) {
            syncWishlistWithSupabase(user.id, wishlist);
          }
        }
      }
    }
    loadRemoteCart();
    return () => {
      isCancelled = true;
    };
  }, [user?.id]);

  // Synchronize cart changes locally and to Supabase
  useEffect(() => {
    try {
      localStorage.setItem('shopcart_cart', JSON.stringify(cart));
    } catch (e) {
      console.warn('Storage error', e);
    }

    if (user && isSupabaseConfigured() && !user.id.startsWith('usr-demo')) {
      const timer = setTimeout(() => {
        syncCartWithSupabase(user.id, cart, savedForLater);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [cart, user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem('shopcart_saved_for_later', JSON.stringify(savedForLater));
    } catch (e) {
      console.warn('Storage error', e);
    }

    if (user && isSupabaseConfigured() && !user.id.startsWith('usr-demo')) {
      const timer = setTimeout(() => {
        syncCartWithSupabase(user.id, cart, savedForLater);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [savedForLater, user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem('shopcart_wishlist', JSON.stringify(wishlist));
    } catch (e) {
      console.warn('Storage error', e);
    }
  }, [wishlist]);

  useEffect(() => {
    try {
      if (coupon) {
        localStorage.setItem('shopcart_coupon', JSON.stringify(coupon));
      } else {
        localStorage.removeItem('shopcart_coupon');
      }
    } catch (e) {
      console.warn('Storage error', e);
    }
  }, [coupon]);

  const syncWithSupabase = async () => {
    if (user && isSupabaseConfigured()) {
      await syncCartWithSupabase(user.id, cart, savedForLater);
      showToast('Shopping cart synced with Supabase!', 'success');
    }
  };

  const addToCart = (product: Product, quantity = 1, color?: string, size?: string) => {
    const selectedColor = color || (product.colors && product.colors.length > 0 ? product.colors[0].name : undefined);
    const selectedSize = size || (product.sizes && product.sizes.length > 0 ? product.sizes[0] : undefined);
    const maxStock = product.stockCount !== undefined ? product.stockCount : 99;

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.selectedColor === selectedColor &&
          item.selectedSize === selectedSize
      );

      if (existingIndex > -1) {
        const next = [...prev];
        const currentQty = next[existingIndex].quantity;
        const newQty = Math.min(currentQty + quantity, maxStock);
        if (currentQty + quantity > maxStock) {
          showToast(`Maximum available stock (${maxStock}) reached for "${product.name}"`, 'warning');
        } else {
          showToast(`Updated quantity in cart (${newQty})`, 'success');
        }
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: newQty,
        };
        return next;
      } else {
        const initialQty = Math.min(quantity, maxStock);
        showToast(`Added "${product.name}" to cart!`, 'success');
        return [...prev, { product, quantity: initialQty, selectedColor, selectedSize }];
      }
    });
  };

  const removeFromCart = (productId: string, color?: string, size?: string) => {
    setCart((prev) =>
      prev.filter(
        (item) =>
          !(
            item.product.id === productId &&
            (!color || item.selectedColor === color) &&
            (!size || item.selectedSize === size)
          )
      )
    );
    showToast('Item removed from cart', 'info');
  };

  const updateQuantity = (productId: string, quantity: number, color?: string, size?: string) => {
    if (isNaN(quantity) || quantity <= 0) {
      removeFromCart(productId, color, size);
      return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (
          item.product.id === productId &&
          (!color || item.selectedColor === color) &&
          (!size || item.selectedSize === size)
        ) {
          const maxStock = item.product.stockCount !== undefined ? item.product.stockCount : 99;
          if (quantity > maxStock) {
            showToast(`Only ${maxStock} units currently available in stock.`, 'warning');
            return { ...item, quantity: maxStock };
          }
          return { ...item, quantity: Math.max(1, Math.floor(quantity)) };
        }
        return item;
      })
    );
  };

  const saveForLater = (productId: string, color?: string, size?: string) => {
    const itemToSave = cart.find(
      (item) =>
        item.product.id === productId &&
        (!color || item.selectedColor === color) &&
        (!size || item.selectedSize === size)
    );

    if (!itemToSave) return;

    setCart((prev) =>
      prev.filter(
        (item) =>
          !(
            item.product.id === productId &&
            (!color || item.selectedColor === color) &&
            (!size || item.selectedSize === size)
          )
      )
    );

    setSavedForLater((prev) => {
      const exists = prev.some(
        (item) =>
          item.product.id === productId &&
          item.selectedColor === itemToSave.selectedColor &&
          item.selectedSize === itemToSave.selectedSize
      );
      if (exists) return prev;
      return [...prev, itemToSave];
    });

    showToast(`Saved "${itemToSave.product.name}" for later!`, 'info');
  };

  const moveToCart = (item: CartItem) => {
    setSavedForLater((prev) =>
      prev.filter(
        (saved) =>
          !(
            saved.product.id === item.product.id &&
            saved.selectedColor === item.selectedColor &&
            saved.selectedSize === item.selectedSize
          )
      )
    );
    addToCart(item.product, item.quantity, item.selectedColor, item.selectedSize);
  };

  const removeSavedForLater = (productId: string, color?: string, size?: string) => {
    setSavedForLater((prev) =>
      prev.filter(
        (item) =>
          !(
            item.product.id === productId &&
            (!color || item.selectedColor === color) &&
            (!size || item.selectedSize === size)
          )
      )
    );
    showToast('Item removed from Saved for Later', 'info');
  };

  const clearCart = () => {
    setCart([]);
    showToast('Shopping cart cleared', 'info');
  };

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      const isSaved = prev.includes(productId);
      if (isSaved) {
        removeFromWishlistSupabase(user?.id, productId).catch(console.warn);
        showToast('Removed from your Wishlist', 'info');
        return prev.filter((id) => id !== productId);
      } else {
        addToWishlistSupabase(user?.id, productId).catch(console.warn);
        showToast('Saved to your private Wishlist!', 'success');
        return [...prev, productId];
      }
    });
  };

  const addToWishlist = (productId: string) => {
    setWishlist((prev) => {
      if (prev.includes(productId)) return prev;
      addToWishlistSupabase(user?.id, productId).catch(console.warn);
      showToast('Saved to your private Wishlist!', 'success');
      return [...prev, productId];
    });
  };

  const removeFromWishlist = (productId: string) => {
    setWishlist((prev) => {
      if (!prev.includes(productId)) return prev;
      removeFromWishlistSupabase(user?.id, productId).catch(console.warn);
      showToast('Removed from your Wishlist', 'info');
      return prev.filter((id) => id !== productId);
    });
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  const applyCoupon = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    const matched = VALID_COUPONS[cleanCode];
    if (matched) {
      setCoupon(matched);
      showToast(`Promo code applied: ${matched.description}`, 'success');
      return { success: true, message: `Applied ${matched.code}` };
    } else {
      showToast('Invalid coupon code. Try SHOPCART10 or SAVE20', 'error');
      return { success: false, message: 'Invalid promo code' };
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    showToast('Coupon removed', 'info');
  };

  // Cost Computations
  const subtotal = Number(
    cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0).toFixed(2)
  );

  let discountAmount = 0;
  if (coupon) {
    if (coupon.percentOff) {
      discountAmount = Number(((subtotal * coupon.percentOff) / 100).toFixed(2));
    } else if (coupon.fixedOff) {
      discountAmount = Math.min(coupon.fixedOff, subtotal);
    }
  }

  const shippingFee = subtotal === 0 ? 0 : subtotal >= 75 ? 0 : 12;
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const taxAmount = Number((taxableSubtotal * 0.08).toFixed(2));
  const total = Number((taxableSubtotal + shippingFee + taxAmount).toFixed(2));
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        savedForLater,
        addToCart,
        removeFromCart,
        updateQuantity,
        saveForLater,
        moveToCart,
        removeSavedForLater,
        clearCart,
        wishlist,
        toggleWishlist,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        coupon,
        applyCoupon,
        removeCoupon,
        subtotal,
        discountAmount,
        shippingFee,
        taxAmount,
        total,
        cartCount,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
        syncWithSupabase,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
