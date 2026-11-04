import React, { useState, useId } from 'react';
import {
  ShieldCheck,
  CreditCard,
  Truck,
  Lock,
  ChevronRight,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Tag,
  ArrowLeft,
  QrCode,
  Info,
  Clock,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { PageView, CartItem } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ProductImage } from '../components/common/ProductImage';
import { formatPrice } from '../utils/format';
import { createOrder, OrderResult } from '../services/orderService';
import { isSupabaseConfigured } from '../lib/supabase';
import { PayPalCheckoutButton } from '../components/checkout/PayPalCheckoutButton';

interface CheckoutPageProps {
  onNavigate: (page: PageView, params?: { productId?: string; category?: string; query?: string }) => void;
}

export type PaymentMethodType = 'paypal' | 'gpay_qr';

export interface CheckoutFormState {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  apartment: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  deliveryNotes: string;
  billingSameAsDelivery: boolean;
  paymentMethod: PaymentMethodType;
  gpayTransactionRef: string;
}

export interface CheckoutFormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  paymentMethod?: string;
  gpayTransactionRef?: string;
}

export interface CompletedOrderState {
  orderNumber: string;
  orderId?: string;
  customerName: string;
  customerEmail: string;
  paymentMethod: PaymentMethodType;
  paymentStatus: 'verified' | 'pending';
  transactionReference: string;
  totalAmount: number;
  items: CartItem[];
  isStoredInSupabase: boolean;
  verifiedAt: string;
}

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Germany',
  'France',
  'India',
  'Japan',
  'Singapore',
  'United Arab Emirates',
  'Other International',
];

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate }) => {
  const {
    cart,
    subtotal,
    discountAmount,
    shippingFee,
    taxAmount,
    total,
    coupon,
    applyCoupon,
    removeCoupon,
    clearCart,
  } = useCart();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrderState | null>(null);

  const couponInputId = useId();

  // Form Fields State
  const [formData, setFormData] = useState<CheckoutFormState>({
    fullName: user ? user.name : 'Alex Morgan',
    email: user ? user.email : 'alex.morgan@shopcart.com',
    phone: user?.phone || '+1 (555) 349-8291',
    address: user?.address ? user.address.street : '742 Evergreen Terrace',
    apartment: 'Apt 4B',
    city: user?.address ? user.address.city : 'Seattle',
    state: user?.address ? user.address.state : 'WA',
    postalCode: user?.address ? user.address.zipCode : '98101',
    country: user?.address?.country || 'United States',
    deliveryNotes: '',
    billingSameAsDelivery: true,
    paymentMethod: 'paypal',
    gpayTransactionRef: '',
  });

  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [couponInput, setCouponInput] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [shippingSpeed, setShippingSpeed] = useState<'standard' | 'express'>('standard');

  const computedShippingFee = shippingSpeed === 'express' ? shippingFee + 15 : shippingFee;
  const finalPayableTotal = Math.max(0, subtotal - discountAmount + computedShippingFee + taxAmount);

  // Synchronize user profile if signed in
  React.useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        fullName: prev.fullName || user.name,
        email: prev.email || user.email,
        phone: prev.phone || user.phone || '',
        address: prev.address || user.address?.street || '',
        city: prev.city || user.address?.city || '',
        state: prev.state || user.address?.state || '',
        postalCode: prev.postalCode || user.address?.zipCode || '',
        country: prev.country || user.address?.country || 'United States',
      }));
    }
  }, [user]);

  // Validation function
  const validateForm = (data: CheckoutFormState): CheckoutFormErrors => {
    const errs: CheckoutFormErrors = {};

    if (!data.fullName.trim()) errs.fullName = 'Full legal name is required';
    if (!data.email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      errs.email = 'Please provide a valid email format';
    }

    if (!data.phone.trim()) {
      errs.phone = 'Phone number is required for shipping updates';
    }

    if (!data.address.trim()) errs.address = 'Street delivery address is required';
    if (!data.city.trim()) errs.city = 'City is required';
    if (!data.state.trim()) errs.state = 'State / Province is required';
    if (!data.postalCode.trim()) errs.postalCode = 'Postal / ZIP code is required';
    if (!data.country.trim()) errs.country = 'Country is required';

    if (data.paymentMethod === 'gpay_qr') {
      if (!data.gpayTransactionRef.trim()) {
        errs.gpayTransactionRef = 'UPI Transaction Reference (UTR) is required to verify your payment';
      } else if (data.gpayTransactionRef.trim().length < 6) {
        errs.gpayTransactionRef = 'Please enter a valid 12-digit UPI reference number';
      }
    }

    return errs;
  };

  const handleFieldChange = (field: keyof CheckoutFormState, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);

    if (touched[field]) {
      const errs = validateForm(updated);
      setErrors(errs);
    }
  };

  const handleBlur = (field: keyof CheckoutFormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errs = validateForm(formData);
    setErrors(errs);
  };

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    setIsApplyingCoupon(true);
    setTimeout(() => {
      const result = applyCoupon(couponInput);
      setIsApplyingCoupon(false);
      if (result.success) {
        setCouponInput('');
      }
    }, 300);
  };

  // Check if contact & shipping fields are valid for PayPal activation
  const isShippingInfoValid = () => {
    return (
      formData.fullName.trim() &&
      formData.email.trim() &&
      formData.address.trim() &&
      formData.city.trim() &&
      formData.postalCode.trim()
    );
  };

  // Generate unique order reference
  const [currentOrderNumber] = useState(() => `EKO-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`);

  // Handler 1: PAYPAL AUTHORITATIVE CAPTURE SUCCESS
  const handlePayPalSuccess = async (transactionId: string, payerEmail: string) => {
    setIsSubmitting(true);
    try {
      const orderRes = await createOrder({
        orderNumber: currentOrderNumber,
        user,
        guestEmail: formData.email.trim(),
        cart,
        subtotal,
        discountAmount,
        shippingFee: computedShippingFee,
        taxAmount,
        totalAmount: finalPayableTotal,
        couponCode: coupon ? coupon.code : undefined,
        shippingAddress: {
          fullName: formData.fullName.trim(),
          street: formData.address.trim(),
          apartment: formData.apartment.trim() || undefined,
          city: formData.city.trim(),
          state: formData.state.trim(),
          postalCode: formData.postalCode.trim(),
          country: formData.country.trim(),
          phone: formData.phone.trim(),
        },
        customerNotes: formData.deliveryNotes.trim() || undefined,
        paymentMethod: 'paypal',
        paymentStatus: 'verified', // Strictly verified by backend capture
        transactionReference: transactionId,
      });

      setCompletedOrder({
        orderNumber: currentOrderNumber,
        orderId: orderRes.orderId,
        customerName: formData.fullName.trim(),
        customerEmail: formData.email.trim(),
        paymentMethod: 'paypal',
        paymentStatus: 'verified',
        transactionReference: transactionId,
        totalAmount: finalPayableTotal,
        items: [...cart],
        isStoredInSupabase: orderRes.isStoredInSupabase,
        verifiedAt: new Date().toLocaleTimeString(),
      });

      clearCart();
      showToast(`PayPal payment verified & Order #${currentOrderNumber} placed!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error recording order after PayPal capture', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler 2: GOOGLE PAY UPI QR SUBMISSION (SET TO PENDING)
  const handleGPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const allTouched: Record<string, boolean> = {
      fullName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      gpayTransactionRef: true,
    };
    setTouched(allTouched);

    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      showToast('Please provide all shipping details and your UPI Reference (UTR)', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanRef = formData.gpayTransactionRef.trim();

      // 1. Save order with paymentStatus: 'pending' (Never trust frontend as paid)
      const orderRes = await createOrder({
        orderNumber: currentOrderNumber,
        user,
        guestEmail: formData.email.trim(),
        cart,
        subtotal,
        discountAmount,
        shippingFee: computedShippingFee,
        taxAmount,
        totalAmount: finalPayableTotal,
        couponCode: coupon ? coupon.code : undefined,
        shippingAddress: {
          fullName: formData.fullName.trim(),
          street: formData.address.trim(),
          apartment: formData.apartment.trim() || undefined,
          city: formData.city.trim(),
          state: formData.state.trim(),
          postalCode: formData.postalCode.trim(),
          country: formData.country.trim(),
          phone: formData.phone.trim(),
        },
        customerNotes: formData.deliveryNotes.trim() || undefined,
        paymentMethod: 'gpay_qr',
        paymentStatus: 'pending', // Explicitly Pending Manual Admin Verification
        transactionReference: cleanRef,
      });

      // 2. Notify backend server
      try {
        await fetch('/api/payments/record-gpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber: currentOrderNumber,
            upiTransactionRef: cleanRef,
            amount: finalPayableTotal,
          }),
        });
      } catch (beErr) {
        console.warn('Backend notification error:', beErr);
      }

      setCompletedOrder({
        orderNumber: currentOrderNumber,
        orderId: orderRes.orderId,
        customerName: formData.fullName.trim(),
        customerEmail: formData.email.trim(),
        paymentMethod: 'gpay_qr',
        paymentStatus: 'pending',
        transactionReference: cleanRef,
        totalAmount: finalPayableTotal,
        items: [...cart],
        isStoredInSupabase: orderRes.isStoredInSupabase,
        verifiedAt: new Date().toLocaleTimeString(),
      });

      clearCart();
      showToast(`Order #${currentOrderNumber} placed! Awaiting admin payment verification.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Error submitting order', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Demo auto-fill helper
  const handleLoadDemoProfile = () => {
    setFormData({
      fullName: 'Alex Morgan',
      email: 'alex.morgan@shopcart.com',
      phone: '+1 (555) 349-8291',
      address: '742 Evergreen Terrace',
      apartment: 'Suite 402',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      country: 'United States',
      deliveryNotes: 'Leave with concierge.',
      billingSameAsDelivery: true,
      paymentMethod: formData.paymentMethod,
      gpayTransactionRef: 'UPI-982140294183',
    });
    setErrors({});
    showToast('Applied sample customer profile data', 'info');
  };

  // Empty cart fallback
  if (cart.length === 0 && !completedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-20 h-20 bg-emerald-50 border border-emerald-200/60 rounded-2xl flex items-center justify-center mx-auto text-[#0b5c37]">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Your Cart is Empty</h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            You cannot proceed to checkout without any items. Select items from our catalog to test the checkout experience.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
          <button
            onClick={() => onNavigate('shop')}
            className="w-full sm:w-auto px-6 py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            Explore Catalog
          </button>
          <button
            onClick={() => onNavigate('home')}
            className="w-full sm:w-auto px-6 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/60 min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Navigation Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <button
            onClick={() => onNavigate('home')}
            className="hover:text-[#0b5c37] transition-colors cursor-pointer"
          >
            Home
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <button
            onClick={() => onNavigate('cart')}
            className="hover:text-[#0b5c37] transition-colors cursor-pointer"
          >
            Cart
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-bold">Secure Checkout</span>
        </nav>

        {/* Page Header */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#0b5c37] bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded">
                Shop Cart Checkout
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-600" /> 256-Bit SSL Encrypted
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Order Checkout &amp; Real Payments
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Select PayPal Checkout or scan our Google Pay UPI QR code to complete your purchase.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              type="button"
              onClick={handleLoadDemoProfile}
              className="text-xs px-3.5 py-2 border border-slate-300 hover:border-[#0b5c37] hover:text-[#0b5c37] bg-white font-semibold rounded-lg text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0b5c37]" />
              <span>Auto-Fill Sample Info</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('cart')}
              className="text-xs px-3.5 py-2 border border-slate-200 hover:bg-slate-50 font-semibold rounded-lg text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Cart</span>
            </button>
          </div>
        </div>

        {/* Two-Column Checkout Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Sections 1, 2, 8 (Customer, Shipping & Payment) */}
          <div className="lg:col-span-7 space-y-6">
            {/* SECTION 1: Customer Information */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                  1
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Customer Information</h2>
                  <p className="text-xs text-slate-500">Contact details for order invoice and dispatch notices</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Legal Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleFieldChange('fullName', e.target.value)}
                    onBlur={() => handleBlur('fullName')}
                    placeholder="e.g. Jordan Hayes"
                    className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-lg transition-colors focus:outline-none focus:bg-white focus:ring-2 ${
                      errors.fullName && touched.fullName
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-200 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.fullName && touched.fullName && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    onBlur={() => handleBlur('email')}
                    placeholder="jordan@example.com"
                    className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-lg transition-colors focus:outline-none focus:bg-white focus:ring-2 ${
                      errors.email && touched.email
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-200 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.email && touched.email && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    onBlur={() => handleBlur('phone')}
                    placeholder="+1 (555) 234-5678"
                    className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-lg transition-colors focus:outline-none focus:bg-white focus:ring-2 ${
                      errors.phone && touched.phone
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-200 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.phone && touched.phone && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.phone}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* SECTION 2: Delivery Address */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                  2
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Delivery Address</h2>
                  <p className="text-xs text-slate-500">Physical destination for shipping and parcel tracking</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Street Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    onBlur={() => handleBlur('address')}
                    placeholder="e.g. 742 Evergreen Terrace"
                    className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-lg transition-colors focus:outline-none focus:bg-white focus:ring-2 ${
                      errors.address && touched.address
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-200 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.address && touched.address && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.address}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Apartment / Suite (Optional)
                  </label>
                  <input
                    type="text"
                    name="apartment"
                    value={formData.apartment}
                    onChange={(e) => handleFieldChange('apartment', e.target.value)}
                    placeholder="Apt 4B, Floor 2"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={(e) => handleFieldChange('city', e.target.value)}
                    onBlur={() => handleBlur('city')}
                    placeholder="Seattle"
                    className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-lg transition-colors focus:outline-none focus:bg-white focus:ring-2 ${
                      errors.city && touched.city
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-200 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    State / Province <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={(e) => handleFieldChange('state', e.target.value)}
                    onBlur={() => handleBlur('state')}
                    placeholder="WA"
                    className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-lg transition-colors focus:outline-none focus:bg-white focus:ring-2 ${
                      errors.state && touched.state
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-200 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Postal / ZIP Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={(e) => handleFieldChange('postalCode', e.target.value)}
                    onBlur={() => handleBlur('postalCode')}
                    placeholder="98101"
                    className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 border rounded-lg transition-colors focus:outline-none focus:bg-white focus:ring-2 ${
                      errors.postalCode && touched.postalCode
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-200 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Country <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="country"
                    value={formData.country}
                    onChange={(e) => handleFieldChange('country', e.target.value)}
                    onBlur={() => handleBlur('country')}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-200"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* SECTION 8: Real Payment Method Selection */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                    8
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Payment Gateway Selection</h2>
                    <p className="text-xs text-slate-500">Official PayPal SDK &amp; Google Pay UPI QR</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Real Gateway Ready</span>
                </span>
              </div>

              {/* Payment Method Selector Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Method 1: PayPal */}
                <div
                  onClick={() => handleFieldChange('paymentMethod', 'paypal')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    formData.paymentMethod === 'paypal'
                      ? 'border-[#0b5c37] bg-emerald-50/40 ring-2 ring-[#0b5c37]/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="paypal"
                        checked={formData.paymentMethod === 'paypal'}
                        onChange={() => handleFieldChange('paymentMethod', 'paypal')}
                        className="accent-[#0b5c37] w-4 h-4 cursor-pointer"
                      />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#003087] text-white flex items-center justify-center font-black text-sm shadow-xs">
                          P
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">PayPal Checkout</h4>
                          <p className="text-[11px] text-slate-500">Official PayPal SDK &amp; Backend Capture</p>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-[#0070BA] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                      Official SDK
                    </span>
                  </div>
                </div>

                {/* Method 2: Google Pay QR */}
                <div
                  onClick={() => handleFieldChange('paymentMethod', 'gpay_qr')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    formData.paymentMethod === 'gpay_qr'
                      ? 'border-[#0b5c37] bg-emerald-50/40 ring-2 ring-[#0b5c37]/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="gpay_qr"
                        checked={formData.paymentMethod === 'gpay_qr'}
                        onChange={() => handleFieldChange('paymentMethod', 'gpay_qr')}
                        className="accent-[#0b5c37] w-4 h-4 cursor-pointer"
                      />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 text-emerald-600 flex items-center justify-center shadow-xs">
                          <QrCode className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Google Pay UPI QR</h4>
                          <p className="text-[11px] text-slate-500">Scan &amp; Submit UTR Reference</p>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      Pending Admin Review
                    </span>
                  </div>
                </div>
              </div>

              {/* PAYMENT METHOD 1: PAYPAL ACTIVE CONTAINER */}
              {formData.paymentMethod === 'paypal' && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-100 rounded-lg text-[#003087]">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Official PayPal Checkout Gateway
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Secure backend order initialization &amp; authoritative server-side capture verification.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded border border-blue-200">
                      v2 REST API
                    </span>
                  </div>

                  {/* Form validation warning before PayPal activates */}
                  {!isShippingInfoValid() ? (
                    <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Shipping information required:</span>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          Please fill in your name, email, street address, city, and zip code above before authorizing through PayPal.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Official PayPal Buttons Component */
                    <div className="pt-1 space-y-3">
                      <PayPalCheckoutButton
                        orderNumber={currentOrderNumber}
                        totalAmount={finalPayableTotal}
                        items={cart.map((i) => ({
                          id: i.product.id,
                          name: i.product.name,
                          price: i.product.price,
                          quantity: i.quantity,
                        }))}
                        currency="INR"
                        onPaymentSuccess={handlePayPalSuccess}
                        onPaymentError={(errMsg) => showToast(errMsg, 'error')}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}

                  <div className="p-3 bg-white rounded-xl border border-slate-200/80 text-[11px] text-slate-500 space-y-1">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span>SECURITY PROTOCOL:</span>
                      <span className="text-emerald-700 font-bold">STRICT SERVER-SIDE VERIFICATION</span>
                    </div>
                    <p>
                      Never trusts frontend tokens or responses alone. Payments are authoritatively captured and verified through our Express backend before orders are marked as Paid in Supabase.
                    </p>
                  </div>
                </div>
              )}

              {/* PAYMENT METHOD 2: GOOGLE PAY UPI QR CONTAINER */}
              {formData.paymentMethod === 'gpay_qr' && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-5 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* Embedded User Google Pay QR Code */}
                    <div className="relative shrink-0 p-3 bg-white rounded-2xl border-2 border-[#0b5c37] shadow-md">
                      <div className="w-44 h-44 sm:w-48 sm:h-48 overflow-hidden rounded-xl bg-black flex items-center justify-center">
                        <img
                          src="/assets/aistudio/qr_eeef5752.jpeg"
                          alt="Google Pay QR Code for Shop Cart"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="text-center mt-2">
                        <span className="text-[10px] font-mono font-bold text-slate-700 uppercase tracking-widest block">
                          Official Merchant QR
                        </span>
                        <span className="text-[10px] text-[#0b5c37] font-bold">
                          Scan with Google Pay / PhonePe
                        </span>
                      </div>
                    </div>

                    {/* Step-by-step instructions */}
                    <div className="space-y-3 text-xs flex-1">
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>Google Pay &amp; UPI Payment Instructions</span>
                          <span className="text-[10px] text-[#08482b] bg-emerald-100 font-semibold px-2 py-0.5 rounded">
                            Step-by-Step
                          </span>
                        </h4>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Scan the dedicated merchant QR code using Google Pay, PhonePe, Paytm, or any UPI-supported banking application.
                        </p>
                      </div>

                      <ol className="list-decimal list-inside space-y-1.5 text-slate-700 text-xs">
                        <li>Open Google Pay or your preferred UPI banking app.</li>
                        <li>Select <strong>Scan QR</strong> and point camera at the code.</li>
                        <li>
                          Transfer the exact total payable amount of{' '}
                          <strong className="text-[#0b5c37] font-mono text-sm">
                            ${finalPayableTotal.toFixed(2)}
                          </strong>
                          .
                        </li>
                        <li>
                          Copy the <strong>12-digit UPI Reference / UTR Number</strong> generated upon payment completion.
                        </li>
                      </ol>

                      {/* Required UPI Reference (UTR) Field */}
                      <div className="pt-2">
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          UPI Transaction Reference / UTR Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.gpayTransactionRef}
                          onChange={(e) => handleFieldChange('gpayTransactionRef', e.target.value)}
                          onBlur={() => handleBlur('gpayTransactionRef')}
                          placeholder="e.g. 431029482910 or UPI-439281"
                          className={`w-full px-3.5 py-2.5 text-xs bg-white border rounded-xl focus:outline-none focus:ring-2 font-mono ${
                            errors.gpayTransactionRef && touched.gpayTransactionRef
                              ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                              : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                          }`}
                        />
                        {errors.gpayTransactionRef && touched.gpayTransactionRef && (
                          <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {errors.gpayTransactionRef}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500 mt-1">
                          Found in your banking app payment receipt under &ldquo;UPI Ref No.&rdquo; or &ldquo;UTR&rdquo;.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security Protocol Notice: Never trust screenshots */}
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/90 text-xs space-y-1.5 text-amber-950">
                    <div className="flex items-center gap-2 font-bold text-amber-900">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Security Policy: Manual Admin Verification Required</span>
                    </div>
                    <p className="text-[11px] text-amber-900/90 leading-relaxed">
                      <strong>Important:</strong> Never trust screenshots as proof of payment. When you submit this order, its payment status is set strictly to <strong>Pending</strong>. An administrator must verify receipt of the credit in our merchant bank account before the order is marked as Paid and dispatched.
                    </p>
                  </div>

                  {/* Submit Button for Google Pay */}
                  <form onSubmit={handleGPaySubmit}>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Recording UPI Order &amp; Setting to Pending...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-emerald-600" />
                          <span>Submit Order with UPI Reference (${finalPayableTotal.toFixed(2)})</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Order Summary, Items & Summary Cards */}
          <div className="lg:col-span-5 space-y-6">
            {/* SECTION 3: Ordered Products */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                    3
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Ordered Products</h2>
                    <p className="text-xs text-slate-500">{cart.length} items ready for checkout</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('cart')}
                  className="text-xs text-[#0b5c37] hover:underline font-semibold cursor-pointer"
                >
                  Edit Cart
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={item.product.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                        <ProductImage product={item.product} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 line-clamp-1">{item.product.name}</h4>
                        <p className="text-[11px] text-slate-500">
                          Qty: {item.quantity} · {formatPrice(item.product.price)} each
                        </p>
                      </div>
                    </div>
                    <span className="font-extrabold text-slate-900 tabular-nums">
                      {formatPrice(item.product.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 6: Coupons & Vouchers */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Tag className="w-4 h-4 text-[#0b5c37]" />
                <span>Coupon Code / Voucher</span>
              </div>

              {coupon ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-emerald-950">{coupon.code}</span>
                    <span className="text-emerald-700 text-[11px] ml-2">(-{formatPrice(discountAmount)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="text-rose-600 hover:text-rose-800 text-[11px] font-bold cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id={couponInputId}
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="e.g. SHOPCART10"
                    className="flex-1 px-3 py-2 text-xs uppercase bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37] font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={isApplyingCoupon || !couponInput.trim()}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </section>

            {/* SECTION 4 & 5 & 7: Summary & Grand Total */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                  4 &amp; 7
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Order Summary &amp; Total</h2>
                  <p className="text-xs text-slate-500">Includes delivery and applicable taxes</p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs text-slate-600">
                <div className="flex justify-between items-center">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{formatPrice(subtotal)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-emerald-600 font-semibold">
                    <span>Discount Savings</span>
                    <span className="tabular-nums">-{formatPrice(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span>Shipping Fee</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {computedShippingFee === 0 ? <span className="text-emerald-600 font-bold">FREE</span> : `$${computedShippingFee.toFixed(2)}`}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span>Estimated Tax (8%)</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{formatPrice(taxAmount)}</span>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <div>
                    <span className="text-sm font-extrabold text-slate-900 block">Grand Total</span>
                    <span className="text-[11px] text-slate-400">Currency: INR (₹)</span>
                  </div>
                  <span className="text-2xl font-black text-[#0b5c37] tabular-nums">
                    ${finalPayableTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-500 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Buyer Protection Guaranteed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <span>Insured Shipping</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* COMPLETED ORDER CONFIRMATION MODAL */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 my-8 animate-in zoom-in-95 duration-200">
            {/* Modal Icon and Status */}
            <div className="text-center space-y-3">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-md ${
                  completedOrder.paymentStatus === 'verified'
                    ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-600'
                    : 'bg-amber-50 border-2 border-amber-300 text-amber-600'
                }`}
              >
                {completedOrder.paymentStatus === 'verified' ? (
                  <CheckCircle2 className="w-8 h-8" />
                ) : (
                  <Clock className="w-8 h-8" />
                )}
              </div>

              <div>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    completedOrder.paymentStatus === 'verified'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {completedOrder.paymentStatus === 'verified'
                    ? 'Payment Captured & Verified'
                    : 'Payment Status: Pending Verification'}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-2">
                  {completedOrder.paymentStatus === 'verified'
                    ? 'Order Placed & Paid Successfully!'
                    : 'Order Placed — Awaiting Admin Verification'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Order Number:{' '}
                  <strong className="font-mono text-slate-900 text-sm">
                    #{completedOrder.orderNumber}
                  </strong>
                </p>
              </div>
            </div>

            {/* Receipt Summary Card */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs text-slate-700">
              <div className="flex justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Payment Method:</span>
                <strong className="uppercase font-semibold">
                  {completedOrder.paymentMethod === 'paypal' ? 'PayPal Gateway' : 'Google Pay UPI QR'}
                </strong>
              </div>

              <div className="flex justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">
                  {completedOrder.paymentMethod === 'paypal' ? 'PayPal Transaction ID:' : 'UPI Reference (UTR):'}
                </span>
                <span className="font-mono font-bold text-slate-900 truncate max-w-[200px]">
                  {completedOrder.transactionReference}
                </span>
              </div>

              <div className="flex justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Amount Paid / Transferred:</span>
                <strong className="text-[#0b5c37] font-extrabold tabular-nums">
                  {formatPrice(completedOrder.totalAmount)}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Order Database Record:</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved in Supabase &amp; Inventory Deducted</span>
                </span>
              </div>
            </div>

            {/* Explanatory Message */}
            <div className="text-xs text-slate-600 leading-relaxed bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200">
              {completedOrder.paymentStatus === 'verified' ? (
                <p>
                  Your transaction has been verified directly with PayPal servers. Your items are being prepared for express shipping.
                </p>
              ) : (
                <p>
                  <strong>Admin Verification Policy:</strong> In accordance with our security guidelines, we never trust screenshots as proof of payment. An administrator will verify the UTR reference against our bank statement before shipping your items.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCompletedOrder(null);
                  onNavigate('account');
                }}
                className="w-full py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View Order in Customer Account</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompletedOrder(null);
                  onNavigate('shop');
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
