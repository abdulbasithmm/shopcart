import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Package,
  MapPin,
  Lock,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Save,
  ShoppingBag,
  Clock,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Truck,
  Copy,
  Check,
  RotateCcw,
  Eye,
  Heart,
  Trash2,
  Plus,
  Edit2,
  X,
  EyeOff,
  Ban,
  AlertTriangle,
  Building,
  Home,
  Briefcase,
} from 'lucide-react';
import { PageView, Order, OrderItem, SavedAddress } from '../types';
import { PRODUCTS } from '../data/mockData';
import { formatPrice } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import {
  fetchUserOrders,
  requestCustomerCancellation,
  hideCustomerOrder,
} from '../services/orderService';
import {
  addCustomerSavedAddress,
  updateCustomerSavedAddress,
  deleteCustomerSavedAddress,
} from '../services/profileService';
import { OrderTrackingModal } from '../components/orders/OrderTrackingModal';
import { ProductImage } from '../components/common/ProductImage';
import {
  getStatusMeta,
  getAmazonStepIndex,
  formatEstimatedDelivery,
  AMAZON_TRACKING_MILESTONES,
} from '../utils/orderTracking';

interface AccountPageProps {
  onNavigate: (page: PageView, params?: { productId?: string; category?: string; query?: string; tab?: string }) => void;
  initialTab?: 'profile' | 'orders' | 'wishlist' | 'security';
}

