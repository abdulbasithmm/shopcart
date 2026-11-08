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
  Upload,
  FileImage,
  Download,
  Smartphone,
  Sparkles,
  ShieldAlert,
  Eye,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { PageView, CartItem, AIScreenshotAnalysis, MerchantPaymentSettings } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ProductImage } from '../components/common/ProductImage';
import { formatPrice } from '../utils/format';
import { createOrder, OrderResult } from '../services/orderService';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface CheckoutPageProps {
  onNavigate: (page: PageView, params?: { productId?: string; category?: string; query?: string }) => void;
}

export type PaymentMethodType =
  | 'all_upi'
  | 'gpay_upi'
  | 'phonepe_upi'
  | 'paytm_upi'
  | 'bhim_upi'
  | 'other_upi';

export interface CheckoutFormState {
  fullName: string;
  phone: string; // 10-digit Indian Mobile Number
  email: string;
  houseBuilding: string; // House / Flat / Building Name
  streetArea: string; // Street / Road / Area / Locality
  city: string;
  state: string;
  pinCode: string; // 6-digit Indian PIN Code
  landmark: string; // Optional
  deliveryInstructions: string; // Optional
  country: string;
  paymentMethod: PaymentMethodType;
  upiTransactionRef: string;
  // Backward compatibility fields
  address?: string;
  apartment?: string;
  postalCode?: string;
  deliveryNotes?: string;
  billingSameAsDelivery?: boolean;
}

export interface CheckoutFormErrors {
  fullName?: string;
  phone?: string;
  email?: string;
  houseBuilding?: string;
  streetArea?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  landmark?: string;
  deliveryInstructions?: string;
  country?: string;
  paymentMethod?: string;
  upiTransactionRef?: string;
  address?: string;
  postalCode?: string;
}

