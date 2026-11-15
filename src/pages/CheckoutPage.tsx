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
  MapPin,
  Plus,
  Bookmark,
} from 'lucide-react';
import { PageView, CartItem, AIScreenshotAnalysis, MerchantPaymentSettings, SavedAddress } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { ProductImage } from '../components/common/ProductImage';
import { formatPrice } from '../utils/format';
import { createOrder } from '../services/orderService';
import { addCustomerSavedAddress } from '../services/profileService';

interface CheckoutPageProps {
  onNavigate: (page: PageView, params?: { productId?: string; category?: string; query?: string }) => void;
}

export type PaymentMethodType =
  | 'upi'
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
  flatHouseNumber: string; // Flat / House Number
  buildingApartment: string; // Building / Apartment Name
  houseBuilding: string; // Composed House / Flat / Building Name for backward compatibility
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
  flatHouseNumber?: string;
  buildingApartment?: string;
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
  'India',
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Germany',
  'France',
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
    hasUnconfiguredGst,
    unconfiguredGstProducts,
    total,
    coupon,
    applyCoupon,
    removeCoupon,
    clearCart,
  } = useCart();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();

  // Generate unique order reference upfront
  const [currentOrderNumber] = useState(
    () => `SC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`
  );

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

  // Guard so auth refreshes never overwrite actively edited address inputs
  const hydratedUserIdRef = React.useRef<string | null>(null);

  // Form Fields State
  const [selectedAddressId, setSelectedAddressId] = useState<string>('default');
  const [saveAddressToProfile, setSaveAddressToProfile] = useState<boolean>(true);
  const [formData, setFormData] = useState<CheckoutFormState>(() => {
    const initialFlat =
      user?.shippingAddress?.flatHouseNumber ||
      user?.shippingAddress?.houseBuilding ||
      '';
    const initialBuilding =
      user?.shippingAddress?.buildingApartment ||
      user?.shippingAddress?.apartment ||
      '';
    const initialComposed = [initialFlat, initialBuilding].filter(Boolean).join(', ');
    return {
      fullName: user?.name || '',
      phone: user?.phone || '',
      email: user?.email || '',
      flatHouseNumber: initialFlat,
      buildingApartment: initialBuilding,
      houseBuilding: initialComposed,
      streetArea: user?.shippingAddress?.streetArea || '',
      city: user?.shippingAddress?.city || user?.address?.city || '',
      state: user?.shippingAddress?.state || user?.address?.state || '',
      pinCode: user?.shippingAddress?.pinCode || user?.address?.zipCode || '',
      landmark: user?.shippingAddress?.landmark || '',
      deliveryInstructions: user?.shippingAddress?.deliveryInstructions || '',
      country: user?.shippingAddress?.country || 'India',
      address: user?.address?.street || '',
      apartment: initialBuilding,
      postalCode: user?.shippingAddress?.pinCode || user?.address?.zipCode || '',
      deliveryNotes: '',
      billingSameAsDelivery: true,
      paymentMethod: 'upi',
      upiTransactionRef: '',
    };
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

  const computedShippingFee = shippingSpeed === 'express' ? shippingFee + 99 : shippingFee;
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
            showToast(`Auto-recognized 12-character UTR: ${data.analysis.extracted_utr}`, 'success');
          } else {
            showToast('Receipt uploaded. Please verify or enter your 12-character alphanumeric UTR.', 'info');
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

  // Synchronize user profile & saved addresses once per signed-in user session
  React.useEffect(() => {
    if (!user) {
      hydratedUserIdRef.current = null;
      return;
    }
    if (hydratedUserIdRef.current === user.id) {
      return;
    }
    hydratedUserIdRef.current = user.id;

    const defaultSaved =
      user.savedAddresses?.find((a) => a.isDefault) ||
      user.savedAddresses?.[0] ||
      user.shippingAddress;

    if (defaultSaved) {
      setSelectedAddressId(defaultSaved.id || 'default');
      const savedFlat = defaultSaved.flatHouseNumber || defaultSaved.houseBuilding || '';
      const savedBuilding = defaultSaved.buildingApartment || defaultSaved.apartment || '';
      const composedHouse = [savedFlat, savedBuilding].filter(Boolean).join(', ');
      setFormData((prev) => ({
        ...prev,
        fullName: prev.fullName || defaultSaved.fullName || user.name || '',
        email: prev.email || user.email || '',
        phone: prev.phone || defaultSaved.phone || user.phone || '',
        flatHouseNumber: prev.flatHouseNumber || savedFlat,
        buildingApartment: prev.buildingApartment || savedBuilding,
        houseBuilding: prev.houseBuilding || composedHouse,
        streetArea: prev.streetArea || defaultSaved.streetArea || defaultSaved.street || '',
        landmark: prev.landmark || defaultSaved.landmark || '',
        city: prev.city || defaultSaved.city || user.address?.city || '',
        state: prev.state || defaultSaved.state || user.address?.state || '',
        pinCode: prev.pinCode || defaultSaved.pinCode || defaultSaved.postalCode || user.address?.zipCode || '',
        postalCode: prev.postalCode || defaultSaved.pinCode || defaultSaved.postalCode || user.address?.zipCode || '',
        deliveryInstructions: prev.deliveryInstructions || defaultSaved.deliveryInstructions || '',
        country: defaultSaved.country || 'India',
        address: prev.address || [composedHouse, defaultSaved.streetArea || ''].filter(Boolean).join(', '),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        fullName: prev.fullName || user.name || '',
        email: prev.email || user.email || '',
        phone: prev.phone || user.phone || '',
        address: prev.address || user.address?.street || '',
        city: prev.city || user.address?.city || '',
        state: prev.state || user.address?.state || '',
        pinCode: prev.pinCode || user.address?.zipCode || '',
        postalCode: prev.postalCode || user.address?.zipCode || '',
        country: 'India',
      }));
    }
  }, [user]);

  const handleSelectSavedAddress = (addr: SavedAddress) => {
    setSelectedAddressId(addr.id);
    const savedFlat = addr.flatHouseNumber || addr.houseBuilding || '';
    const savedBuilding = addr.buildingApartment || addr.apartment || '';
    const composedHouse = [savedFlat, savedBuilding].filter(Boolean).join(', ');
    const pin = addr.pinCode || addr.postalCode || '';
    setFormData((prev) => ({
      ...prev,
      fullName: addr.fullName || prev.fullName,
      phone: addr.phone || prev.phone,
      flatHouseNumber: savedFlat,
      buildingApartment: savedBuilding,
      houseBuilding: composedHouse,
      apartment: savedBuilding,
      streetArea: addr.streetArea || addr.street || '',
      city: addr.city || prev.city,
      state: addr.state || prev.state,
      pinCode: pin,
      postalCode: pin,
      landmark: addr.landmark || '',
      deliveryInstructions: addr.deliveryInstructions || prev.deliveryInstructions,
      country: addr.country || 'India',
      address: [composedHouse, addr.streetArea || addr.street || ''].filter(Boolean).join(', '),
    }));
    setErrors({});
  };

  const handleSelectNewAddress = () => {
    setSelectedAddressId('new');
    setFormData((prev) => ({
      ...prev,
      flatHouseNumber: '',
      buildingApartment: '',
      houseBuilding: '',
      apartment: '',
      streetArea: '',
      landmark: '',
      pinCode: '',
      postalCode: '',
      city: '',
      state: '',
      address: '',
    }));
    setErrors({});
  };

  // Validation function for delivery details and 12-digit UPI UTR
  const validateForm = (data: CheckoutFormState): CheckoutFormErrors => {
    const errs: CheckoutFormErrors = {};

    if (!data.fullName.trim()) {
      errs.fullName = t.checkout.errNameRequired;
    }

    // 10-digit Indian Mobile Number validation
    const cleanPhone = data.phone.replace(/[\s\-\+\(\)]/g, '').replace(/^91/, '');
    if (!data.phone.trim()) {
      errs.phone = t.checkout.errPhoneRequired;
    } else if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      errs.phone = t.checkout.errPhoneInvalid;
    }

    if (!data.email.trim()) {
      errs.email = t.checkout.errEmailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      errs.email = t.checkout.errEmailInvalid;
    }

    if (!data.flatHouseNumber.trim()) {
      errs.flatHouseNumber = t.checkout.errFlatHouseRequired;
    }

    if (!data.streetArea.trim()) {
      errs.streetArea = t.checkout.errStreetRequired;
    }

    if (!data.city.trim()) {
      errs.city = t.checkout.errCityRequired;
    }

    if (!data.state.trim()) {
      errs.state = t.checkout.errStateRequired;
    }

    // 6-digit Indian PIN Code validation
    const cleanPin = (data.pinCode || '').trim();
    if (!cleanPin) {
      errs.pinCode = t.checkout.errPinRequired;
    } else if (!/^\d{6}$/.test(cleanPin)) {
      errs.pinCode = t.checkout.errPinInvalid;
    }

    // 12-character alphanumeric UPI UTR Reference validation
    const cleanUtr = (data.upiTransactionRef || '').replace(/[\s-]/g, '').trim();
    if (!cleanUtr) {
      errs.upiTransactionRef = t.checkout.errUtrRequired;
    } else if (cleanUtr.length !== 12 || !/^[0-9A-Za-z]{12}$/.test(cleanUtr)) {
      errs.upiTransactionRef = t.checkout.errUtrInvalid;
    }

    return errs;
  };

  // Safe functional batch updater (prevents stale closure drops on multi-field changes)
  const updateFields = (
    patch: Partial<CheckoutFormState>,
    fieldsToCheck?: (keyof CheckoutFormState)[]
  ) => {
    setFormData((prev) => {
      const next: CheckoutFormState = { ...prev, ...patch };
      const composedHouse = [next.flatHouseNumber.trim(), next.buildingApartment.trim()]
        .filter(Boolean)
        .join(', ');
      next.houseBuilding = composedHouse;
      next.apartment = next.buildingApartment;
      next.address = [composedHouse, next.streetArea.trim()].filter(Boolean).join(', ');
      if ('pinCode' in patch) {
        next.postalCode = next.pinCode;
      }

      const checkList = fieldsToCheck || (Object.keys(patch) as (keyof CheckoutFormState)[]);
      if (checkList.some((f) => touched[f])) {
        setErrors(validateForm(next));
      }
      return next;
    });
  };

  const handleFieldChange = (field: keyof CheckoutFormState, value: any) => {
    updateFields({ [field]: value } as Partial<CheckoutFormState>, [field]);
  };

  const handleBlur = (field: keyof CheckoutFormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validateForm(formData));
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

  // SINGLE SHOPCART UPI SUBMISSION HANDLER
  const handleUPIOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const allTouched: Record<string, boolean> = {
      fullName: true,
      phone: true,
      email: true,
      flatHouseNumber: true,
      buildingApartment: true,
      streetArea: true,
      city: true,
      state: true,
      pinCode: true,
      upiTransactionRef: true,
    };
    setTouched(allTouched);

    const validationErrors = validateForm(formData);
    setErrors(validationErrors);

    if (hasUnconfiguredGst) {
      showToast(`Checkout unavailable: GST slab is not configured for ${unconfiguredGstProducts.join(', ')}.`, 'error');
      return;
    }

    if (Object.keys(validationErrors).length > 0) {
      showToast('Please complete all required delivery fields and enter a valid 12-character alphanumeric UPI UTR.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanRef = (formData.upiTransactionRef || '').replace(/[\s-]/g, '').trim().toUpperCase();
      const cleanPhone = formData.phone.replace(/[\s\-\+\(\)]/g, '').replace(/^91/, '');
      const cleanFlat = formData.flatHouseNumber.trim();
      const cleanBuilding = formData.buildingApartment.trim();
      const composedHouse = [cleanFlat, cleanBuilding].filter(Boolean).join(', ');
      const cleanStreet = formData.streetArea.trim();

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
        shippingSpeed,
        shippingAddress: {
          fullName: formData.fullName.trim(),
          phone: cleanPhone,
          email: formData.email.trim(),
          flatHouseNumber: cleanFlat,
          buildingApartment: cleanBuilding,
          houseBuilding: composedHouse,
          streetArea: cleanStreet,
          street: [composedHouse, cleanStreet].filter(Boolean).join(', '),
          apartment: cleanBuilding || composedHouse,
          city: formData.city.trim(),
          state: formData.state.trim(),
          postalCode: formData.pinCode.trim(),
          pinCode: formData.pinCode.trim(),
          landmark: (formData.landmark || '').trim(),
          deliveryInstructions: (formData.deliveryInstructions || '').trim(),
          country: formData.country || 'India',
        },
        customerNotes: (formData.deliveryInstructions || '').trim() || undefined,
        paymentMethod: 'upi',
        paymentStatus: 'pending_admin_verification',
        transactionReference: cleanRef,
        screenshotUrl: screenshotPreview || undefined,
      });

      if (!orderRes.success) {
        throw new Error(orderRes.errorMessage || 'Failed to submit order. Please verify your details and retry.');
      }

      setCompletedOrder({
        orderNumber: currentOrderNumber,
        orderId: orderRes.orderId,
        customerName: formData.fullName.trim(),
        customerEmail: formData.email.trim(),
        paymentMethod: 'upi',
        paymentStatus: 'pending_admin_verification',
        transactionReference: cleanRef,
        totalAmount: orderRes.pricing?.totalAmount ?? finalPayableTotal,
        items: [...cart],
        isStoredInSupabase: orderRes.isStoredInSupabase,
        verifiedAt: new Date().toLocaleTimeString(),
        screenshotUrl: orderRes.screenshotUrl || screenshotPreview || null,
        aiAnalysis: orderRes.aiAnalysis || null,
      });

      // Save address to customer profile if requested
      if (user && saveAddressToProfile && !user.id.startsWith('usr-demo')) {
        addCustomerSavedAddress(user.id, {
          isDefault: selectedAddressId === 'default' || (user.savedAddresses?.length || 0) === 0,
          label: 'Home',
          fullName: formData.fullName.trim(),
          phone: cleanPhone,
          email: formData.email.trim(),
          flatHouseNumber: cleanFlat,
          buildingApartment: cleanBuilding,
          houseBuilding: composedHouse,
          streetArea: cleanStreet,
          landmark: (formData.landmark || '').trim(),
          city: formData.city.trim(),
          district: '',
          state: formData.state.trim(),
          pinCode: formData.pinCode.trim(),
          country: formData.country || 'India',
          deliveryInstructions: (formData.deliveryInstructions || '').trim(),
        }).catch((e) => console.warn('Non-blocking address save to profile error:', e));
      }

      // Clear cart only after confirmed order creation
      clearCart();
      showToast('Order placed successfully! Details submitted for administrative ledger verification.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error submitting order', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sample auto-fill helper with Indian delivery address
  const handleLoadDemoProfile = () => {
    setFormData({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      email: 'rahul.sharma@example.in',
      flatHouseNumber: 'Flat 402',
      buildingApartment: 'Lotus Tower, 4th Floor',
      houseBuilding: 'Flat 402, Lotus Tower, 4th Floor',
      streetArea: '100 Feet Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560038',
      landmark: 'Near Indiranagar Metro Station',
      deliveryInstructions: 'Please call on arrival; leave with building security if unavailable.',
      country: 'India',
      address: 'Flat 402, Lotus Tower, 4th Floor, 100 Feet Road, Indiranagar',
      apartment: 'Lotus Tower, 4th Floor',
      postalCode: '560038',
      deliveryNotes: 'Please call on arrival.',
      billingSameAsDelivery: true,
      paymentMethod: 'upi',
      upiTransactionRef: '431029482910',
    });
    setErrors({});
    showToast('Applied sample Indian delivery details & 12-digit sample UTR', 'info');
  };

  // Empty cart fallback
  if (cart.length === 0 && !completedOrder) {
    return (
      <div className="w-full sm:max-w-2xl sm:mx-auto px-2.5 sm:px-4 py-8 sm:py-16 text-center space-y-5">
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
    <div className="bg-slate-50/60 py-3 sm:py-8 w-full">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 space-y-4 sm:space-y-8">
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
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
              {t.checkout.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {t.checkout.upiPaymentSubtitle}
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
              <span>{t.checkout.backToCart}</span>
            </button>
          </div>
        </div>

        {/* Two-Column Checkout Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-start">
          {/* Left Column: Sections 1, 2, 8 (Customer, Shipping & Payment) */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6">
            {/* SECTION 1: Customer Information */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-7 shadow-xs space-y-4">
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
                  <label htmlFor="checkout-fullname" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.fullName} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-fullname"
                    type="text"
                    name="fullName"
                    autoComplete="name"
                    value={formData.fullName}
                    onChange={(e) => handleFieldChange('fullName', e.target.value)}
                    onBlur={() => handleBlur('fullName')}
                    placeholder="e.g. Aarav Sharma"
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                      errors.fullName && touched.fullName
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.fullName && touched.fullName && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="checkout-email" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.emailAddress} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    onBlur={() => handleBlur('email')}
                    placeholder="aarav@example.in"
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                      errors.email && touched.email
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.email && touched.email && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="checkout-phone" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.mobileNumber} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    onBlur={() => handleBlur('phone')}
                    placeholder="9876543210"
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                      errors.phone && touched.phone
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.phone && touched.phone && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.phone}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* SECTION 2: Delivery Address */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-7 shadow-xs space-y-4 sm:space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                    2
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Delivery Address</h2>
                    <p className="text-xs text-slate-500">Destination address for package shipping and dispatch</p>
                  </div>
                </div>

                {user && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 self-start sm:self-auto">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Auto-Saved Profile Sync Active</span>
                  </span>
                )}
              </div>

              {/* Saved Addresses Selector (When logged-in user has saved addresses) */}
              {user?.savedAddresses && user.savedAddresses.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Deliver to a Saved Address:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {user.savedAddresses.map((addr) => {
                      const isSelected = selectedAddressId === addr.id;
                      return (
                        <div
                          key={addr.id}
                          onClick={() => handleSelectSavedAddress(addr)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'border-[#0b5c37] bg-emerald-50/60 ring-2 ring-[#0b5c37]/20 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#0b5c37]" />
                              <span>{addr.label || 'Home'}</span>
                              {addr.isDefault && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                                  Default
                                </span>
                              )}
                            </span>
                            <input
                              type="radio"
                              name="savedAddressSelect"
                              checked={isSelected}
                              onChange={() => handleSelectSavedAddress(addr)}
                              className="accent-[#0b5c37] cursor-pointer"
                            />
                          </div>
                          <p className="text-slate-700 font-medium truncate">
                            {addr.fullName || user.name} · {addr.phone || user.phone}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                            {[addr.flatHouseNumber, addr.buildingApartment].filter(Boolean).join(', ') || addr.houseBuilding
                              ? `${[addr.flatHouseNumber, addr.buildingApartment].filter(Boolean).join(', ') || addr.houseBuilding}, `
                              : ''}
                            {addr.streetArea ? `${addr.streetArea}, ` : ''}
                            {addr.city}, {addr.state} - {addr.pinCode}
                          </p>
                        </div>
                      );
                    })}

                    {/* New Address Card */}
                    <div
                      onClick={handleSelectNewAddress}
                      className={`p-3 rounded-xl border-2 border-dashed text-xs cursor-pointer transition-all flex flex-col items-center justify-center min-h-[90px] text-center ${
                        selectedAddressId === 'new'
                          ? 'border-[#0b5c37] bg-emerald-50/40 text-[#0b5c37]'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <Plus className="w-4 h-4 mb-1" />
                      <span className="font-bold">Deliver to a Different Address</span>
                      <span className="text-[10px] text-slate-400">Enter new location details</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Delivery Address Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="checkout-flat-house" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.flatHouseNumber} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-flat-house"
                    type="text"
                    name="flatHouseNumber"
                    autoComplete="address-line1"
                    value={formData.flatHouseNumber}
                    onChange={(e) => handleFieldChange('flatHouseNumber', e.target.value)}
                    onBlur={() => handleBlur('flatHouseNumber')}
                    placeholder={t.checkout.flatHousePlaceholder}
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                      errors.flatHouseNumber && touched.flatHouseNumber
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.flatHouseNumber && touched.flatHouseNumber && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.flatHouseNumber}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="checkout-building" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.buildingApartment}
                  </label>
                  <input
                    id="checkout-building"
                    type="text"
                    name="buildingApartment"
                    autoComplete="address-line2"
                    value={formData.buildingApartment}
                    onChange={(e) => handleFieldChange('buildingApartment', e.target.value)}
                    onBlur={() => handleBlur('buildingApartment')}
                    placeholder={t.checkout.buildingPlaceholder}
                    className="w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-[#0b5c37]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="checkout-street" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.streetRoad} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-street"
                    type="text"
                    name="streetArea"
                    autoComplete="street-address"
                    value={formData.streetArea}
                    onChange={(e) => handleFieldChange('streetArea', e.target.value)}
                    onBlur={() => handleBlur('streetArea')}
                    placeholder={t.checkout.streetPlaceholder}
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                      errors.streetArea && touched.streetArea
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.streetArea && touched.streetArea && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.streetArea}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="checkout-landmark" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.landmark}
                  </label>
                  <input
                    id="checkout-landmark"
                    type="text"
                    name="landmark"
                    value={formData.landmark || ''}
                    onChange={(e) => handleFieldChange('landmark', e.target.value)}
                    placeholder={t.checkout.landmarkPlaceholder}
                    className="w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-[#0b5c37]"
                  />
                </div>

                <div>
                  <label htmlFor="checkout-city" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.townCity} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-city"
                    type="text"
                    name="city"
                    autoComplete="address-level2"
                    value={formData.city}
                    onChange={(e) => handleFieldChange('city', e.target.value)}
                    onBlur={() => handleBlur('city')}
                    placeholder={t.checkout.cityPlaceholder}
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                      errors.city && touched.city
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.city && touched.city && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.city}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="checkout-state" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.stateLabel} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-state"
                    type="text"
                    name="state"
                    autoComplete="address-level1"
                    value={formData.state}
                    onChange={(e) => handleFieldChange('state', e.target.value)}
                    onBlur={() => handleBlur('state')}
                    placeholder={t.checkout.statePlaceholder}
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 ${
                      errors.state && touched.state
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.state && touched.state && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.state}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="checkout-pincode" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.pinCode} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-pincode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="postal-code"
                    maxLength={6}
                    name="pinCode"
                    value={formData.pinCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      updateFields({ pinCode: val, postalCode: val }, ['pinCode']);
                    }}
                    onBlur={() => handleBlur('pinCode')}
                    placeholder={t.checkout.pinCodePlaceholder}
                    className={`w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-lg font-mono tracking-wider transition-colors focus:outline-none focus:ring-2 ${
                      errors.pinCode && touched.pinCode
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-emerald-200 focus:border-[#0b5c37]'
                    }`}
                  />
                  {errors.pinCode && touched.pinCode && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {errors.pinCode}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="checkout-country" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.countryLabel}
                  </label>
                  <select
                    id="checkout-country"
                    name="country"
                    value={formData.country}
                    onChange={(e) => handleFieldChange('country', e.target.value)}
                    className="w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-[#0b5c37]"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="checkout-notes" className="block text-xs font-bold text-slate-800 mb-1.5">
                    {t.checkout.deliveryInstructions}
                  </label>
                  <input
                    id="checkout-notes"
                    type="text"
                    name="deliveryInstructions"
                    value={formData.deliveryInstructions || ''}
                    onChange={(e) => handleFieldChange('deliveryInstructions', e.target.value)}
                    placeholder="e.g. Please ring doorbell twice; leave with security if unavailable"
                    className="w-full px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-[#0b5c37]"
                  />
                </div>

                {/* Save to Profile Checkbox */}
                {user && (
                  <div className="sm:col-span-2 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={saveAddressToProfile}
                        onChange={(e) => setSaveAddressToProfile(e.target.checked)}
                        className="w-4 h-4 rounded text-[#0b5c37] accent-[#0b5c37] cursor-pointer"
                      />
                      <span className="font-medium flex items-center gap-1.5">
                        <Bookmark className="w-3.5 h-3.5 text-[#0b5c37]" />
                        <span>{t.checkout.saveAddressToProfile}</span>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 3 / PAYMENT: SINGLE SHOPCART UPI PAYMENT FLOW */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-7 shadow-xs space-y-4 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0b5c37] text-white font-black text-xs flex items-center justify-center">
                    3
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{t.checkout.upiPaymentTitle}</h2>
                    <p className="text-xs text-slate-500">{t.checkout.upiPaymentSubtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified Merchant UPI</span>
                  </span>
                </div>
              </div>

              {/* Single Unified ShopCart UPI Payment Console */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-6">
                {/* Console Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#0b5c37] flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        {t.checkout.upiSingleGatewayHeading}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {t.checkout.upiSingleGatewayDesc}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t.checkout.payableTotal}:</span>
                    <span className="text-base font-black text-[#0b5c37] font-mono tabular-nums">
                      {formatPrice(finalPayableTotal)}
                    </span>
                  </div>
                </div>

                {/* Supported Apps Note */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <Smartphone className="w-3.5 h-3.5 text-[#0b5c37] shrink-0" />
                  <span className="text-slate-500 mr-1">Works with:</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200">Google Pay</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200">PhonePe</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200">Paytm</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200">BHIM UPI</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200">Any Bank UPI App</span>
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
                      Powered by Gemini 4 Hydrogen
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
                        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-950">
                          <RefreshCw className="w-5 h-5 text-[#0b5c37] animate-spin shrink-0" />
                          <div>
                            <p className="font-bold text-emerald-900">
                              Gemini 4 Hydrogen AI Analyzing Receipt Authenticity...
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
                                  ? 'AI Advisory: Receipt Details Match (Pending Admin Verification)'
                                  : aiAnalysis.recommended_action === 'REVIEW_REQUIRED'
                                  ? 'AI Advisory: Manual Review Recommended'
                                  : 'AI Advisory: Possible Discrepancy — Admin Will Verify'}
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
                    <span>Bank Ledger Verification Protocol</span>
                  </div>
                  <p className="text-[11px] text-amber-900/90 leading-relaxed">
                    {t.checkout.aiAdvisoryNotice}
                  </p>
                </div>

                {hasUnconfiguredGst && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>GST Rate Configuration Required</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Commercial checkout cannot be completed until an administrator configures the GST slab for: <strong>{unconfiguredGstProducts.join(', ')}</strong>.
                    </p>
                  </div>
                )}

                {/* Submit Payment Details Button */}
                <form onSubmit={handleUPIOrderSubmit}>
                  <button
                    type="submit"
                    disabled={isSubmitting || hasUnconfiguredGst}
                    className="w-full py-3.5 bg-[#0b5c37] hover:bg-[#08482b] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{t.checkout.processingOrder}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-emerald-200" />
                        <span>{t.checkout.placeOrder} ({formatPrice(finalPayableTotal)})</span>
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
            <section className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-6 shadow-xs space-y-4">
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
            <section className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-6 shadow-xs space-y-4">
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
                    {computedShippingFee === 0 ? <span className="text-emerald-600 font-bold">FREE</span> : formatPrice(computedShippingFee)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span>Estimated GST / Tax</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {hasUnconfiguredGst ? (
                      <span className="text-rose-700 font-bold">GST Config Required</span>
                    ) : (
                      formatPrice(taxAmount)
                    )}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <div>
                    <span className="text-sm font-extrabold text-slate-900 block">Grand Total</span>
                    <span className="text-[11px] text-slate-400">Currency: INR (₹)</span>
                  </div>
                  <span className="text-2xl font-black text-[#0b5c37] tabular-nums">
                    {formatPrice(finalPayableTotal)}
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