export const AccountPage: React.FC<AccountPageProps> = ({ onNavigate, initialTab }) => {
  const {
    user,
    isAuthenticated,
    isAdmin,
    logout,
    updateProfile,
    resendVerificationEmail,
    resetPassword,
    refreshProfile,
    isSupabaseBackend,
  } = useAuth();
  const { showToast } = useToast();
  const { addToCart, wishlist, toggleWishlist } = useCart();

  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'wishlist' | 'security'>(
    initialTab || 'profile'
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Profile Form state
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [street, setStreet] = useState(user?.address?.street || '');
  const [city, setCity] = useState(user?.address?.city || '');
  const [state, setState] = useState(user?.address?.state || '');
  const [zipCode, setZipCode] = useState(user?.address?.zipCode || '');
  const [country, setCountry] = useState(user?.address?.country || 'United States');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security Form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [trackingModalOrder, setTrackingModalOrder] = useState<Order | null>(null);
  const [orderFilterTab, setOrderFilterTab] = useState<'all' | 'in_progress' | 'delivered' | 'cancelled'>('all');
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  // Cancellation Modal state
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('Ordered by mistake');
  const [cancellationDetails, setCustomCancellationNotes] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);

  // Hide Order Modal state
  const [hidingOrder, setHidingOrder] = useState<Order | null>(null);
  const [isSubmittingHide, setIsSubmittingHide] = useState<boolean>(false);

  // Saved Addresses state
  const [addressModalOpen, setAddressModalOpen] = useState<boolean>(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<SavedAddress, 'id'>>({
    label: 'Home',
    fullName: '',
    phone: '',
    email: '',
    country: 'India',
    houseBuilding: '',
    streetArea: '',
    landmark: '',
    city: '',
    district: '',
    state: '',
    pinCode: '',
    isDefault: false,
    deliveryInstructions: '',
  });
  const [isSavingAddress, setIsSavingAddress] = useState<boolean>(false);

  const handleCopyOrderId = (idStr: string) => {
    navigator.clipboard.writeText(idStr);
    setCopiedOrderId(idStr);
    setTimeout(() => setCopiedOrderId(null), 2000);
    showToast(`Order ID #${idStr} copied!`, 'info');
  };

  const handleReorderItem = (item: OrderItem) => {
    const prod = item.product || PRODUCTS.find((p) => p.id === item.product_id || p.name === item.product_name);
    if (prod) {
      addToCart(prod, item.quantity, item.selected_color || undefined, item.selected_size || undefined);
      showToast(`Added ${item.product_name} to cart!`, 'success');
    } else {
      showToast(`Added ${item.product_name} to cart!`, 'success');
    }
  };

  const handleOpenAddAddress = () => {
    setEditingAddress(null);
    setAddressForm({
      label: 'Home',
      fullName: user?.name || '',
      phone: user?.phone || '',
      email: user?.email || '',
      country: 'India',
      houseBuilding: '',
      streetArea: '',
      landmark: '',
      city: user?.address?.city || 'Bengaluru',
      district: '',
      state: user?.address?.state || 'Karnataka',
      pinCode: user?.address?.zipCode || '',
      isDefault: (user?.savedAddresses?.length || 0) === 0,
      deliveryInstructions: '',
    });
    setAddressModalOpen(true);
  };

  const handleOpenEditAddress = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setAddressForm({
      label: addr.label || 'Home',
      fullName: addr.fullName || '',
      phone: addr.phone || '',
      email: addr.email || user?.email || '',
      country: addr.country || 'India',
      houseBuilding: addr.houseBuilding || addr.apartment || '',
      streetArea: addr.streetArea || addr.street || '',
      landmark: addr.landmark || '',
      city: addr.city || '',
      district: addr.district || '',
      state: addr.state || '',
      pinCode: addr.pinCode || addr.postalCode || '',
      isDefault: !!addr.isDefault,
      deliveryInstructions: addr.deliveryInstructions || '',
    });
    setAddressModalOpen(true);
  };

  const handleSaveAddressForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (
      !addressForm.fullName.trim() ||
      !addressForm.phone.trim() ||
      !addressForm.houseBuilding.trim() ||
      !addressForm.streetArea.trim() ||
      !addressForm.city.trim() ||
      !addressForm.pinCode.trim()
    ) {
      showToast('Please complete all required address fields.', 'error');
      return;
    }

    setIsSavingAddress(true);
    try {
      if (editingAddress) {
        const res = await updateCustomerSavedAddress(user.id, {
          ...addressForm,
          id: editingAddress.id,
        });
        if (res.success) {
          showToast('Delivery address updated successfully!', 'success');
          await refreshProfile();
          setAddressModalOpen(false);
        } else {
          showToast(res.error || 'Failed to update address', 'error');
        }
      } else {
        const res = await addCustomerSavedAddress(user.id, addressForm);
        if (res.success) {
          showToast('New delivery address added successfully!', 'success');
          await refreshProfile();
          setAddressModalOpen(false);
        } else {
          showToast(res.error || 'Failed to add address', 'error');
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving address', 'error');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this saved address?')) return;

    try {
      const res = await deleteCustomerSavedAddress(user.id, addressId);
      if (res.success) {
        showToast('Address deleted successfully', 'info');
        await refreshProfile();
      } else {
        showToast(res.error || 'Failed to delete address', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error deleting address', 'error');
    }
  };

  const handleSetDefaultAddress = async (addr: SavedAddress) => {
    if (!user) return;
    try {
      const res = await updateCustomerSavedAddress(user.id, {
        ...addr,
        isDefault: true,
      });
      if (res.success) {
        showToast(`"${addr.label || 'Address'}" set as default delivery address`, 'success');
        await refreshProfile();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to set default address', 'error');
    }
  };

  const handleSubmitCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder) return;
    const combinedReason = `${cancellationReason}${
      cancellationDetails.trim() ? `: ${cancellationDetails.trim()}` : ''
    }`;

    setIsSubmittingCancel(true);
    try {
      const res = await requestCustomerCancellation(cancellingOrder.id, combinedReason);
      if (res.success) {
        showToast(`Order #${cancellingOrder.order_number} cancelled successfully.`, 'success');
        setOrders((prev) =>
          prev.map((o) =>
            o.id === cancellingOrder.id
              ? {
                  ...o,
                  status: 'cancelled',
                  cancellation_reason: combinedReason,
                  cancelled_at: new Date().toISOString(),
                  cancelled_by: 'customer',
                }
              : o
          )
        );
        setCancellingOrder(null);
        setCustomCancellationNotes('');
      } else {
        showToast(res.message || 'Unable to cancel order. Please contact support.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Cancellation request failed', 'error');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleSubmitHideOrder = async () => {
    if (!hidingOrder) return;
    setIsSubmittingHide(true);
    try {
      const res = await hideCustomerOrder(hidingOrder.id);
      if (res.success) {
        showToast(`Order #${hidingOrder.order_number} hidden from your history.`, 'info');
        setOrders((prev) => prev.filter((o) => o.id !== hidingOrder.id));
        setHidingOrder(null);
      } else {
        showToast(res.message || 'Failed to hide order', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to hide order', 'error');
    } finally {
      setIsSubmittingHide(false);
    }
  };

  // Verification email resend
  const [isResending, setIsResending] = useState(false);

  // Sync profile form when user object updates
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setStreet(user.address?.street || '');
      setCity(user.address?.city || '');
      setState(user.address?.state || '');
      setZipCode(user.address?.zipCode || '');
      setCountry(user.address?.country || 'United States');
    }
  }, [user]);

  // Realtime orders update listener
  useEffect(() => {
    const handleOrdersUpdated = () => {
      if (user) {
        fetchUserOrders(user.id).then((data) => setOrders(data || []));
      }
    };
    window.addEventListener('shopcart-orders-updated', handleOrdersUpdated);
    return () => window.removeEventListener('shopcart-orders-updated', handleOrdersUpdated);
  }, [user]);

  // Load orders
  useEffect(() => {
    let isMounted = true;
    const loadOrders = async () => {
      if (!user) return;
      setIsLoadingOrders(true);
      try {
        const data = await fetchUserOrders(user.id);
        if (isMounted) {
          setOrders(data || []);
        }
      } catch (err) {
        console.warn('Error loading orders:', err);
      } finally {
        if (isMounted) setIsLoadingOrders(false);
      }
    };

    if (isAuthenticated) {
      loadOrders();
    }
  }, [user, isAuthenticated]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200/90 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 text-[#0b5c37] rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Protected Customer Portal</h2>
            <p className="text-xs text-slate-500 mt-1">
              Please sign in to view your orders, shipping details, and account settings.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onNavigate('login')}
              className="flex-1 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-900/10 cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => onNavigate('register')}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      const res = await updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          zipCode: zipCode.trim(),
          country: country.trim(),
        },
      });

      if (res.success) {
        showToast('Profile updated in Supabase successfully!', 'success');
      } else {
        showToast(res.message || 'Failed to update profile', 'error');
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await resetPassword(newPassword);
      if (res.success) {
        showToast('Password updated securely!', 'success');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        showToast(res.message || 'Failed to update password', 'error');
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleResendEmail = async () => {
    setIsResending(true);
    try {
      const res = await resendVerificationEmail(user.email);
      if (res.success) {
        showToast('Verification email resent! Check your inbox.', 'success');
      } else {
        showToast(res.message || 'Failed to resend email', 'error');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* 1. Header Profile Banner */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#0b5c37]/20 to-transparent pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#0b5c37] text-white font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-emerald-900/15">
              {user.avatar || user.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{user.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-600 border border-[#0b5c37]/30">
                  {user.role === 'admin' ? 'Administrator' : 'VIP Member'}
                </span>
                {user.emailConfirmed ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Verified</span>
                  </span>
                ) : (
                  <button
                    onClick={handleResendEmail}
                    disabled={isResending}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 flex items-center gap-1 hover:bg-amber-500/30 transition-colors cursor-pointer"
                    title="Click to resend verification email"
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span>{isResending ? 'Resending...' : 'Unverified · Verify Now'}</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>{user.email}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => onNavigate('shop')}
              className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-900/10 flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Shop More</span>
            </button>
            <button
              onClick={async () => {
                await logout();
                showToast('Signed out of Shop Cart', 'info');
                onNavigate('home');
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 text-xs font-semibold rounded-xl transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-6 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'profile'
              ? 'border-[#0b5c37] text-[#0b5c37]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>Profile &amp; Shipping Details</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 px-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'orders'
              ? 'border-[#0b5c37] text-[#0b5c37]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Order History ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('wishlist')}
          className={`pb-3 px-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'wishlist'
              ? 'border-[#0b5c37] text-[#0b5c37]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Heart className="w-4 h-4 text-rose-500" />
          <span>Your Wishlist ({wishlist.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 px-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'security'
              ? 'border-[#0b5c37] text-[#0b5c37]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Security &amp; Password</span>
        </button>
      </div>

      {/* 3. Tab Contents */}

      {/* TAB 1: Profile & Shipping */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Personal Information &amp; Default Shipping</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Updates made here synchronize with your verified customer record in Supabase.
            </p>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full py-2.5 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email Address (Auth ID)
                </label>
                <div className="relative">
                  <input
                    type="email"
                    disabled
                    value={user.email}
                    className="w-full py-2.5 pl-9 pr-3 text-xs bg-slate-100 text-slate-500 border border-slate-200 rounded-xl cursor-not-allowed"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Phone Number
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full py-2.5 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Country / Region
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full py-2.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Default Shipping Address
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Street Address
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. 742 Evergreen Terrace"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      className="w-full py-2.5 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                    />
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      City
                    </label>
                    <input
                      type="text"
                      placeholder="Seattle"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full py-2.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      State / Province
                    </label>
                    <input
                      type="text"
                      placeholder="WA"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full py-2.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Postal / ZIP Code
                    </label>
                    <input
                      type="text"
                      placeholder="98101"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="w-full py-2.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-6 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-900/10 flex items-center gap-2 cursor-pointer"
              >
                {isSavingProfile ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Profile Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Saved Delivery Addresses Section */}
          <div className="pt-8 border-t border-slate-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#0b5c37]" />
                  <span>Saved Delivery Addresses</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Manage multiple shipping destinations for fast checkout on web &amp; mobile.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddAddress}
                className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-900/10 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Address</span>
              </button>
            </div>

            {(!user?.savedAddresses || user.savedAddresses.length === 0) ? (
              <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
                <MapPin className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">No saved delivery addresses</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Add your home, office, or family delivery addresses so you won't need to re-type them during checkout.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddAddress}
                  className="mt-2 text-xs font-bold text-[#0b5c37] hover:underline cursor-pointer"
                >
                  + Add your first address
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {user.savedAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      addr.isDefault
                        ? 'bg-emerald-50/40 border-[#0b5c37]/40 ring-1 ring-[#0b5c37]/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          {addr.label?.toLowerCase() === 'work' ? (
                            <Briefcase className="w-3.5 h-3.5 text-slate-600" />
                          ) : (
                            <Home className="w-3.5 h-3.5 text-[#0b5c37]" />
                          )}
                          <span>{addr.label || 'Home'}</span>
                          {addr.isDefault && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                              Default
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditAddress(addr)}
                            className="p-1.5 text-slate-400 hover:text-[#0b5c37] transition-colors rounded-lg hover:bg-slate-100 cursor-pointer"
                            title="Edit Address"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-slate-100 cursor-pointer"
                            title="Delete Address"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs space-y-0.5">
                        <p className="font-bold text-slate-800">{addr.fullName || user.name}</p>
                        <p className="text-slate-600">
                          {addr.houseBuilding ? `${addr.houseBuilding}, ` : ''}
                          {addr.streetArea || ''}
                        </p>
                        {addr.landmark && (
                          <p className="text-slate-500 text-[11px]">Landmark: {addr.landmark}</p>
                        )}
                        <p className="text-slate-600">
                          {addr.city}, {addr.state} - <span className="font-mono font-semibold">{addr.pinCode}</span>
                        </p>
                        <p className="text-slate-500 text-[11px]">{addr.country || 'India'}</p>
                        <p className="text-slate-700 font-mono text-[11px] pt-1">
                          Phone: {addr.phone || user.phone}
                        </p>
                      </div>
                    </div>

                    {!addr.isDefault && (
                      <div className="pt-3 mt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleSetDefaultAddress(addr)}
                          className="text-[11px] font-bold text-[#0b5c37] hover:underline cursor-pointer"
                        >
                          Set as Default Address
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Orders (Amazon-Style Order Management & Tracking) */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Your Orders &amp; Package Tracking</h2>
              <p className="text-xs text-slate-500">
                Live Amazon-style order status, real-time shipment updates, and fast re-ordering.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs overflow-x-auto">
              {[
                { id: 'all', label: `All (${orders.length})` },
                {
                  id: 'in_progress',
                  label: `In Progress (${orders.filter((o) => ['order_placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'].includes(o.status)).length})`,
                },
                {
                  id: 'delivered',
                  label: `Delivered (${orders.filter((o) => o.status === 'delivered').length})`,
                },
                {
                  id: 'cancelled',
                  label: `Cancelled (${orders.filter((o) => o.status === 'cancelled' || o.status === 'refunded').length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOrderFilterTab(tab.id as any)}
                  className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap text-xs ${
                    orderFilterTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {isLoadingOrders ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/90 text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0b5c37] mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Fetching your orders from Supabase...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/90 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto">
                <Package className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">No Orders Placed Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  When you check out and complete a purchase, your verified order records will automatically appear here.
                </p>
              </div>
              <button
                onClick={() => onNavigate('shop')}
                className="px-5 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-colors shadow-md shadow-emerald-900/10 cursor-pointer"
              >
                Start Shopping Now
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {orders
                .filter((ord) => {
                  if (orderFilterTab === 'in_progress') {
                    return ['order_placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'].includes(ord.status);
                  }
                  if (orderFilterTab === 'delivered') return ord.status === 'delivered';
                  if (orderFilterTab === 'cancelled') return ord.status === 'cancelled' || ord.status === 'refunded';
                  return true;
                })
                .map((ord) => {
                  const items = ord.order_items || [];
                  const orderDate = new Date(ord.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const total = ord.total_amount || 0;
                  const statusMeta = getStatusMeta(ord.status);
                  const isDelivered = ord.status === 'delivered';
                  const isCancelled = ord.status === 'cancelled';
                  const isRefunded = ord.status === 'refunded';
                  const stepIndex = getAmazonStepIndex(ord.status);
                  const deliveryInfo = formatEstimatedDelivery(
                    ord.estimated_delivery_date,
                    ord.created_at,
                    isDelivered
                  );

                  return (
                    <div
                      key={ord.id || ord.order_number}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden transition-all hover:border-slate-300"
                    >
                      {/* 1. Amazon-Style Order Header Ribbon */}
                      <div className="bg-slate-50/90 px-5 sm:px-6 py-3.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <div className="flex flex-wrap items-center gap-6 text-slate-500">
                          <div>
                            <span className="block uppercase text-[10px] font-mono text-slate-400">Order Placed</span>
                            <span className="font-semibold text-slate-800">{orderDate}</span>
                          </div>

                          <div>
                            <span className="block uppercase text-[10px] font-mono text-slate-400">Total</span>
                            <span className="font-extrabold text-slate-900 tabular-nums">{formatPrice(Number(total))}</span>
                          </div>

                          <div>
                            <span className="block uppercase text-[10px] font-mono text-slate-400">Ship To</span>
                            <span className="font-semibold text-slate-800 underline decoration-dotted cursor-help" title={`${ord.shipping_address?.street}, ${ord.shipping_address?.city}, ${ord.shipping_address?.state}`}>
                              {ord.shipping_address?.fullName || user.name}
                            </span>
                          </div>
                        </div>

                        {/* Order ID & Payment info */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="block uppercase text-[10px] font-mono text-slate-400">Order #</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900">#{ord.order_number}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyOrderId(ord.order_number)}
                                className="p-0.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                                title="Copy Order ID"
                              >
                                {copiedOrderId === ord.order_number ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Payment status badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              ord.paymentStatus === 'verified'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : ord.paymentStatus === 'rejected'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {(ord.paymentMethod?.includes('phonepe') ? 'PhonePe' : 'Google Pay')}: {ord.paymentStatus === 'verified' ? 'Verified & Paid' : ord.paymentStatus === 'rejected' ? 'Rejected' : 'Waiting for Verification'}
                          </span>
                        </div>
                      </div>

                      {/* 2. Amazon-Style Order Body */}
                      <div className="p-5 sm:p-6 space-y-6">
                        {/* Delivery Status & Primary Action Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  isDelivered
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : isCancelled || isRefunded
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-emerald-50 text-[#08482b] border border-emerald-200'
                                }`}
                              >
                                {statusMeta.label}
                              </span>

                              {ord.carrier && (
                                <span className="text-[11px] text-slate-400">
                                  via {ord.carrier}
                                </span>
                              )}
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                              <Truck className="w-5 h-5 text-[#0b5c37]" />
                              <span>{isCancelled ? 'Order Cancelled' : isRefunded ? 'Payment Refunded' : deliveryInfo.headline}</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {isCancelled || isRefunded ? statusMeta.description : deliveryInfo.subtext}
                            </p>

                            {/* Cancellation Details Banner */}
                            {isCancelled && (
                              <div className="bg-rose-50 border border-rose-200/90 rounded-xl p-3 mt-2.5 flex items-start gap-2.5 text-left">
                                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                                <div className="text-xs space-y-0.5">
                                  <span className="font-bold text-rose-900 block">Cancellation Reason:</span>
                                  <p className="text-rose-800">{ord.cancellation_reason || 'Cancelled at customer request'}</p>
                                  {ord.cancelled_at && (
                                    <span className="text-[10px] text-rose-500 font-mono block">
                                      {new Date(ord.cancelled_at).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {/* Eligible Customer Cancellation Button */}
                            {['order_placed', 'pending', 'confirmed', 'processing'].includes(ord.status?.toLowerCase()) && (
                              <button
                                type="button"
                                onClick={() => setCancellingOrder(ord)}
                                className="px-3.5 py-2 border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Cancel Order</span>
                              </button>
                            )}

                            {/* Soft-Hide Cancelled Order from View */}
                            {(isCancelled || isRefunded) && (
                              <button
                                type="button"
                                onClick={() => setHidingOrder(ord)}
                                className="px-3 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                                title="Hide from your order history"
                              >
                                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                                <span>Hide Order</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setTrackingModalOrder(ord)}
                              className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-900/10 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Track Package</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setTrackingModalOrder(ord)}
                              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                              View Details
                            </button>
                          </div>
                        </div>

                        {/* Mini Amazon 5-Stage Timeline Bar */}
                        {!isCancelled && !isRefunded && (
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                            <div className="relative pt-1 pb-1">
                              {/* Background Bar */}
                              <div className="absolute top-3.5 left-3 right-3 h-1 bg-slate-200 -translate-y-1/2 z-0" />

                              {/* Active Colored Fill Line */}
                              <div
                                className="absolute top-3.5 left-3 h-1 bg-gradient-to-r from-[#0b5c37] to-emerald-500 -translate-y-1/2 z-0 transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(0, (stepIndex / (AMAZON_TRACKING_MILESTONES.length - 1)) * 94))}%`,
                                }}
                              />

                              {/* Milestone Nodes */}
                              <div className="relative z-10 flex justify-between">
                                {AMAZON_TRACKING_MILESTONES.map((step, idx) => {
                                  const isDone = stepIndex > idx;
                                  const isCurrent = stepIndex === idx;

                                  return (
                                    <div key={step.key} className="flex flex-col items-center text-center">
                                      <div
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                          isDone
                                            ? 'bg-emerald-600 text-white'
                                            : isCurrent
                                            ? 'bg-[#0b5c37] text-white ring-2 ring-emerald-200 animate-pulse'
                                            : 'bg-white text-slate-400 border border-slate-300'
                                        }`}
                                      >
                                        {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                                      </div>
                                      <span
                                        className={`text-[10px] font-semibold mt-1 hidden sm:block ${
                                          isCurrent
                                            ? 'text-[#0b5c37] font-bold'
                                            : isDone
                                            ? 'text-slate-800'
                                            : 'text-slate-400'
                                        }`}
                                      >
                                        {step.label}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Ordered Items List */}
                        <div className="divide-y divide-slate-100 border-t border-slate-100 pt-3">
                          {items.map((it: any, idx: number) => {
                            const prod = it.product || PRODUCTS.find((p) => p.id === it.product_id || p.name === it.product_name);
                            return (
                              <div key={idx} className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                                    {prod ? (
                                      <ProductImage
                                        product={prod}
                                        size="sm"
                                        showBadge={false}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <span className="font-mono font-bold text-xs text-slate-500">
                                        {(it.product_name || 'Item').substring(0, 2).toUpperCase()}
                                      </span>
                                    )}
                                  </div>

                                <div>
                                  <h4 className="font-bold text-slate-900">{it.product_name}</h4>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    Qty: {it.quantity} {it.selected_color ? `· Color: ${it.selected_color}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                                <span className="font-bold text-slate-900 tabular-nums">
                                  {formatPrice(Number(it.total_price || it.unit_price * it.quantity || 0))}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleReorderItem(it)}
                                  className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#08482b] font-bold text-xs rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Buy Again</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Customer Wishlist */}
      {activeTab === 'wishlist' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                <h2 className="text-base font-bold text-slate-900">Your Private Wishlist</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200">
                  {wishlist.length} item{wishlist.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Products saved to your private list stored securely in the Supabase <code className="font-mono text-[#0b5c37] bg-emerald-50 px-1 py-0.5 rounded">public.wishlist</code> table.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-[#0b5c37] border border-emerald-200 rounded-full text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Supabase Sync Active</span>
              </span>
            </div>
          </div>

          {wishlist.length === 0 ? (
            <div className="text-center py-16 space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Heart className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Your Wishlist is Empty</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Save products you love while shopping so you can easily compare, track prices, or purchase them later. Click the "Add to Wishlist" button on any product page.
              </p>
              <button
                onClick={() => onNavigate('shop')}
                className="px-6 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Explore Products</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {wishlist.map((productId) => {
                const prod = PRODUCTS.find((p) => p.id === productId);
                if (!prod) return null;
                return (
                  <div
                    key={prod.id}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all bg-slate-50/50 flex flex-col sm:flex-row gap-4 items-center sm:items-start"
                  >
                    <div
                      onClick={() => onNavigate('product', { productId: prod.id })}
                      className="w-24 h-24 rounded-xl bg-white border border-slate-200/80 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer group"
                    >
                      <ProductImage
                        product={prod}
                        className="w-full h-full p-2 group-hover:scale-105 transition-transform"
                      />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5 text-center sm:text-left w-full">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase text-[#0b5c37] tracking-wider">
                          {prod.brand}
                        </span>
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 font-bold px-2 py-0.5 rounded-full">
                          In Stock ({prod.stockCount})
                        </span>
                      </div>

                      <h4
                        onClick={() => onNavigate('product', { productId: prod.id })}
                        className="text-xs sm:text-sm font-bold text-slate-900 truncate hover:text-[#0b5c37] cursor-pointer"
                        title={prod.name}
                      >
                        {prod.name}
                      </h4>

                      <div className="flex items-baseline justify-center sm:justify-start gap-2">
                        <span className="text-sm font-black text-slate-900 tabular-nums">
                          {formatPrice(prod.price)}
                        </span>
                        {prod.originalPrice > prod.price && (
                          <span className="text-xs text-slate-400 line-through tabular-nums">
                            {formatPrice(prod.originalPrice)}
                          </span>
                        )}
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <button
                          onClick={() => {
                            addToCart(prod, 1);
                            showToast(`Added ${prod.name} to cart!`, 'success');
                          }}
                          className="px-3.5 py-1.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Move to Cart</span>
                        </button>

                        <button
                          onClick={() => toggleWishlist(prod.id)}
                          className="px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Remove from wishlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>

                        <button
                          onClick={() => onNavigate('product', { productId: prod.id })}
                          className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                        >
                          View Details &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Security & Password */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Security &amp; Account Password</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Change your password or review your authentication security credentials.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="max-w-md space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full py-2.5 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37] font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full py-2.5 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37] font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              {isUpdatingPassword ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating Password in Supabase...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </form>

          <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Supabase Auth Session is active and secured.</span>
            </div>
          </div>
        </div>
      )}

      {/* Amazon-Style Order Tracking & Details Modal */}
      <OrderTrackingModal
        order={trackingModalOrder}
        isOpen={!!trackingModalOrder}
        onClose={() => setTrackingModalOrder(null)}
        onBuyAgain={handleReorderItem}
      />

      {/* 1. CUSTOMER ORDER CANCELLATION MODAL */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Cancel Order #{cancellingOrder.order_number}</h3>
                  <p className="text-[11px] text-slate-500">Total: {formatPrice(Number(cancellingOrder.total_amount || 0))}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCancellation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Select Reason for Cancellation <span className="text-rose-500">*</span>
                </label>
                <select
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full py-2.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-rose-500 cursor-pointer"
                >
                  <option value="Ordered by mistake">Ordered by mistake</option>
                  <option value="Item delivery time is too long">Item delivery time is too long</option>
                  <option value="Need to change delivery address or phone">Need to change delivery address or phone</option>
                  <option value="Found a better price elsewhere">Found a better price elsewhere</option>
                  <option value="Payment / UPI transaction issue">Payment / UPI transaction issue</option>
                  <option value="Changed mind / No longer needed">Changed mind / No longer needed</option>
                  <option value="Other reason">Other reason</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Additional Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={cancellationDetails}
                  onChange={(e) => setCustomCancellationNotes(e.target.value)}
                  placeholder="Provide more context for our operations team..."
                  className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200/80 text-[11px] text-amber-800 space-y-1">
                <span className="font-bold flex items-center gap-1 text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Cancellation Policy:</span>
                </span>
                <p>
                  Orders that have not yet been dispatched can be cancelled immediately. If you have already transferred UPI payment, our merchant team will verify and initiate your refund.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCancellingOrder(null)}
                  disabled={isSubmittingCancel}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmittingCancel ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Cancelling Order...</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5" />
                      <span>Confirm Cancellation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. CUSTOMER HIDE CANCELLED ORDER CONFIRMATION MODAL */}
      {hidingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto">
              <EyeOff className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Hide Cancelled Order?</h3>
              <p className="text-xs text-slate-500">
                Order <span className="font-mono font-bold text-slate-700">#{hidingOrder.order_number}</span> will be removed from your order history list.
              </p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600">
              <p>
                Financial, invoice, and warranty audit records remain safely retained in the official database.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setHidingOrder(null)}
                disabled={isSubmittingHide}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Keep in List
              </button>
              <button
                type="button"
                onClick={handleSubmitHideOrder}
                disabled={isSubmittingHide}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSubmittingHide ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide Order</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ADD / EDIT SAVED DELIVERY ADDRESS MODAL */}
      {addressModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-[#0b5c37] flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingAddress ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Save complete Indian postal address for 1-click checkout</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddressModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAddressForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Address Label <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={addressForm.label || 'Home'}
                    onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value as any })}
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  >
                    <option value="Home">Home</option>
                    <option value="Work">Work / Office</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addressForm.fullName}
                    onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                    placeholder="Recipient's name"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    10-Digit Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={addressForm.phone}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={addressForm.email || ''}
                    onChange={(e) => setAddressForm({ ...addressForm, email: e.target.value })}
                    placeholder="For delivery updates"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Flat / House No. / Building / Apartment <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addressForm.houseBuilding}
                    onChange={(e) => setAddressForm({ ...addressForm, houseBuilding: e.target.value })}
                    placeholder="e.g. Flat 402, Lotus Tower"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Street / Road / Area / Sector <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addressForm.streetArea}
                    onChange={(e) => setAddressForm({ ...addressForm, streetArea: e.target.value })}
                    placeholder="e.g. 100 Feet Road, Indiranagar"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    value={addressForm.landmark || ''}
                    onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })}
                    placeholder="e.g. Near Indiranagar Metro"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Town / City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    placeholder="e.g. Bengaluru"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    State / Union Territory <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addressForm.state}
                    onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                    placeholder="e.g. Karnataka"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    6-Digit Postal PIN Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={addressForm.pinCode}
                    onChange={(e) => setAddressForm({ ...addressForm, pinCode: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 560038"
                    className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37] font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 pt-1">
                    <input
                      type="checkbox"
                      checked={addressForm.isDefault}
                      onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                      className="w-4 h-4 rounded text-[#0b5c37] accent-[#0b5c37] cursor-pointer"
                    />
                    <span className="font-semibold">Make this my default shipping address</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddressModalOpen(false)}
                  disabled={isSavingAddress}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAddress}
                  className="px-5 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingAddress ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Address...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Address</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