export interface CompletedOrderState {
  orderNumber: string;
  orderId?: string;
  customerName: string;
  customerEmail: string;
  paymentMethod: PaymentMethodType;
  paymentStatus: 'pending_verification' | 'pending_admin_verification' | 'pending' | 'verified';
  transactionReference: string;
  totalAmount: number;
  items: CartItem[];
  isStoredInSupabase: boolean;
  verifiedAt: string;
  screenshotUrl?: string | null;
  aiAnalysis?: AIScreenshotAnalysis | null;
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
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);

  // Dynamic Merchant Payment Settings from Server / Database
  const [merchantSettings, setMerchantSettings] = useState<MerchantPaymentSettings>({
    merchant_upi_id: 'shopcart.merchant@okaxis',
    merchant_name: 'Shop Cart Online Store',
    merchant_upi_number: '+91 98765 43210',
    qr_image_url: '/assets/aistudio/qr_eeef5752.jpeg',
    enable_dynamic_qr: true,
    instructions: 'Scan QR with any UPI app, complete payment, and upload screenshot with 12-digit UTR.',
  });

  // Fetch real merchant settings on component mount
  React.useEffect(() => {
    fetch('/api/payments/merchant-settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.merchant_upi_id) {
          setMerchantSettings((prev) => ({ ...prev, ...data }));
        }
      })
      .catch((err) => console.warn('Could not load merchant settings:', err));
  }, []);

  // Screenshot Upload & AI Fraud Screening States
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isAnalyzingScreenshot, setIsAnalyzingScreenshot] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIScreenshotAnalysis | null>(null);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);

  // Form Fields State
  const [formData, setFormData] = useState<CheckoutFormState>({
    fullName: user ? user.name : 'Rahul Sharma',
    phone: user?.phone || '9876543210',
    email: user ? user.email : 'rahul.sharma@example.in',
    houseBuilding: 'Flat 402, Lotus Tower',
    streetArea: 'MG Road, Indiranagar',
    city: user?.address ? user.address.city : 'Bengaluru',
    state: user?.address ? user.address.state : 'Karnataka',
    pinCode: user?.address ? user.address.zipCode : '560038',
    landmark: 'Near Indiranagar Metro Station',
    deliveryInstructions: 'Please call on arrival.',
    country: 'India',
    address: 'Flat 402, Lotus Tower, MG Road, Indiranagar',
    apartment: 'Flat 402, Lotus Tower',
    postalCode: '560038',
    deliveryNotes: 'Please call on arrival.',
    billingSameAsDelivery: true,
    paymentMethod: 'all_upi',
    upiTransactionRef: '',
  });

  const handleCopyUpiId = () => {
    const upiId = merchantSettings.merchant_upi_id || 'shopcart.merchant@okaxis';
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      showToast(`Merchant UPI ID copied: ${upiId}`, 'success');
      setTimeout(() => setCopiedUpi(false), 2500);
    }
  };

  const handleCopyPhone = () => {
    const phone = merchantSettings.merchant_upi_number || '+91 98765 43210';
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(phone);
      setCopiedPhone(true);
      showToast(`Merchant Phone Number copied: ${phone}`, 'success');
      setTimeout(() => setCopiedPhone(false), 2500);
    }
  };

  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [couponInput, setCouponInput] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [shippingSpeed, setShippingSpeed] = useState<'standard' | 'express'>('standard');

  const computedShippingFee = shippingSpeed === 'express' ? shippingFee + 15 : shippingFee;
  const finalPayableTotal = Math.max(0, subtotal - discountAmount + computedShippingFee + taxAmount);

  // Dynamic Order UPI URI and Dynamic QR URL
  const dynamicUpiUri = `upi://pay?pa=${encodeURIComponent(merchantSettings.merchant_upi_id || 'shopcart.merchant@okaxis')}&pn=${encodeURIComponent(merchantSettings.merchant_name || 'Shop Cart Online Store')}&am=${finalPayableTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Shopcart Order ' + (formData.fullName ? formData.fullName.split(' ')[0] : 'Customer'))}`;
  const dynamicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(dynamicUpiUri)}`;
  const displayQrCodeUrl = merchantSettings.enable_dynamic_qr
    ? dynamicQrUrl
    : (merchantSettings.qr_image_url || '/assets/aistudio/qr_eeef5752.jpeg');

  const handleDownloadQr = () => {
    const link = document.createElement('a');
    link.href = displayQrCodeUrl;
    link.download = `Shopcart_Payment_QR.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Payment QR code download initiated', 'info');
  };

  // Screenshot Upload and Automated Gemini AI Fraud Screening
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      showToast('Please upload a valid receipt screenshot (JPG, PNG, or WEBP).', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('Receipt file size exceeds 10MB limit. Please upload a smaller image.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Str = reader.result as string;
      setScreenshotPreview(base64Str);

      // Trigger server-side Gemini 3.8 Flash analysis
      setIsAnalyzingScreenshot(true);
      setAiAnalysisError(null);
      try {
        const res = await fetch('/api/payments/analyze-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenshotBase64: base64Str,
            mimeType: file.type,
            expectedAmount: finalPayableTotal,
            expectedOrderNumber: currentOrderNumber,
            expectedMerchantUpi: merchantSettings.merchant_upi_id,
          }),
        });

        const data = await res.json();
        if (data.analysis) {
          setAiAnalysis(data.analysis);
          // If UTR extracted, auto-fill it
          if (data.analysis.extracted_utr && data.analysis.extracted_utr.length === 12) {
            setFormData((prev) => ({
              ...prev,
              upiTransactionRef: data.analysis.extracted_utr,
            }));
            showToast(`Auto-recognized 12-digit UTR: ${data.analysis.extracted_utr}`, 'success');
          } else {
            showToast('Receipt uploaded. Please verify or enter your 12-digit UTR.', 'info');
          }
        } else if (data.error) {
          setAiAnalysisError(data.error);
        }
      } catch (err: any) {
        console.warn('AI analysis error:', err);
        setAiAnalysisError('Preliminary AI screening was bypassed or timed out. Your receipt will be verified manually by an admin.');
      } finally {
        setIsAnalyzingScreenshot(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveScreenshot = () => {
    setScreenshotPreview(null);
    setAiAnalysis(null);
    setAiAnalysisError(null);
  };

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
        state: prev.state || user.address?.state || 'Karnataka',
        city: prev.city || user.address?.city || 'Bengaluru',
        pinCode: prev.pinCode || user.address?.zipCode || '560038',
        country: 'India',
      }));
    }
  }, [user]);

  // Validation function for delivery details and 12-digit UPI UTR
  const validateForm = (data: CheckoutFormState): CheckoutFormErrors => {
    const errs: CheckoutFormErrors = {};

    if (!data.fullName.trim()) {
      errs.fullName = 'Full legal name is required';
    }

    // 10-digit Indian Mobile Number validation
    const cleanPhone = data.phone.replace(/[\s\-\+\(\)]/g, '').replace(/^91/, '');
    if (!data.phone.trim()) {
      errs.phone = 'Mobile number is required for dispatch notifications';
    } else if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      errs.phone = 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)';
    }

    if (!data.email.trim()) {
      errs.email = 'Email address is required for invoice delivery';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      errs.email = 'Please provide a valid email address';
    }

    if (!data.houseBuilding.trim()) {
      errs.houseBuilding = 'House / Flat / Building name or number is required';
    }

    if (!data.streetArea.trim()) {
      errs.streetArea = 'Street / Road / Area / Sector name is required';
    }

    if (!data.city.trim()) {
      errs.city = 'City / Town name is required';
    }

    if (!data.state.trim()) {
      errs.state = 'State / Union Territory is required';
    }

    // 6-digit Indian PIN Code validation
    const cleanPin = (data.pinCode || '').trim();
    if (!cleanPin) {
      errs.pinCode = '6-digit PIN code is required';
    } else if (!/^\d{6}$/.test(cleanPin)) {
      errs.pinCode = 'Please enter a valid 6-digit Indian postal PIN code (e.g. 560001)';
    }

    // 12-digit UPI UTR Reference validation
    const cleanUtr = (data.upiTransactionRef || '').replace(/[\s-]/g, '').trim();
    if (!cleanUtr) {
      errs.upiTransactionRef = '12-digit UPI Transaction Reference (UTR) is required to verify payment';
    } else if (cleanUtr.length !== 12 || !/^[0-9A-Za-z]{12}$/.test(cleanUtr)) {
      errs.upiTransactionRef = 'Please enter a valid 12-digit alphanumeric UPI UTR reference (e.g. 431029482910)';
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

  // Generate unique order reference
  const [currentOrderNumber] = useState(() => `SC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`);

  // UPI SUBMISSION HANDLER (GOOGLE PAY & PHONEPE & UNIVERSAL UPI)
  const handleUPIOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const allTouched: Record<string, boolean> = {
      fullName: true,
      phone: true,
      email: true,
      houseBuilding: true,
      streetArea: true,
      city: true,
      state: true,
      pinCode: true,
      upiTransactionRef: true,
    };
    setTouched(allTouched);

    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      showToast('Please complete all required delivery fields and enter a valid 12-digit UPI UTR.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanRef = (formData.upiTransactionRef || '').replace(/[\s-]/g, '').trim().toUpperCase();
      const cleanPhone = formData.phone.replace(/[\s\-\+\(\)]/g, '').replace(/^91/, '');

      // 1. Submit order via Secure Backend Order Creation API
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
          phone: cleanPhone,
          email: formData.email.trim(),
          houseBuilding: formData.houseBuilding.trim(),
          streetArea: formData.streetArea.trim(),
          street: `${formData.houseBuilding.trim()}, ${formData.streetArea.trim()}`,
          apartment: formData.houseBuilding.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          postalCode: formData.pinCode.trim(),
          pinCode: formData.pinCode.trim(),
          landmark: (formData.landmark || '').trim(),
          deliveryInstructions: (formData.deliveryInstructions || '').trim(),
          country: formData.country || 'India',
        },
        customerNotes: (formData.deliveryInstructions || '').trim() || undefined,
        paymentMethod: formData.paymentMethod,
        paymentStatus: 'pending_admin_verification',
        transactionReference: cleanRef,
        screenshotUrl: screenshotPreview || undefined,
        aiAnalysis: aiAnalysis || undefined,
      });

      if (!orderRes.success) {
        throw new Error(orderRes.errorMessage || 'Failed to submit order. Please verify your details and retry.');
      }

      setCompletedOrder({
        orderNumber: currentOrderNumber,
        orderId: orderRes.orderId,
        customerName: formData.fullName.trim(),
        customerEmail: formData.email.trim(),
        paymentMethod: formData.paymentMethod,
        paymentStatus: 'pending_admin_verification',
        transactionReference: cleanRef,
        totalAmount: finalPayableTotal,
        items: [...cart],
        isStoredInSupabase: orderRes.isStoredInSupabase,
        verifiedAt: new Date().toLocaleTimeString(),
        screenshotUrl: screenshotPreview || null,
        aiAnalysis: aiAnalysis || null,
      });

      // Clear cart only after confirmed order creation
      clearCart();
      showToast('Order placed successfully! Details submitted for administrative ledger verification.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error submitting order', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Demo auto-fill helper with Indian delivery address
  const handleLoadDemoProfile = () => {
    setFormData({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      email: 'rahul.sharma@example.in',
      houseBuilding: 'Flat 402, Lotus Tower',
      streetArea: 'MG Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560038',
      landmark: 'Near Indiranagar Metro Station',
      deliveryInstructions: 'Please call on arrival; leave with building security if unavailable.',
      country: 'India',
      address: 'Flat 402, Lotus Tower, MG Road, Indiranagar',
      apartment: 'Flat 402, Lotus Tower',
      postalCode: '560038',
      deliveryNotes: 'Please call on arrival.',
      billingSameAsDelivery: true,
      paymentMethod: formData.paymentMethod,
      upiTransactionRef: '431029482910',
    });
    setErrors({});
    showToast('Applied sample Indian delivery details & 12-digit sample UTR', 'info');
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
              Select Google Pay or PhonePe to scan the merchant QR code and complete your UPI purchase.
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

            {/* SECTION 8: Universal UPI Payment System & AI Screenshot Fraud Analysis */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                    8
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Universal UPI Payment System</h2>
                    <p className="text-xs text-slate-500">Pay via Google Pay, PhonePe, Paytm, BHIM, or any UPI app</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified Merchant UPI</span>
                  </span>
                </div>
              </div>

              {/* Universal UPI App Selection Grid */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Choose Your Preferred UPI Application
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'all_upi', name: 'All UPI Apps', sub: 'Scan Any UPI QR', icon: QrCode, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    { id: 'gpay_upi', name: 'Google Pay', sub: 'GPay UPI', icon: Smartphone, color: 'text-blue-700 bg-blue-50 border-blue-200' },
                    { id: 'phonepe_upi', name: 'PhonePe', sub: 'PhonePe UPI', icon: Smartphone, color: 'text-purple-700 bg-purple-50 border-purple-200' },
                    { id: 'paytm_upi', name: 'Paytm', sub: 'Paytm Wallet/UPI', icon: Smartphone, color: 'text-sky-700 bg-sky-50 border-sky-200' },
                    { id: 'bhim_upi', name: 'BHIM UPI', sub: 'NPCI BHIM', icon: QrCode, color: 'text-amber-700 bg-amber-50 border-amber-200' },
                    { id: 'other_upi', name: 'Other UPI', sub: 'Cred / Amazon / Bank', icon: ExternalLink, color: 'text-slate-700 bg-slate-50 border-slate-200' },
                  ].map((provider) => {
                    const isSelected = formData.paymentMethod === provider.id;
                    const IconComp = provider.icon;
                    return (
                      <div
                        key={provider.id}
                        onClick={() => handleFieldChange('paymentMethod', provider.id as PaymentMethodType)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'border-[#0b5c37] bg-emerald-50/50 ring-2 ring-[#0b5c37]/20 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold border ${provider.color}`}>
                            <IconComp className="w-3.5 h-3.5" />
                          </span>
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={provider.id}
                            checked={isSelected}
                            onChange={() => handleFieldChange('paymentMethod', provider.id as PaymentMethodType)}
                            className="accent-[#0b5c37] w-3.5 h-3.5 cursor-pointer"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 truncate">{provider.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{provider.sub}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* DEDICATED UNIVERSAL UPI CONSOLE */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-6 animate-in fade-in duration-200">
                {/* Console Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#0b5c37] flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Universal Merchant UPI QR &amp; Gateway
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Scan with any UPI app to transfer exact order amount
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Payable Total:</span>
                    <span className="text-base font-black text-[#0b5c37] font-mono tabular-nums">
                      {formatPrice(finalPayableTotal)}
                    </span>
                  </div>
                </div>

                {/* QR Display + Merchant Info */}
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                  {/* Dynamic or Official Merchant QR Box */}
                  <div className="relative shrink-0 p-3.5 bg-white rounded-2xl border-2 border-[#0b5c37] shadow-md flex flex-col items-center">
                    <div className="w-48 h-48 sm:w-52 sm:h-52 overflow-hidden rounded-xl bg-slate-900 flex items-center justify-center p-2 relative group">
                      <img
                        src={displayQrCodeUrl}
                        alt="Shopcart Verified Merchant UPI QR Code"
                        className="w-full h-full object-contain rounded-lg bg-white"
                      />
                    </div>
                    <div className="text-center mt-2.5 w-full space-y-1">
                      <span className="text-[10px] font-mono font-bold text-slate-700 uppercase tracking-wider block">
                        {merchantSettings.enable_dynamic_qr ? 'Dynamic Order-Linked QR' : 'Official Merchant QR'}
                      </span>
                      <button
                        type="button"
                        onClick={handleDownloadQr}
                        className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#0b5c37] hover:text-[#08482b] bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer w-full"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download QR Code</span>
                      </button>
                    </div>
                  </div>

                  {/* Merchant Credentials & Steps */}
                  <div className="space-y-4 text-xs flex-1 w-full">
                    {/* Merchant UPI ID & Phone */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Copy UPI ID */}
                      <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-2xs">
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase text-slate-400 block tracking-wider">
                            Merchant UPI ID
                          </span>
                          <span className="font-mono font-bold text-slate-900 text-xs truncate block">
                            {merchantSettings.merchant_upi_id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyUpiId}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#0b5c37] font-bold text-xs rounded-lg border border-emerald-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                          title="Copy UPI ID"
                        >
                          {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="text-[11px]">{copiedUpi ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      {/* Copy Merchant Number */}
                      <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-2xs">
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase text-slate-400 block tracking-wider">
                            Merchant UPI Phone
                          </span>
                          <span className="font-mono font-bold text-slate-900 text-xs truncate block">
                            {merchantSettings.merchant_upi_number || '+91 98765 43210'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyPhone}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                          title="Copy Phone Number"
                        >
                          {copiedPhone ? <Check className="w-3.5 h-3.5 text-slate-700" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="text-[11px]">{copiedPhone ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Step-by-Step Payment Instructions */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-slate-700 text-xs space-y-1.5 shadow-2xs">
                      <h5 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        <span>Payment Steps:</span>
                      </h5>
                      <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px] leading-relaxed">
                        <li>
                          Open any UPI application (<strong>Google Pay, PhonePe, Paytm, BHIM</strong>, etc.).
                        </li>
                        <li>
                          Scan the displayed QR code or send payment to <strong>{merchantSettings.merchant_upi_id}</strong>.
                        </li>
                        <li>
                          Confirm exact order amount of{' '}
                          <strong className="text-[#0b5c37] font-mono">{formatPrice(finalPayableTotal)}</strong>.
                        </li>
                        <li>
                          Take a screenshot of the completed payment receipt and upload it below.
                        </li>
                        <li>
                          Our Gemini AI automatically checks receipt details and auto-fills the 12-digit UTR.
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* AI SCREENSHOT FRAUD ANALYSIS & UPLOAD SECTION */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#0b5c37] border border-emerald-200 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Step 1: Upload Payment Screenshot (AI Fraud Analysis)
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Upload receipt (JPG, PNG, WEBP &lt; 10MB) for automated preliminary validation
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 self-start sm:self-auto">
                      Powered by Gemini 3.8 Flash
                    </span>
                  </div>

                  {/* Dropzone or Preview */}
                  {!screenshotPreview ? (
                    <div className="relative border-2 border-dashed border-slate-300 hover:border-[#0b5c37] rounded-2xl p-6 text-center transition-all bg-slate-50 hover:bg-emerald-50/30">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleScreenshotChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title="Upload payment receipt screenshot"
                      />
                      <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-[#0b5c37] shadow-2xs">
                          <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          Drag &amp; drop or click to upload payment screenshot
                        </p>
                        <p className="text-[11px] text-slate-500 max-w-sm">
                          Supports Google Pay, PhonePe, Paytm, BHIM success receipts. Files up to 10MB.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Uploaded Receipt Summary & Controls */}
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={screenshotPreview}
                            alt="Receipt Preview"
                            className="w-14 h-14 rounded-lg object-cover border border-slate-300 shrink-0 cursor-pointer hover:opacity-90"
                            onClick={() => setShowScreenshotModal(true)}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">Payment Receipt Screenshot</p>
                            <p className="text-[11px] text-slate-500">Image loaded ready for verification</p>
                            <button
                              type="button"
                              onClick={() => setShowScreenshotModal(true)}
                              className="text-[11px] text-[#0b5c37] hover:underline font-semibold flex items-center gap-1 mt-0.5 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Zoom Preview</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleRemoveScreenshot}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      {/* AI Screening In Progress Spinner */}
                      {isAnalyzingScreenshot && (
                        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-950 animate-pulse">
                          <RefreshCw className="w-5 h-5 text-[#0b5c37] animate-spin shrink-0" />
                          <div>
                            <p className="font-bold text-emerald-900">
                              Gemini 3.8 Flash AI Analyzing Receipt Authenticity...
                            </p>
                            <p className="text-[11px] text-emerald-800 mt-0.5">
                              Extracting 12-digit UTR, checking payment status, comparing paid amount (₹{finalPayableTotal.toFixed(2)}), and scanning for pixel tampering.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* AI Screening Result Card */}
                      {aiAnalysis && !isAnalyzingScreenshot && (
                        <div className={`p-4 rounded-xl border text-xs space-y-2.5 animate-in fade-in ${
                          aiAnalysis.recommended_action === 'DETAILS_MATCH'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                            : aiAnalysis.recommended_action === 'REVIEW_REQUIRED'
                            ? 'bg-amber-50 border-amber-200 text-amber-950'
                            : 'bg-rose-50 border-rose-200 text-rose-950'
                        }`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/10">
                            <div className="flex items-center gap-2">
                              {aiAnalysis.recommended_action === 'DETAILS_MATCH' ? (
                                <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                              ) : (
                                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                              )}
                              <span className="font-bold">
                                {aiAnalysis.recommended_action === 'DETAILS_MATCH'
                                  ? 'AI Screening: Receipt Verified Genuine'
                                  : aiAnalysis.recommended_action === 'REVIEW_REQUIRED'
                                  ? 'AI Screening: Manual Review Required'
                                  : 'AI Screening: Potential Risk / Discrepancy'}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-white/80 border border-black/10 self-start sm:self-auto">
                              Confidence Score: {aiAnalysis.confidence_score}%
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div className="bg-white/70 p-2 rounded-lg border border-black/5">
                              <span className="text-slate-500 block text-[10px] uppercase font-mono">App Detected</span>
                              <strong className="text-slate-900">{aiAnalysis.extracted_app || 'UPI App'}</strong>
                            </div>
                            <div className="bg-white/70 p-2 rounded-lg border border-black/5">
                              <span className="text-slate-500 block text-[10px] uppercase font-mono">Amount Status</span>
                              <strong className={aiAnalysis.amount_matches ? 'text-emerald-700' : 'text-rose-700'}>
                                {aiAnalysis.amount_matches ? 'Matches Order' : `₹${aiAnalysis.extracted_amount}`}
                              </strong>
                            </div>
                            <div className="bg-white/70 p-2 rounded-lg border border-black/5">
                              <span className="text-slate-500 block text-[10px] uppercase font-mono">Extracted UTR</span>
                              <strong className="font-mono text-slate-900 truncate block">
                                {aiAnalysis.extracted_utr || 'Manual Input'}
                              </strong>
                            </div>
                            <div className="bg-white/70 p-2 rounded-lg border border-black/5">
                              <span className="text-slate-500 block text-[10px] uppercase font-mono">Payee Match</span>
                              <strong className={aiAnalysis.merchant_matches ? 'text-emerald-700' : 'text-amber-700'}>
                                {aiAnalysis.merchant_matches ? 'Verified Merchant' : 'Unconfirmed'}
                              </strong>
                            </div>
                          </div>

                          {aiAnalysis.ai_summary && (
                            <p className="text-[11px] leading-relaxed opacity-90 pt-1">
                              <strong>Summary:</strong> {aiAnalysis.ai_summary}
                            </p>
                          )}
                        </div>
                      )}

                      {aiAnalysisError && !isAnalyzingScreenshot && (
                        <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-700">
                          {aiAnalysisError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 2: 12-Digit UTR Input Form */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Step 2: Enter 12-Digit UPI Reference Number (UTR) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.upiTransactionRef}
                      onChange={(e) => handleFieldChange('upiTransactionRef', e.target.value)}
                      onBlur={() => handleBlur('upiTransactionRef')}
                      placeholder="e.g. 431029482910"
                      className={`w-full px-3.5 py-2.5 text-xs bg-white border rounded-xl focus:outline-none focus:ring-2 font-mono ${
                        errors.upiTransactionRef && touched.upiTransactionRef
                          ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                      }`}
                    />
                    {errors.upiTransactionRef && touched.upiTransactionRef && (
                      <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {errors.upiTransactionRef}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">
                      Located in your UPI app receipt under &ldquo;UTR&rdquo;, &ldquo;UPI Ref ID&rdquo;, or &ldquo;Bank Reference No.&rdquo;.
                    </p>
                  </div>
                </div>

                {/* Fraud Prevention & Bank Ledger Verification Protocol Banner */}
                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/90 text-xs space-y-1 text-amber-950">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Fraud Prevention &amp; Bank Ledger Verification Protocol</span>
                  </div>
                  <p className="text-[11px] text-amber-900/90 leading-relaxed">
                    AI screening is for preliminary fraud prevention only. Your order will initially be set to <strong>Pending Admin Verification</strong>. An administrator must reconcile the 12-digit UTR against official merchant bank statements before marking the order as paid and dispatching items.
                  </p>
                </div>

                {/* Submit Payment Details Button */}
                <form onSubmit={handleUPIOrderSubmit}>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-[#0b5c37] hover:bg-[#08482b] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Submitting Payment &amp; Screenshot Audit...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-emerald-200" />
                        <span>Submit Payment for Verification ({formatPrice(finalPayableTotal)})</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
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
                <strong className="font-semibold text-slate-900 capitalize">
                  {completedOrder.paymentMethod.replace('_', ' ').toUpperCase()}
                </strong>
              </div>

              <div className="flex justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">UPI Reference (UTR):</span>
                <span className="font-mono font-bold text-slate-900 truncate max-w-[200px]">
                  {completedOrder.transactionReference}
                </span>
              </div>

              <div className="flex justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Amount Transferred:</span>
                <strong className="text-[#0b5c37] font-extrabold tabular-nums">
                  {formatPrice(completedOrder.totalAmount)}
                </strong>
              </div>

              {completedOrder.screenshotUrl && (
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Receipt Screenshot:</span>
                  <div className="flex items-center gap-2">
                    <img
                      src={completedOrder.screenshotUrl}
                      alt="Uploaded Receipt"
                      className="w-8 h-8 rounded object-cover border border-slate-300 cursor-pointer"
                      onClick={() => setShowScreenshotModal(true)}
                    />
                    <span className="text-[11px] text-emerald-700 font-bold">Uploaded</span>
                  </div>
                </div>
              )}

              {completedOrder.aiAnalysis && (
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-[11px] space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-700 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#0b5c37]" />
                      <span>AI Fraud Screening:</span>
                    </span>
                    <span className="text-[#0b5c37] font-mono">{completedOrder.aiAnalysis.confidence_score}% Confidence</span>
                  </div>
                  <p className="text-slate-600 leading-normal">
                    {completedOrder.aiAnalysis.ai_summary || 'Receipt verified authentic. Payment placed in pending admin verification.'}
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-1">
                <span className="text-slate-500">Order Database Record:</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved in Supabase &amp; Inventory Reserved</span>
                </span>
              </div>
            </div>

            {/* Explanatory Message */}
            <div className="text-xs text-slate-600 leading-relaxed bg-amber-50/80 p-3.5 rounded-xl border border-amber-200/90 space-y-1">
              <p className="font-bold text-amber-900">
                Payment Submitted — Awaiting Merchant Bank Ledger Verification
              </p>
              <p className="text-[11px] text-amber-800 leading-normal">
                Our store administrator will verify the 12-digit UTR (<span className="font-mono font-semibold">{completedOrder.transactionReference}</span>) against official merchant bank statements before confirming payment and dispatching your items.
              </p>
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

      {/* ZOOM MODAL FOR SCREENSHOT */}
      {showScreenshotModal && (screenshotPreview || completedOrder?.screenshotUrl) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 space-y-3 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileImage className="w-4 h-4 text-[#0b5c37]" />
                <span>Payment Receipt Screenshot Preview</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowScreenshotModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1"
              >
                ✕ Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl bg-slate-900 flex items-center justify-center p-2">
              <img
                src={screenshotPreview || completedOrder?.screenshotUrl || ''}
                alt="Receipt Full Preview"
                className="max-h-[65vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
