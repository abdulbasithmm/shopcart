import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Layers,
  Users,
  CreditCard,
  Boxes,
  Settings,
  IndianRupee,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Edit,
  Trash2,
  X,
  ExternalLink,
  RefreshCw,
  Eye,
  LogOut,
  ShieldCheck,
  Check,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Save,
  QrCode,
  MapPin,
  Phone,
  Mail,
  Store,
  ChevronRight,
  Database,
  Lock,
  Truck,
  Calendar,
  Send,
  Copy,
  BarChart3,
  PieChart,
  Activity,
  Menu,
  ChevronDown,
  ArrowRight,
  SlidersHorizontal,
  Smartphone,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  FileImage,
  Download,
} from 'lucide-react';
import { PageView, Product, Order, OrderStatus, ShipmentUpdate, MerchantPaymentSettings, AIScreenshotAnalysis } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PRODUCTS, CATEGORIES } from '../data/mockData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { formatPrice } from '../utils/format';
import {
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  updateAdminStock,
  fetchProducts,
} from '../services/productService';
import { ProductImageGalleryEditor } from '../components/admin/ProductImageGalleryEditor';
import {
  updateOrderStatus,
  updateOrderTracking,
  addShipmentUpdate,
  fetchAllAdminOrders,
} from '../services/orderService';
import {
  getStatusMeta,
  getAmazonStepIndex,
  AMAZON_TRACKING_MILESTONES,
  formatEstimatedDelivery,
  ALL_ORDER_STATUSES,
  normalizeOrderStatus,
} from '../utils/orderTracking';
import { updateCustomerProfile } from '../services/profileService';

interface AdminPageProps {
  initialSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
  onNavigate: (page: PageView, params?: any) => void;
  onOpenSupabaseModal?: () => void;
}

export type AdminSection =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'categories'
  | 'customers'
  | 'inventory'
  | 'payments'
  | 'analytics'
  | 'settings';

export const AdminPage: React.FC<AdminPageProps> = ({
  initialSection = 'dashboard',
  onSectionChange,
  onNavigate,
  onOpenSupabaseModal,
}) => {
  const { user, logout, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Sync active section when initialSection prop changes (e.g. from browser back/forward or direct route)
  useEffect(() => {
    if (initialSection && initialSection !== activeSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  const handleSelectSection = (sec: AdminSection) => {
    setActiveSection(sec);
    onSectionChange?.(sec);
    setIsMobileSidebarOpen(false);
    const secPath = sec === 'settings' ? 'profile' : sec;
    try {
      window.history.pushState(null, '', `/admin/${secPath}`);
      window.location.hash = `/admin/${secPath}`;
    } catch {
      window.location.hash = `/admin/${secPath}`;
    }
  };

  // Live Database States
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [categories, setCategories] = useState<any[]>(CATEGORIES);
  const [customers, setCustomers] = useState<any[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<any[]>([]);
  const [dbPingLatency, setDbPingLatency] = useState<number | null>(null);
  const [isPingingDb, setIsPingingDb] = useState(false);

  // Search & Filters
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [paymentGatewayFilter, setPaymentGatewayFilter] = useState<'all' | 'all_upi' | 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'other'>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'pending_verification' | 'verified' | 'rejected'>('all');
  const [paymentSearchQuery, setPaymentSearchQuery] = useState('');
  const [analyticsRange, setAnalyticsRange] = useState<'7d' | '30d' | 'all'>('30d');

  // Merchant UPI Settings State
  const [merchantSettings, setMerchantSettings] = useState<MerchantPaymentSettings>({
    merchant_upi_id: 'shopcart.merchant@okaxis',
    merchant_name: 'Shop Cart Online Store',
    merchant_upi_number: '+91 98765 43210',
    qr_image_url: '/assets/aistudio/qr_eeef5752.jpeg',
    enable_dynamic_qr: true,
    instructions: 'Scan QR with any UPI app, enter exact order amount, complete payment, and upload receipt screenshot.',
  });
  const [isMerchantSettingsOpen, setIsMerchantSettingsOpen] = useState(false);
  const [isSavingMerchantSettings, setIsSavingMerchantSettings] = useState(false);
  const [merchantSettingsForm, setMerchantSettingsForm] = useState<MerchantPaymentSettings>({
    merchant_upi_id: 'shopcart.merchant@okaxis',
    merchant_name: 'Shop Cart Online Store',
    merchant_upi_number: '+91 98765 43210',
    qr_image_url: '/assets/aistudio/qr_eeef5752.jpeg',
    enable_dynamic_qr: true,
    instructions: 'Scan QR with any UPI app, enter exact order amount, complete payment, and upload receipt screenshot.',
  });

  // Fetch real merchant settings on mount
  useEffect(() => {
    fetch('/api/payments/merchant-settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.merchant_upi_id) {
          setMerchantSettings(data);
          setMerchantSettingsForm(data);
        }
      })
      .catch((err) => console.warn('Could not load merchant settings in admin:', err));
  }, []);

  // Screenshot Request & Zoom Modal State
  const [requestingScreenshotOrder, setRequestingScreenshotOrder] = useState<any | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [isSendingScreenshotRequest, setIsSendingScreenshotRequest] = useState(false);
  const [adminZoomScreenshot, setAdminZoomScreenshot] = useState<string | null>(null);

  // Inventory Filters & Search
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low' | 'out'>('all');
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');

  // Modals & Drawers
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any | null>(null);
  const [viewingPaymentOrder, setViewingPaymentOrder] = useState<any | null>(null);
  const [verifyingOrder, setVerifyingOrder] = useState<any | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessingVerify, setIsProcessingVerify] = useState(false);

  // Customer Detail Drawer Modal
  const [viewingCustomer, setViewingCustomer] = useState<any | null>(null);

  // Category Edit / Delete States
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatSlug, setEditCatSlug] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<any | null>(null);

  // Admin Profile Form State
  const [adminFullName, setAdminFullName] = useState(user?.name || '');
  const [adminPhone, setAdminPhone] = useState(user?.phone || '');
  const [adminAvatar, setAdminAvatar] = useState(user?.avatar || '');
  const [isSavingAdminProfile, setIsSavingAdminProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setAdminFullName(user.name || '');
      setAdminPhone(user.phone || '');
      setAdminAvatar(user.avatar || '');
    }
  }, [user]);

  // Logistics & Tracking edit state
  const [carrierInput, setCarrierInput] = useState('Shop Cart Express');
  const [trackingNumberInput, setTrackingNumberInput] = useState('');
  const [estDeliveryDateInput, setEstDeliveryDateInput] = useState('');
  const [isSavingTracking, setIsSavingTracking] = useState(false);

  // Add Shipment Update form state
  const [updateStatusInput, setUpdateStatusInput] = useState<OrderStatus>('shipped');
  const [updateTitleInput, setUpdateTitleInput] = useState('');
  const [updateLocationInput, setUpdateLocationInput] = useState('');
  const [updateDescriptionInput, setUpdateDescriptionInput] = useState('');
  const [isPublishingUpdate, setIsPublishingUpdate] = useState(false);

  // Product Modals
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  // Quick Restock Modal
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);
  const [isSavingRestock, setIsSavingRestock] = useState(false);

  // Add Product Form State
  const [prodForm, setProdForm] = useState({
    name: '',
    brand: '',
    category: 'Electronics',
    price: 99.99,
    originalPrice: 129.99,
    discountPercentage: 23,
    stockCount: 15,
    visualType: 'headphones',
    badge: 'New',
    shortDescription: '',
    fullDescription: '',
  });
  const [prodImages, setProdImages] = useState<string[]>(['', '', '', '']);
  const [editingProductImages, setEditingProductImages] = useState<string[]>(['', '', '', '']);

  const handleStartEditProduct = (p: Product) => {
    setEditingProduct(p);
    const existingImgs = Array.isArray(p.images) && p.images.length > 0
      ? [...p.images]
      : (p.image ? [p.image] : []);
    while (existingImgs.length < 4) existingImgs.push('');
    setEditingProductImages(existingImgs.slice(0, 4));
  };

  // Category Add State
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Fetch all administrative records from Supabase
  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured()) {
        // 1. Fetch Orders with Items and Payments
        const adminOrders = await fetchAllAdminOrders();
        setOrders(adminOrders);

        // 2. Fetch Products
        const prodRes = await fetchProducts();
        if (prodRes.products && prodRes.products.length > 0) {
          setProducts(prodRes.products);
        }

        // 3. Fetch Categories
        const { data: catsData } = await supabase
          .from('categories')
          .select('*')
          .order('name', { ascending: true });
        if (catsData && catsData.length > 0) {
          setCategories(catsData);
        }

        // 4. Fetch Customers
        const { data: profsData } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        if (profsData) {
          setCustomers(profsData);
        }

        // 5. Fetch Payment Records
        const { data: paymentsData } = await supabase
          .from('payment_records')
          .select('*')
          .order('created_at', { ascending: false });
        if (paymentsData) {
          setPaymentRecords(paymentsData);
        }
      } else {
        loadLocalOrders();
      }
    } catch (err) {
      console.warn('Error loading admin data from Supabase:', err);
      loadLocalOrders();
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocalOrders = () => {
    try {
      const local = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      setOrders(local);
    } catch {
      setOrders([]);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Ping Supabase to test real-time latency
  const handlePingDatabase = async () => {
    setIsPingingDb(true);
    const start = performance.now();
    try {
      if (isSupabaseConfigured()) {
        await supabase.from('categories').select('id').limit(1);
        const duration = Math.round(performance.now() - start);
        setDbPingLatency(duration);
        showToast(`Supabase PostgreSQL responded in ${duration}ms`, 'success');
      } else {
        setTimeout(() => {
          setDbPingLatency(4);
          showToast('Local Mock Engine operational (4ms)', 'info');
          setIsPingingDb(false);
        }, 150);
      }
    } catch (err: any) {
      showToast('Database ping failed: ' + err.message, 'error');
    } finally {
      setIsPingingDb(false);
    }
  };

  // Compute 7 Core Dashboard Overview Metrics
  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, ord) => sum + Number(ord.total_amount || 0), 0);
  }, [orders]);

  const totalOrders = orders.length;

  const pendingOrders = useMemo(() => {
    return orders.filter((ord) => {
      const s = normalizeOrderStatus(ord.status);
      return s === 'order_placed' || s === 'processing' || s === 'confirmed';
    }).length;
  }, [orders]);

  const deliveredOrders = useMemo(() => {
    return orders.filter((ord) => normalizeOrderStatus(ord.status) === 'delivered').length;
  }, [orders]);

  const totalProducts = products.length;

  const totalCustomers = Math.max(customers.length, 2);

  const lowStockProducts = useMemo(() => {
    return products.filter((prod) => prod.stockCount <= 5).length;
  }, [products]);

  const pendingUpiPayments = useMemo(() => {
    return orders.filter((ord) => {
      const pay = ord.payment_records?.[0] || {};
      const pMethod = ord.paymentMethod || pay.payment_method;
      const isVerified = pay.payment_status === 'verified' || ord.paymentStatus === 'verified';
      return (pMethod === 'gpay_qr' || pMethod === 'cash_on_delivery') && !isVerified;
    });
  }, [orders]);

  // Filtered orders with all 8 statuses & tracking query
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      const statusMatch =
        orderStatusFilter === 'all' ||
        normalizeOrderStatus(ord.status) === normalizeOrderStatus(orderStatusFilter);

      const q = orderSearchQuery.toLowerCase();
      const searchMatch =
        !q ||
        (ord.order_number || '').toLowerCase().includes(q) ||
        (ord.guest_email || '').toLowerCase().includes(q) ||
        (ord.tracking_number || '').toLowerCase().includes(q) ||
        (ord.carrier || '').toLowerCase().includes(q) ||
        (ord.shipping_address?.fullName || '').toLowerCase().includes(q);

      return statusMatch && searchMatch;
    });
  }, [orders, orderStatusFilter, orderSearchQuery]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const catMatch = productCategoryFilter === 'all' || p.category === productCategoryFilter;
      const q = productSearchQuery.toLowerCase();
      const searchMatch = !q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q);
      return catMatch && searchMatch;
    });
  }, [products, productCategoryFilter, productSearchQuery]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
    );
  }, [customers, customerSearchQuery]);

  // Filtered payment records (Google Pay & PhonePe UPI only)
  const filteredPaymentOrders = useMemo(() => {
    return orders.filter((ord) => {
      const pay = ord.payment_records?.[0] || {};
      const method = (ord.paymentMethod || pay.payment_method || '').toLowerCase();
      const rawStatus = (pay.payment_status || ord.paymentStatus || '').toLowerCase();
      const orderStatus = (ord.status || '').toLowerCase();
      
      const isVerified = rawStatus === 'verified' || orderStatus === 'confirmed' || orderStatus === 'processing' || orderStatus === 'shipped' || orderStatus === 'delivered';
      const isRejected = rawStatus === 'rejected' || rawStatus === 'failed' || orderStatus === 'cancelled';
      const isPending = !isVerified && !isRejected;

      // 1. Filter by Gateway (Universal UPI)
      if (paymentGatewayFilter === 'all_upi') {
        if (!method.includes('all_upi') && !method.includes('universal')) return false;
      } else if (paymentGatewayFilter === 'gpay') {
        if (!method.includes('gpay')) return false;
      } else if (paymentGatewayFilter === 'phonepe') {
        if (!method.includes('phonepe')) return false;
      } else if (paymentGatewayFilter === 'paytm') {
        if (!method.includes('paytm')) return false;
      } else if (paymentGatewayFilter === 'bhim') {
        if (!method.includes('bhim')) return false;
      } else if (paymentGatewayFilter === 'other') {
        if (method.includes('gpay') || method.includes('phonepe') || method.includes('paytm') || method.includes('bhim')) return false;
      }

      // 2. Filter by Payment Status
      if (paymentStatusFilter === 'pending_verification') {
        if (!isPending) return false;
      } else if (paymentStatusFilter === 'verified') {
        if (!isVerified) return false;
      } else if (paymentStatusFilter === 'rejected') {
        if (!isRejected) return false;
      }

      // 3. Search filter by Order ID, Customer Name, Email, or UTR number
      if (paymentSearchQuery.trim()) {
        const q = paymentSearchQuery.toLowerCase().trim();
        const orderNum = (ord.order_number || ord.id || '').toLowerCase();
        const custName = (ord.shipping_address?.fullName || ord.customer_name || '').toLowerCase();
        const email = (ord.guest_email || ord.user_id || '').toLowerCase();
        const utr = (pay.transaction_reference || ord.transactionReference || '').toLowerCase();
        if (!orderNum.includes(q) && !custName.includes(q) && !email.includes(q) && !utr.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, paymentGatewayFilter, paymentStatusFilter, paymentSearchQuery]);

  // Filtered inventory products
  const filteredInventoryProducts = useMemo(() => {
    return products.filter((p) => {
      const q = inventorySearchQuery.toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (inventoryFilter === 'low') return p.stockCount > 0 && p.stockCount <= 5;
      if (inventoryFilter === 'out') return p.stockCount === 0;
      return true;
    });
  }, [products, inventorySearchQuery, inventoryFilter]);

  // Real Dynamic Analytics Computations
  const periodRevenueStats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = Date.now() - 7 * 86400000;
    const monthStart = Date.now() - 30 * 86400000;
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

    let todayRev = 0;
    let weekRev = 0;
    let monthRev = 0;
    let yearRev = 0;

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'refunded') continue;
      const amt = Number(o.total_amount || 0);
      const t = new Date(o.created_at || Date.now()).getTime();
      if (t >= todayStart) todayRev += amt;
      if (t >= weekStart) weekRev += amt;
      if (t >= monthStart) monthRev += amt;
      if (t >= yearStart) yearRev += amt;
    }

    return { todayRev, weekRev, monthRev, yearRev };
  }, [orders]);

  // Dynamic daily trajectory for 7 days
  const dailyTrajectory = useMemo(() => {
    const daysCount = 7;
    const days = [];
    const now = new Date();
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
      days.push({ dateStr, dayLabel, total: 0, orderCount: 0 });
    }

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'refunded') continue;
      const oDate = (o.created_at || new Date().toISOString()).split('T')[0];
      const slot = days.find((d) => d.dateStr === oDate);
      if (slot) {
        slot.total += Number(o.total_amount || 0);
        slot.orderCount += 1;
      }
    }
    return days;
  }, [orders]);

  // Dynamic Top Selling Products
  const topSellingProducts = useMemo(() => {
    const salesMap = new Map<
      string,
      { id: string; name: string; category: string; price: number; unitsSold: number; revenue: number; stockCount: number }
    >();

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'refunded') continue;
      const items = o.order_items || o.items || [];
      for (const it of items) {
        const pid = it.product_id || it.id || it.product_name;
        const matchingProd = products.find((p) => p.id === it.product_id || p.name === it.product_name);
        const existing = salesMap.get(pid) || {
          id: pid,
          name: it.product_name || matchingProd?.name || 'Product',
          category: matchingProd?.category || 'General',
          price: Number(it.unit_price || matchingProd?.price || 0),
          unitsSold: 0,
          revenue: 0,
          stockCount: matchingProd?.stockCount ?? 10,
        };
        const qty = Number(it.quantity || 1);
        existing.unitsSold += qty;
        existing.revenue += Number(it.total_price || it.unit_price * qty || 0);
        salesMap.set(pid, existing);
      }
    }

    return Array.from(salesMap.values())
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);
  }, [orders, products]);

  // Dynamic Department Sales Breakdown
  const categoryRevenueBreakdown = useMemo(() => {
    const catMap = new Map<string, number>();
    let totalItemSales = 0;

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'refunded') continue;
      const items = o.order_items || o.items || [];
      for (const it of items) {
        const matchingProd = products.find((p) => p.id === it.product_id || p.name === it.product_name);
        const catName = matchingProd?.category || 'General Catalog';
        const rev = Number(it.total_price || it.unit_price * (it.quantity || 1) || 0);
        catMap.set(catName, (catMap.get(catName) || 0) + rev);
        totalItemSales += rev;
      }
    }

    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-teal-500'];
    return Array.from(catMap.entries()).map(([name, total], idx) => ({
      name,
      total,
      percentage: totalItemSales > 0 ? Math.round((total / totalItemSales) * 100) : 0,
      color: colors[idx % colors.length],
    }));
  }, [orders, products]);

  // Sync selectedOrderDetails into tracking & update forms
  useEffect(() => {
    if (selectedOrderDetails) {
      setCarrierInput(selectedOrderDetails.carrier || 'Shop Cart Express');
      setTrackingNumberInput(selectedOrderDetails.tracking_number || '');
      if (selectedOrderDetails.estimated_delivery_date) {
        try {
          const d = new Date(selectedOrderDetails.estimated_delivery_date);
          setEstDeliveryDateInput(d.toISOString().slice(0, 10));
        } catch {
          setEstDeliveryDateInput('');
        }
      } else {
        setEstDeliveryDateInput('');
      }
      setUpdateStatusInput(normalizeOrderStatus(selectedOrderDetails.status));
      setUpdateTitleInput('');
      setUpdateLocationInput('');
      setUpdateDescriptionInput('');
    }
  }, [selectedOrderDetails]);

  // Order Status Update (supports all 8 canonical statuses)
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const canonicalStatus = normalizeOrderStatus(newStatus);
      const res = await updateOrderStatus(orderId, canonicalStatus);
      if (res.success) {
        showToast(res.message, 'success');
        loadAdminData();
        if (
          selectedOrderDetails &&
          (selectedOrderDetails.id === orderId || selectedOrderDetails.order_number === orderId)
        ) {
          setSelectedOrderDetails((prev: any) => ({
            ...prev,
            status: canonicalStatus,
            shipment_updates: res.updatedOrder?.shipment_updates || prev.shipment_updates,
          }));
        }
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update order status', 'error');
    }
  };

  // Logistics & Tracking Update Handler
  const handleSaveTracking = async () => {
    if (!selectedOrderDetails) return;
    if (!trackingNumberInput.trim()) {
      showToast('Please enter a tracking number', 'error');
      return;
    }

    setIsSavingTracking(true);
    try {
      const orderId = selectedOrderDetails.id || selectedOrderDetails.order_number;
      const res = await updateOrderTracking(orderId, {
        trackingNumber: trackingNumberInput.trim(),
        carrier: carrierInput.trim(),
        estimatedDeliveryDate: estDeliveryDateInput ? new Date(estDeliveryDateInput).toISOString() : null,
      });

      if (res.success) {
        showToast('Tracking and delivery information updated in Supabase!', 'success');
        setSelectedOrderDetails((prev: any) => ({
          ...prev,
          tracking_number: trackingNumberInput.trim(),
          carrier: carrierInput.trim(),
          estimated_delivery_date: estDeliveryDateInput
            ? new Date(estDeliveryDateInput).toISOString()
            : prev.estimated_delivery_date,
        }));
        loadAdminData();
      } else {
        showToast(res.message, 'error');
      }
    } finally {
      setIsSavingTracking(false);
    }
  };

  // Add Shipment Update Handler
  const handlePublishShipmentUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderDetails) return;
    if (!updateTitleInput.trim()) {
      showToast('Please provide an update title (e.g. Arrived at Sort Hub)', 'error');
      return;
    }

    setIsPublishingUpdate(true);
    try {
      const orderId = selectedOrderDetails.id || selectedOrderDetails.order_number;
      const res = await addShipmentUpdate(orderId, {
        status: updateStatusInput,
        title: updateTitleInput.trim(),
        location: updateLocationInput.trim() || undefined,
        description: updateDescriptionInput.trim() || undefined,
      });

      if (res.success) {
        showToast('Shipment update published and synced with customer timeline!', 'success');
        const newEvent: ShipmentUpdate = res.update || {
          id: `upd-${Date.now()}`,
          status: updateStatusInput,
          title: updateTitleInput.trim(),
          location: updateLocationInput.trim(),
          description: updateDescriptionInput.trim(),
          timestamp: new Date().toISOString(),
        };
        setSelectedOrderDetails((prev: any) => ({
          ...prev,
          status: updateStatusInput,
          shipment_updates: [...(prev.shipment_updates || []), newEvent],
        }));
        setUpdateTitleInput('');
        setUpdateLocationInput('');
        setUpdateDescriptionInput('');
        loadAdminData();
      } else {
        showToast(res.message, 'error');
      }
    } finally {
      setIsPublishingUpdate(false);
    }
  };

  // UPI Payment Verification Handler (Reconciles 12-digit UTR with merchant bank ledger)
  const handleVerifyPendingPayment = async () => {
    if (!verifyingOrder) return;
    setIsProcessingVerify(true);
    const verifiedAt = new Date().toISOString();
    const verifiedBy = user?.email || 'admin@shopcart.com';
    const auditNotes = adminNotes.trim() || 'Verified against merchant bank statement.';

    try {
      // 1. Call server-side verification endpoint
      try {
        await fetch('/api/admin/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: verifyingOrder.id,
            paymentRecordId: verifyingOrder.payment_records?.[0]?.id,
            adminEmail: verifiedBy,
            notes: auditNotes,
          }),
        });
      } catch (apiErr) {
        console.warn('API verify-payment warning:', apiErr);
      }

      // 2. Direct Supabase verification
      if (isSupabaseConfigured()) {
        await supabase
          .from('orders')
          .update({
            payment_status: 'verified',
            status: 'confirmed',
            updated_at: verifiedAt,
          })
          .eq('id', verifyingOrder.id);

        await supabase
          .from('payment_records')
          .update({
            payment_status: 'verified',
            verified_at: verifiedAt,
            verified_by: verifiedBy,
            raw_details: {
              verifiedAt,
              verifiedBy,
              notes: auditNotes,
            },
          })
          .eq('order_id', verifyingOrder.id);
      } else {
        const local = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
        const updated = local.map((o: any) => {
          if (o.id === verifyingOrder.id || o.order_number === verifyingOrder.order_number) {
            return {
              ...o,
              status: 'confirmed',
              paymentStatus: 'verified',
              payment_records: [
                {
                  id: `pay-${Date.now()}`,
                  payment_status: 'verified',
                  payment_method: o.paymentMethod || 'gpay_upi',
                  amount: o.total_amount,
                  transaction_reference: o.transactionReference,
                  verified_at: verifiedAt,
                  verified_by: verifiedBy,
                },
              ],
            };
          }
          return o;
        });
        localStorage.setItem('shopcart_orders', JSON.stringify(updated));
      }

      showToast(
        `Payment verified! Order #${verifyingOrder.order_number || verifyingOrder.id} verified & confirmed.`,
        'success'
      );
      setVerifyingOrder(null);
      setAdminNotes('');
      loadAdminData();
    } catch (err: any) {
      showToast(err.message || 'Payment verification failed', 'error');
    } finally {
      setIsProcessingVerify(false);
    }
  };

  // Add Product Handler
  const handleCreateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodForm.name.trim() || !prodForm.brand.trim()) {
      showToast('Please provide product name and brand', 'error');
      return;
    }

    try {
      const cleanImages = prodImages.filter(Boolean);
      const res = await createAdminProduct(
        {
          name: prodForm.name.trim(),
          brand: prodForm.brand.trim(),
          category: prodForm.category,
          price: Number(prodForm.price),
          originalPrice: Number(prodForm.originalPrice),
          discountPercentage: Number(prodForm.discountPercentage),
          badge: prodForm.badge,
          shortDescription: prodForm.shortDescription || 'Curated premium product by Shop Cart.',
          fullDescription: prodForm.fullDescription || 'Crafted with precision and premium materials.',
          visualType: prodForm.visualType as any,
          images: cleanImages,
          image: cleanImages[0] || undefined,
        },
        Number(prodForm.stockCount)
      );

      if (res.success) {
        showToast(`Product "${prodForm.name}" created and synced with Supabase!`, 'success');
        setIsAddProductOpen(false);
        setProdImages(['', '', '', '']);
        setProdForm({
          name: '',
          brand: '',
          category: 'Electronics',
          price: 99.99,
          originalPrice: 129.99,
          discountPercentage: 23,
          stockCount: 15,
          visualType: 'headphones',
          badge: 'New',
          shortDescription: '',
          fullDescription: '',
        });
        loadAdminData();
      } else {
        showToast(res.error || 'Failed to create product', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving product', 'error');
    }
  };

  // Edit Product Handler
  const handleUpdateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      const cleanImages = editingProductImages.filter(Boolean);
      const res = await updateAdminProduct(
        editingProduct.id,
        {
          name: editingProduct.name,
          brand: editingProduct.brand,
          category: editingProduct.category,
          price: Number(editingProduct.price),
          originalPrice: Number(editingProduct.originalPrice),
          discountPercentage: Number(editingProduct.discountPercentage),
          badge: editingProduct.badge,
          shortDescription: editingProduct.shortDescription,
          fullDescription: editingProduct.fullDescription,
          visualType: editingProduct.visualType,
          images: cleanImages,
          image: cleanImages[0] || undefined,
        },
        Number(editingProduct.stockCount)
      );

      if (res.success) {
        showToast(`Product "${editingProduct.name}" updated successfully!`, 'success');
        setEditingProduct(null);
        setEditingProductImages(['', '', '', '']);
        loadAdminData();
      } else {
        showToast(res.error || 'Failed to update product', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating product', 'error');
    }
  };

  // Delete Product Handler
  const handleConfirmDeleteProduct = async () => {
    if (!deletingProductId) return;
    try {
      const res = await deleteAdminProduct(deletingProductId);
      if (res.success) {
        showToast('Product removed from catalog', 'success');
        setDeletingProductId(null);
        loadAdminData();
      } else {
        showToast(res.error || 'Failed to delete product', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error deleting product', 'error');
    }
  };

  // Quick Stock Adjustment
  const handleStockAdjust = async (productId: string, delta: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const newStock = Math.max(0, prod.stockCount + delta);

    try {
      await updateAdminStock(productId, newStock);
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, stockCount: newStock, inStock: newStock > 0 } : p))
      );
      showToast(`Stock updated to ${newStock} units`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to update stock', 'error');
    }
  };

  // Custom Restock Submit
  const handleSaveRestock = async () => {
    if (!restockProduct) return;
    setIsSavingRestock(true);
    try {
      const newStock = Math.max(0, restockProduct.stockCount + Number(restockAmount));
      await updateAdminStock(restockProduct.id, newStock);
      setProducts((prev) =>
        prev.map((p) => (p.id === restockProduct.id ? { ...p, stockCount: newStock, inStock: newStock > 0 } : p))
      );
      showToast(`Restocked ${restockProduct.name}. New level: ${newStock} units`, 'success');
      setRestockProduct(null);
    } catch (err: any) {
      showToast(err.message || 'Restock failed', 'error');
    } finally {
      setIsSavingRestock(false);
    }
  };

  // Add Category Handler
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const slug = newCatSlug.trim() || newCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newCat = {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      slug,
      description: newCatDesc.trim() || 'Curated collection',
      icon: 'LayoutGrid',
      count: 0,
    };

    if (isSupabaseConfigured()) {
      await supabase.from('categories').insert({
        id: newCat.id,
        name: newCat.name,
        slug: newCat.slug,
        description: newCat.description,
        icon: newCat.icon,
      });
    }

    setCategories((prev) => [...prev, newCat]);
    setIsAddCategoryOpen(false);
    setNewCatName('');
    setNewCatSlug('');
    setNewCatDesc('');
    showToast(`Category "${newCat.name}" created!`, 'success');
  };

  // Edit Category Handler
  const handleUpdateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCatName.trim()) return;

    const slug = editCatSlug.trim() || editCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const updated = {
      name: editCatName.trim(),
      slug,
      description: editCatDesc.trim(),
    };

    if (isSupabaseConfigured()) {
      await supabase
        .from('categories')
        .update(updated)
        .eq('id', editingCategory.id);
    }

    setCategories((prev) =>
      prev.map((c) => (c.id === editingCategory.id ? { ...c, ...updated } : c))
    );
    setEditingCategory(null);
    showToast(`Category "${updated.name}" updated in catalog!`, 'success');
  };

  // Delete Category Handler
  const handleDeleteCategory = async (cat: any) => {
    const countInCat = products.filter(
      (p) => p.category === cat.name || (p as any).category_id === cat.id
    ).length;

    if (countInCat > 0) {
      showToast(
        `Cannot delete "${cat.name}": ${countInCat} active products belong to this category. Please reassign or delete them first.`,
        'error'
      );
      setDeletingCategory(null);
      return;
    }

    if (isSupabaseConfigured()) {
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) {
        showToast('Failed to delete category: ' + error.message, 'error');
        setDeletingCategory(null);
        return;
      }
    }

    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setDeletingCategory(null);
    showToast(`Category "${cat.name}" removed from catalog`, 'info');
  };

  // Reject Payment Handler (Rejects invalid/fraudulent UTR references with reasons)
  const handleRejectPendingPayment = async () => {
    const targetOrder = rejectingOrder || verifyingOrder;
    if (!targetOrder) return;
    setIsProcessingVerify(true);
    const reasonText = rejectionReason.trim() || adminNotes.trim() || '12-digit UTR not found in merchant bank ledger / unverified deposit';
    const rejectedAt = new Date().toISOString();
    const rejectedBy = user?.email || 'admin@shopcart.com';

    try {
      // 1. Call server-side rejection endpoint
      try {
        await fetch('/api/admin/reject-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: targetOrder.id,
            paymentRecordId: targetOrder.payment_records?.[0]?.id,
            adminEmail: rejectedBy,
            reason: reasonText,
          }),
        });
      } catch (apiErr) {
        console.warn('API reject-payment warning:', apiErr);
      }

      // 2. Direct Supabase update
      if (isSupabaseConfigured()) {
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            payment_status: 'rejected',
            updated_at: rejectedAt,
          })
          .eq('id', targetOrder.id);

        await supabase
          .from('payment_records')
          .update({
            payment_status: 'rejected',
            raw_details: {
              rejectedAt,
              rejectedBy,
              rejectionReason: reasonText,
            },
          })
          .eq('order_id', targetOrder.id);
      } else {
        const local = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
        const updated = local.map((o: any) => {
          if (o.id === targetOrder.id || o.order_number === targetOrder.order_number) {
            return {
              ...o,
              status: 'cancelled',
              paymentStatus: 'rejected',
              rejectionReason: reasonText,
              payment_records: (o.payment_records || []).map((p: any) => ({
                ...p,
                payment_status: 'rejected',
                rejection_reason: reasonText,
                rejected_at: rejectedAt,
                rejected_by: rejectedBy,
              })),
            };
          }
          return o;
        });
        localStorage.setItem('shopcart_orders', JSON.stringify(updated));
      }

      showToast(`Payment rejected for Order #${targetOrder.order_number || targetOrder.id}. Order marked Cancelled.`, 'info');
      setVerifyingOrder(null);
      setRejectingOrder(null);
      setAdminNotes('');
      setRejectionReason('');
      loadAdminData();
    } catch (err: any) {
      showToast(err.message || 'Payment rejection failed', 'error');
    } finally {
      setIsProcessingVerify(false);
    }
  };

  // Save Merchant UPI Settings Handler
  const handleSaveMerchantSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMerchantSettings(true);
    try {
      const res = await fetch('/api/admin/merchant-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merchantSettingsForm),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setMerchantSettings(data.settings);
        showToast('Merchant payment configuration saved successfully!', 'success');
        setIsMerchantSettingsOpen(false);
      } else {
        showToast(data.error || 'Failed to save merchant settings', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving merchant settings', 'error');
    } finally {
      setIsSavingMerchantSettings(false);
    }
  };

  // Request Replacement Screenshot Handler
  const handleSendScreenshotRequest = async () => {
    if (!requestingScreenshotOrder) return;
    setIsSendingScreenshotRequest(true);
    try {
      const res = await fetch('/api/admin/request-new-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: requestingScreenshotOrder.order_number,
          orderId: requestingScreenshotOrder.id,
          message: requestMessage.trim() || 'Please upload a clearer receipt screenshot showing full 12-digit UTR and transfer amount.',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Replacement receipt requested for Order #${requestingScreenshotOrder.order_number}`, 'success');
        setRequestingScreenshotOrder(null);
        setRequestMessage('');
        loadAdminData();
      } else {
        showToast(data.error || 'Failed to send request', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error sending request', 'error');
    } finally {
      setIsSendingScreenshotRequest(false);
    }
  };

  // Admin Profile Save Handler
  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSavingAdminProfile(true);
    try {
      if (isSupabaseConfigured()) {
        const ok = await updateCustomerProfile(user.id, {
          name: adminFullName.trim(),
          phone: adminPhone.trim(),
          avatar: adminAvatar.trim(),
        });
        if (ok) {
          await refreshProfile();
          showToast('Administrator profile updated in Supabase public.profiles!', 'success');
        } else {
          showToast('Failed to update administrator profile', 'error');
        }
      } else {
        showToast('Administrator profile saved locally', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Profile update failed', 'error');
    } finally {
      setIsSavingAdminProfile(false);
    }
  };

  // Navigation Item List
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: Package, badge: pendingOrders > 0 ? pendingOrders : null },
    { id: 'products', label: 'Products', icon: ShoppingBag, count: products.length },
    { id: 'categories', label: 'Categories', icon: Layers, count: categories.length },
    { id: 'customers', label: 'Customers', icon: Users, count: customers.length },
    { id: 'inventory', label: 'Inventory', icon: Boxes, badge: lowStockProducts > 0 ? `${lowStockProducts} Low` : null },
    { id: 'payments', label: 'Payments', icon: CreditCard, badge: pendingUpiPayments.length > 0 ? `${pendingUpiPayments.length} Check` : null },
    { id: 'analytics', label: 'Sales Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Admin Profile', icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans selection:bg-emerald-500 selection:text-white">
      {/* --------------------------------------------------------------------- */}
      {/* MOBILE TOP BAR (FOR SMALL SCREENS & TABLETS) */}
      {/* --------------------------------------------------------------------- */}
      <div className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Toggle navigation drawer"
          >
            {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0b5c37] flex items-center justify-center text-white font-black text-xs shadow-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-base font-black tracking-tight text-white">
              Shop<span className="text-[#0b5c37]">cart</span> Admin
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('shop')}
            className="text-xs font-semibold px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1 transition-colors"
          >
            <Store className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px]">Store</span>
          </button>
          <button
            onClick={loadAdminData}
            className="p-1.5 bg-slate-800 text-slate-300 rounded-lg"
            title="Refresh database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-slate-950/70 z-40 backdrop-blur-xs animate-in fade-in duration-150"
        />
      )}

      {/* --------------------------------------------------------------------- */}
      {/* SIDEBAR NAVIGATION (DARK NAVY AMAZON/ENTERPRISE MERCHANT STYLE) */}
      {/* --------------------------------------------------------------------- */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800/90 shrink-0 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 sm:p-5 space-y-6 overflow-y-auto">
          {/* Brand Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0b5c37] flex items-center justify-center text-white font-black shadow-md shadow-emerald-900/10">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-black tracking-tight text-white block leading-none">
                  Shop<span className="text-[#0b5c37]">cart</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                  Merchant Console
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5" title="Supabase Database Status">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSupabaseConfigured() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="text-[10px] font-mono font-bold text-slate-400">
                {isSupabaseConfigured() ? 'LIVE' : 'DEMO'}
              </span>
            </div>
          </div>

          {/* Admin Identity Card */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 border border-[#0b5c37]/20 flex items-center justify-center font-bold text-xs shrink-0">
              {user?.avatar || (user?.name || 'AD').substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'Administrator'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                  {user?.role || 'Admin'}
                </span>
                <span className="text-[10px] text-slate-400 truncate">{user?.email || 'admin@shopcart.com'}</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-3 py-1">
              Operations &amp; Catalog
            </div>

            {navItems.map((nav) => {
              const Icon = nav.icon;
              const isActive = activeSection === nav.id;

              return (
                <button
                  key={nav.id}
                  onClick={() => {
                    handleSelectSection(nav.id as AdminSection);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0b5c37] text-white shadow-md shadow-emerald-900/10'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{nav.label}</span>
                  </div>

                  {nav.badge && (
                    <span
                      className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-white text-[#08482b]'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {nav.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer shortcuts */}
        <div className="p-4 border-t border-slate-800 space-y-2 bg-slate-950/40">
          <button
            onClick={() => onNavigate('shop')}
            className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Store className="w-3.5 h-3.5 text-emerald-500" />
              <span>Customer Storefront</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <button
            onClick={async () => {
              await logout();
              showToast('Signed out of Administrator Console', 'info');
              onNavigate('admin-login');
            }}
            className="w-full py-2.5 px-3 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 hover:text-rose-100 rounded-xl text-xs font-semibold flex items-center justify-between border border-rose-900/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out Admin</span>
            </div>
            <span className="text-[10px] font-mono text-rose-400">Exit</span>
          </button>
        </div>
      </aside>

      {/* --------------------------------------------------------------------- */}
      {/* MAIN ADMIN WORKSPACE (CRISP WHITE AMAZON MERCHANT BACKGROUND) */}
      {/* --------------------------------------------------------------------- */}
      <main className="flex-1 overflow-y-auto max-h-screen p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50 text-slate-900">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/90 bg-white -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 px-4 sm:px-6 lg:px-8 pt-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono font-bold tracking-wider text-[#0b5c37]">
                Staff Console · {activeSection.toUpperCase()}
              </span>
              <button
                onClick={() => onOpenSupabaseModal?.()}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border cursor-pointer transition-colors ${
                  isSupabaseConfigured()
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
                title="Click to view or update Supabase database connection"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span>{isSupabaseConfigured() ? 'LIVE SUPABASE (POSTGRESQL)' : 'LOCAL STORAGE FALLBACK'}</span>
              </button>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1 capitalize">
              {activeSection === 'dashboard'
                ? 'Store Overview & Metrics'
                : activeSection === 'analytics'
                ? 'Sales & Revenue Analytics'
                : activeSection === 'settings'
                ? 'Admin Profile & Security'
                : `${activeSection} Management`}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onOpenSupabaseModal?.()}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              title="Open Supabase Database Configuration & Diagnostics"
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Database Config</span>
            </button>

            <button
              onClick={loadAdminData}
              disabled={isLoading}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
              title="Refresh all database tables"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0b5c37]' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">Sync Database</span>
            </button>

            {activeSection === 'products' && (
              <button
                onClick={() => setIsAddProductOpen(true)}
                className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
            )}

            {activeSection === 'categories' && (
              <button
                onClick={() => setIsAddCategoryOpen(true)}
                className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Category</span>
              </button>
            )}

            <button
              onClick={() => onNavigate('shop')}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">View Store</span>
            </button>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 1. DASHBOARD OVERVIEW (ALL 7 CORE METRICS + RECENT ORDERS) */}
        {/* ===================================================================== */}
        {activeSection === 'dashboard' && (
          <div className="space-y-6">
            {/* 7 Core KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Total Revenue */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Revenue</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {formatPrice(totalRevenue)}
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Gross settled transactions</span>
                </div>
              </div>

              {/* 2. Total Orders */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Orders</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">{totalOrders}</div>
                <div className="text-[11px] text-slate-500">All customer orders placed</div>
              </div>

              {/* 3. Pending Orders */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider">Pending Orders</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-amber-600 tabular-nums">{pendingOrders}</div>
                <div className="text-[11px] text-amber-600 font-medium">
                  {pendingOrders > 0 ? 'Requires fulfillment or UPI check' : 'All orders clear'}
                </div>
              </div>

              {/* 4. Delivered Orders */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider">Delivered Orders</span>
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">{deliveredOrders}</div>
                <div className="text-[11px] text-purple-700 font-semibold">Completed &amp; delivered</div>
              </div>

              {/* 5. Total Products */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Products</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0b5c37] flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">{totalProducts}</div>
                <div className="text-[11px] text-slate-500">Active storefront catalog</div>
              </div>

              {/* 6. Total Customers */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Customers</span>
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">{totalCustomers}</div>
                <div className="text-[11px] text-teal-700">Registered customer accounts</div>
              </div>

              {/* 7. Low Stock Products */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-2 col-span-2 lg:col-span-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Low Stock Products (≤ 5 units)
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-black text-rose-600 tabular-nums">
                    {lowStockProducts} item{lowStockProducts === 1 ? '' : 's'}
                  </div>
                  <button
                    onClick={() => handleSelectSection('inventory')}
                    className="text-xs font-bold text-[#0b5c37] hover:text-[#08482b] cursor-pointer"
                  >
                    Manage Inventory →
                  </button>
                </div>
                <div className="text-[11px] text-slate-500">
                  Critical threshold items requiring replenishment
                </div>
              </div>
            </div>

            {/* Quick Action Banner: UPI Verification & Security Warning */}
            {pendingUpiPayments.length > 0 && (
              <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold text-amber-900">
                      {pendingUpiPayments.length} Google Pay UPI QR Payment(s) Awaiting Verification
                    </h3>
                    <p className="text-[11px] text-amber-800 max-w-xl">
                      Confirm that the 12-digit UTR transaction reference matches incoming credits in your merchant bank statement before releasing shipments.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleSelectSection('payments')}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
                >
                  Review Payments ({pendingUpiPayments.length})
                </button>
              </div>
            )}

            {/* Recent Orders Preview */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden space-y-4 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Recent Customer Orders</h3>
                  <p className="text-xs text-slate-500">Latest storefront checkout transactions</p>
                </div>
                <button
                  onClick={() => handleSelectSection('orders')}
                  className="text-xs font-bold text-[#0b5c37] hover:text-[#08482b] cursor-pointer"
                >
                  View All Orders →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[10px] border-y border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Method &amp; Ref</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.slice(0, 5).map((ord) => {
                      const pay = ord.payment_records?.[0] || {};
                      const isVerified = pay.payment_status === 'verified' || ord.paymentStatus === 'verified';
                      const pMethod = ord.paymentMethod || pay.payment_method;
                      const ref = pay.transaction_reference || ord.transactionReference || 'N/A';

                      return (
                        <tr key={ord.id || ord.order_number} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            #{ord.order_number || ord.id?.slice(0, 8)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {ord.shipping_address?.fullName || ord.guest_email || 'Customer'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {(pMethod.includes('phonepe') ? 'PhonePe' : 'Google Pay')} · {ref}
                          </td>
                          <td className="py-3 px-4 font-bold text-[#0b5c37] tabular-nums">
                            {formatPrice(ord.total_amount)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isVerified
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {isVerified ? 'Paid' : 'Pending Check'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {ord.status?.replace('_', ' ') || 'pending'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 2. ORDER MANAGEMENT (ALL 8 CANONICAL STATUSES + TRACKING) */}
        {/* ===================================================================== */}
        {activeSection === 'orders' && (
          <div className="space-y-5">
            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Search order #, customer, email, tracking..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full py-2 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All Orders' },
                  { id: 'order_placed', label: 'Order Placed' },
                  { id: 'confirmed', label: 'Confirmed' },
                  { id: 'processing', label: 'Processing' },
                  { id: 'shipped', label: 'Shipped' },
                  { id: 'out_for_delivery', label: 'Out for Delivery' },
                  { id: 'delivered', label: 'Delivered' },
                  { id: 'cancelled', label: 'Cancelled' },
                  { id: 'refunded', label: 'Refunded' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setOrderStatusFilter(st.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                      orderStatusFilter === st.id
                        ? 'bg-[#0b5c37] text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Order #</th>
                      <th className="py-3.5 px-4">Customer Details</th>
                      <th className="py-3.5 px-4">Method &amp; Ref</th>
                      <th className="py-3.5 px-4">Amount</th>
                      <th className="py-3.5 px-4">Tracking &amp; ETA</th>
                      <th className="py-3.5 px-4">Payment</th>
                      <th className="py-3.5 px-4">Order Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-xs text-slate-400">
                          No matching customer orders found.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((ord) => {
                        const pay = ord.payment_records?.[0] || {};
                        const pMethod = ord.paymentMethod || pay.payment_method || 'gpay_upi';
                        const isVerified = pay.payment_status === 'verified' || ord.paymentStatus === 'verified';
                        const ref = pay.transaction_reference || ord.transactionReference || 'N/A';
                        const currentStatus = normalizeOrderStatus(ord.status);

                        const formattedETA = ord.estimated_delivery_date
                          ? new Date(ord.estimated_delivery_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'In 3-4 days';

                        return (
                          <tr key={ord.id || ord.order_number} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              #{ord.order_number || ord.id?.slice(0, 8)}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">
                                {ord.shipping_address?.fullName || ord.guest_email || 'Customer'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {ord.shipping_address?.city}, {ord.shipping_address?.state || ord.shipping_address?.country}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-slate-800 uppercase text-[11px] block">
                                {pMethod.includes('phonepe') ? 'PhonePe (UPI)' : 'Google Pay (UPI)'}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 truncate max-w-[130px] block">
                                {ref}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-extrabold text-[#0b5c37] tabular-nums">
                              ${Number(ord.total_amount).toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4">
                              {ord.tracking_number ? (
                                <div>
                                  <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-slate-800">
                                    <Truck className="w-3.5 h-3.5 text-[#0b5c37] shrink-0" />
                                    <span>{ord.tracking_number}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {ord.carrier || 'Shop Cart Express'} · ETA: {formattedETA}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Not Assigned
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                  isVerified
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {isVerified ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                <span>{isVerified ? 'Paid' : 'Pending Check'}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <select
                                value={currentStatus}
                                onChange={(e) => handleUpdateOrderStatus(ord.id || ord.order_number, e.target.value)}
                                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-[#0b5c37] cursor-pointer font-medium"
                              >
                                <option value="order_placed">Order Placed</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="processing">Processing</option>
                                <option value="shipped">Shipped</option>
                                <option value="out_for_delivery">Out for Delivery</option>
                                <option value="delivered">Delivered</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="refunded">Refunded</option>
                              </select>
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2">
                              {!isVerified && (
                                <button
                                  onClick={() => setVerifyingOrder(ord)}
                                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors cursor-pointer"
                                  title="Verify bank credit & mark as paid"
                                >
                                  Verify UPI
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedOrderDetails(ord)}
                                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#08482b] border border-emerald-200 font-bold text-[11px] rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                              >
                                <Truck className="w-3 h-3 text-[#0b5c37]" />
                                <span>Manage &amp; Track</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 3. PRODUCT MANAGEMENT */}
        {/* ===================================================================== */}
        {activeSection === 'products' && (
          <div className="space-y-5">
            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Search products by title, brand..."
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  className="w-full py-2 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  value={productCategoryFilter}
                  onChange={(e) => setProductCategoryFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0b5c37] cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setIsAddProductOpen(true)}
                  className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Product</span>
                </button>
              </div>
            </div>

            {/* Product Table */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Product</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Price / Disc.</th>
                      <th className="py-3.5 px-4">Stock Count</th>
                      <th className="py-3.5 px-4">Rating</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center font-bold text-[#0b5c37] text-xs shrink-0 overflow-hidden">
                              {(p.images && p.images[0]) || p.image ? (
                                <img
                                  src={p.images?.[0] || p.image}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                p.name.substring(0, 2).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 line-clamp-1">{p.name}</div>
                              <div className="text-[11px] text-slate-500">{p.brand}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{p.category}</td>
                        <td className="py-3.5 px-4 tabular-nums">
                          <div className="font-bold text-slate-900">{formatPrice(p.price)}</div>
                          {p.originalPrice > p.price && (
                            <div className="text-[10px] text-slate-400 line-through">
                              ${p.originalPrice}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 tabular-nums">
                          <span
                            className={`font-semibold ${
                              p.stockCount <= 5 ? 'text-rose-600 font-bold' : 'text-slate-700'
                            }`}
                          >
                            {p.stockCount} units
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-amber-500 font-semibold">★ {p.rating}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => {
                              setRestockProduct(p);
                              setRestockAmount(10);
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Restock Inventory"
                          >
                            <Boxes className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStartEditProduct(p)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingProductId(p.id)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* ===================================================================== */}
        {/* 4. CATEGORIES MANAGEMENT */}
        {/* ===================================================================== */}
        {activeSection === 'categories' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Store Departments &amp; Catalog Taxonomy</h3>
                <p className="text-xs text-slate-500">Manage categories, URL slugs, and navigation taxonomy</p>
              </div>
              <button
                onClick={() => setIsAddCategoryOpen(true)}
                className="px-3.5 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((c) => {
                const countInCat = products.filter((p) => p.category === c.name || (p as any).category_id === c.id).length;
                return (
                  <div
                    key={c.id || c.name}
                    className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0b5c37] border border-emerald-200 flex items-center justify-center font-bold">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingCategory(c);
                            setEditCatName(c.name || '');
                            setEditCatSlug(c.slug || '');
                            setEditCatDesc(c.description || '');
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit Category"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingCategory(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">{c.name}</h3>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          /{c.slug || c.id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {c.description || 'Curated storefront department'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{countInCat} Active Products</span>
                      <button
                        onClick={() => {
                          setProductCategoryFilter(c.name);
                          handleSelectSection('products');
                        }}
                        className="text-[#0b5c37] font-bold hover:underline cursor-pointer"
                      >
                        View Items →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 5. CUSTOMER ACCOUNTS */}
        {/* ===================================================================== */}
        {activeSection === 'customers' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Search customers by name, email..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="w-full py-2 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {filteredCustomers.length} Registered Customer Profiles
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Registered Date</th>
                      <th className="py-3 px-4 text-right">Orders &amp; Spend</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                          No registered customer accounts matching the search query.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((c) => {
                        const custOrders = orders.filter(
                          (o) => o.user_id === c.id || o.guest_email === c.email
                        );
                        const custSpend = custOrders.reduce(
                          (sum, o) => sum + Number(o.total_amount || 0),
                          0
                        );

                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              {c.full_name || 'Customer'}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-600">{c.email}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  c.role === 'admin'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {c.role || 'customer'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-500">{c.phone || '—'}</td>
                            <td className="py-3.5 px-4 text-slate-500">
                              {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Recent'}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <span className="font-bold text-slate-900 block tabular-nums">
                                {formatPrice(custSpend)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {custOrders.length} order{custOrders.length === 1 ? '' : 's'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => setViewingCustomer(c)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-[#0b5c37] hover:text-white text-slate-700 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                View History
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 6. INVENTORY MANAGEMENT */}
        {/* ===================================================================== */}
        {activeSection === 'inventory' && (
          <div className="space-y-5">
            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Search stock by product, brand, category..."
                  value={inventorySearchQuery}
                  onChange={(e) => setInventorySearchQuery(e.target.value)}
                  className="w-full py-2 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
                {[
                  { id: 'all', label: 'All Catalog' },
                  { id: 'low', label: 'Low Stock (≤ 5 units)' },
                  { id: 'out', label: 'Out of Stock (0)' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setInventoryFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                      inventoryFilter === f.id
                        ? 'bg-[#0b5c37] text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Product Stock &amp; Warehouse Inventory</h3>
                  <p className="text-xs text-slate-500">
                    Live inventory counts with automated stock deduction on checkout
                  </p>
                </div>
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Low Stock Alert: ≤ 5 units</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Product Name</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Price</th>
                      <th className="py-3.5 px-4">Stock Count</th>
                      <th className="py-3.5 px-4">Stock Status</th>
                      <th className="py-3.5 px-4 text-right">Quick Stock Adjustment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventoryProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                          No inventory items matching this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredInventoryProducts.map((p) => {
                        const isLow = p.stockCount <= 5;
                        const isOut = p.stockCount === 0;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-900 block">{p.name}</span>
                              <span className="text-[11px] text-slate-500">{p.brand}</span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">{p.category}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-800 tabular-nums">
                              {formatPrice(p.price)}
                            </td>
                            <td className="py-3.5 px-4 tabular-nums font-mono font-bold text-sm">
                              <span
                                className={
                                  isOut
                                    ? 'text-rose-600'
                                    : isLow
                                    ? 'text-amber-600'
                                    : 'text-emerald-700'
                                }
                              >
                                {p.stockCount}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  isOut
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : isLow
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-1.5">
                              <button
                                onClick={() => handleStockAdjust(p.id, -1)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-mono font-bold cursor-pointer transition-colors"
                                title="Decrease by 1"
                              >
                                -1
                              </button>
                              <button
                                onClick={() => handleStockAdjust(p.id, 5)}
                                className="px-2.5 py-1 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded font-bold cursor-pointer shadow-2xs transition-colors"
                                title="Restock +5 units"
                              >
                                +5 Stock
                              </button>
                              <button
                                onClick={() => {
                                  setRestockProduct(p);
                                  setRestockAmount(20);
                                }}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-bold cursor-pointer transition-colors"
                                title="Custom Restock Modal"
                              >
                                Restock...
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 7. PAYMENTS & VERIFICATION (UNIVERSAL UPI & AI FRAUD SCREENING) */}
        {/* ===================================================================== */}
        {activeSection === 'payments' && (
          <div className="space-y-5">
            {/* Filter Tabs, Search & Guide Banner */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0b5c37] border border-emerald-200 flex items-center justify-center">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Universal UPI Payment Reconciliation Hub</h3>
                    <p className="text-xs text-slate-500">
                      Audit settlements, Gemini AI fraud analysis, and verify 12-digit UTRs
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setMerchantSettingsForm({ ...merchantSettings });
                      setIsMerchantSettingsOpen(true);
                    }}
                    className="px-3 py-1.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Merchant UPI Settings</span>
                  </button>

                  {/* Gateway Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                    {[
                      { id: 'all', label: 'All Gateways' },
                      { id: 'all_upi', label: 'Universal UPI' },
                      { id: 'gpay', label: 'Google Pay' },
                      { id: 'phonepe', label: 'PhonePe' },
                      { id: 'paytm', label: 'Paytm' },
                      { id: 'bhim', label: 'BHIM' },
                      { id: 'other', label: 'Other UPI' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setPaymentGatewayFilter(tab.id as any)}
                        className={`px-2.5 py-1 font-bold rounded-lg transition-colors cursor-pointer text-xs ${
                          paymentGatewayFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={paymentSearchQuery}
                    onChange={(e) => setPaymentSearchQuery(e.target.value)}
                    placeholder="Search by Order ID, Customer, Email, or 12-digit UTR..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                  {paymentSearchQuery && (
                    <button
                      onClick={() => setPaymentSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono mr-1">
                    Status:
                  </span>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'pending_verification', label: 'Pending Verification' },
                    { id: 'verified', label: 'Verified' },
                    { id: 'rejected', label: 'Rejected' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setPaymentStatusFilter(st.id as any)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        paymentStatusFilter === st.id
                          ? 'bg-[#0b5c37] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protocol Alert */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Strict Fraud Prevention Protocol:</strong> AI screenshot analysis is a preliminary fraud screening tool only. All customer payments remain in <em>Pending Verification</em> until an administrator independently reconciles the 12-digit UTR reference against the official merchant bank ledger. Orders are never dispatched prior to bank confirmation.
                </p>
              </div>
            </div>

            {/* Payments Table */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">Order ID</th>
                      <th className="py-3 px-4">Gateway</th>
                      <th className="py-3 px-4">Screenshot</th>
                      <th className="py-3 px-4">AI Fraud Check</th>
                      <th className="py-3 px-4">12-Digit UTR</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPaymentOrders.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-xs text-slate-400">
                          No UPI payment records found matching the active filters.
                        </td>
                      </tr>
                    ) : (
                      filteredPaymentOrders.map((ord) => {
                        const pay = ord.payment_records?.[0] || {};
                        const pMethod = (ord.paymentMethod || pay.payment_method || 'all_upi').toLowerCase();
                        const isPhonePe = pMethod.includes('phonepe');
                        const isGPay = pMethod.includes('gpay');
                        const isPaytm = pMethod.includes('paytm');
                        const isBhim = pMethod.includes('bhim');
                        
                        const rawStatus = (pay.payment_status || ord.paymentStatus || '').toLowerCase();
                        const ordStatus = (ord.status || '').toLowerCase();
                        const isVerified = rawStatus === 'verified' || ordStatus === 'confirmed' || ordStatus === 'processing' || ordStatus === 'shipped' || ordStatus === 'delivered';
                        const isRejected = rawStatus === 'rejected' || rawStatus === 'failed' || ordStatus === 'cancelled';
                        const isPending = !isVerified && !isRejected;

                        const utrRef = pay.transaction_reference || ord.transactionReference || 'N/A';
                        const custName = ord.shipping_address?.fullName || ord.customer_name || 'Customer';
                        const custEmail = ord.guest_email || ord.user_id || 'N/A';
                        const submissionDate = ord.created_at ? new Date(ord.created_at).toLocaleDateString() : 'Recent';

                        const screenshotUrl = pay.screenshot_url || ord.screenshot_url || (pay.raw_details?.screenshotUrl);
                        const aiAnalysis: AIScreenshotAnalysis | undefined = pay.ai_analysis || ord.ai_analysis || (pay.raw_details?.aiAnalysis);

                        return (
                          <tr key={ord.id || ord.order_number} className="hover:bg-slate-50/70 transition-colors">
                            {/* Customer */}
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{custName}</div>
                              <div className="text-[11px] text-slate-500 font-mono truncate max-w-[130px]">{custEmail}</div>
                            </td>

                            {/* Order ID */}
                            <td className="py-3.5 px-4">
                              <button
                                onClick={() => setSelectedOrderDetails(ord)}
                                className="font-mono font-bold text-[#0b5c37] hover:underline cursor-pointer"
                              >
                                #{ord.order_number || ord.id?.slice(0, 8)}
                              </button>
                            </td>

                            {/* Payment Method */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isPhonePe ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  <Smartphone className="w-3 h-3 text-purple-600" />
                                  <span>PhonePe</span>
                                </span>
                              ) : isGPay ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  <QrCode className="w-3 h-3 text-blue-600" />
                                  <span>Google Pay</span>
                                </span>
                              ) : isPaytm ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                  <Smartphone className="w-3 h-3 text-sky-600" />
                                  <span>Paytm</span>
                                </span>
                              ) : isBhim ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <QrCode className="w-3 h-3 text-amber-600" />
                                  <span>BHIM UPI</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-[#0b5c37] border border-emerald-200">
                                  <QrCode className="w-3 h-3" />
                                  <span>Universal UPI</span>
                                </span>
                              )}
                            </td>

                            {/* Screenshot Thumbnail */}
                            <td className="py-3.5 px-4">
                              {screenshotUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setAdminZoomScreenshot(screenshotUrl)}
                                  className="relative group block cursor-pointer"
                                  title="Click to view full screenshot"
                                >
                                  <img
                                    src={screenshotUrl}
                                    alt="Payment Receipt"
                                    className="w-10 h-10 rounded-lg object-cover border border-slate-300 shadow-2xs group-hover:opacity-80 transition-opacity"
                                  />
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Eye className="w-3.5 h-3.5" />
                                  </span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">No Image</span>
                              )}
                            </td>

                            {/* AI Fraud Screening Verdict Badge */}
                            <td className="py-3.5 px-4">
                              {aiAnalysis ? (
                                <div className="space-y-0.5">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    aiAnalysis.recommended_action === 'DETAILS_MATCH'
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : aiAnalysis.recommended_action === 'REVIEW_REQUIRED'
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                                  }`}>
                                    <Sparkles className="w-3 h-3" />
                                    <span>
                                      {aiAnalysis.recommended_action === 'DETAILS_MATCH'
                                        ? 'Details Match'
                                        : aiAnalysis.recommended_action === 'REVIEW_REQUIRED'
                                        ? 'Review Req'
                                        : 'Fraud Risk'}
                                    </span>
                                  </span>
                                  <span className="text-[10px] text-slate-500 block font-mono">
                                    Score: {aiAnalysis.confidence_score}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">Manual Check</span>
                              )}
                            </td>

                            {/* 12-digit UTR with Copy button */}
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                <span className="tracking-wide text-xs">{utrRef}</span>
                                {utrRef !== 'N/A' && (
                                  <button
                                    onClick={() => {
                                      navigator.clipboard?.writeText(utrRef);
                                      showToast(`Copied UTR: ${utrRef}`, 'success');
                                    }}
                                    className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                                    title="Copy UTR to check bank ledger"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Amount */}
                            <td className="py-3.5 px-4 font-extrabold text-[#0b5c37] tabular-nums text-sm whitespace-nowrap">
                              {formatPrice(ord.total_amount)}
                            </td>

                            {/* Submission Date */}
                            <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                              {submissionDate}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isVerified ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Verified</span>
                                </span>
                              ) : isRejected ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 w-fit">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Rejected</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-fit animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  <span>Pending</span>
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setViewingPaymentOrder(ord)}
                                  className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                                  title="View Payment Details"
                                >
                                  View Details
                                </button>

                                {isPending && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setVerifyingOrder(ord);
                                        setAdminNotes('');
                                      }}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs"
                                      title="Verify UTR against merchant ledger"
                                    >
                                      Verify UTR
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRequestingScreenshotOrder(ord);
                                        setRequestMessage('');
                                      }}
                                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                                      title="Request clearer or replacement receipt screenshot"
                                    >
                                      Req Receipt
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRejectingOrder(ord);
                                        setRejectionReason('');
                                      }}
                                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                                      title="Reject invalid transaction"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 8. SALES ANALYTICS (REAL DATABASE AGGREGATIONS & TIME PERIODS) */}
        {/* ===================================================================== */}
        {activeSection === 'analytics' && (
          <div className="space-y-6">
            {/* Range Toggle & KPI Summary */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">Commercial Performance Analytics</h3>
                <p className="text-xs text-slate-500">Live aggregations computed directly from customer orders</p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                {(['7d', '30d', 'all'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setAnalyticsRange(r)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      analyticsRange === r
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'All Time'}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Period Revenue Breakdowns (Today, Week, Month, Year) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Today's Revenue</span>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {formatPrice(periodRevenueStats.todayRev)}
                </div>
                <div className="text-[10px] text-emerald-600 font-semibold">Today's settled gross</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">This Week (7 Days)</span>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {formatPrice(periodRevenueStats.weekRev)}
                </div>
                <div className="text-[10px] text-slate-500">Trailing 7-day volume</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">This Month (30 Days)</span>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {formatPrice(periodRevenueStats.monthRev)}
                </div>
                <div className="text-[10px] text-slate-500">Trailing 30-day volume</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Year-to-Date Gross</span>
                <div className="text-2xl font-black text-[#0b5c37] tabular-nums">
                  {formatPrice(periodRevenueStats.yearRev)}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold">Calendar year cumulative</div>
              </div>
            </div>

            {/* Core Commercial Ratios */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Revenue</span>
                <div className="text-2xl font-black text-slate-900 tabular-nums">{formatPrice(totalRevenue)}</div>
                <div className="text-[10px] text-slate-500">All-time settled orders</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Average Order Value (AOV)</span>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {formatPrice(totalOrders > 0 ? totalRevenue / totalOrders : 0)}
                </div>
                <div className="text-[10px] text-slate-500">Mean spend per checkout</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Settlement Rate</span>
                <div className="text-2xl font-black text-emerald-600 tabular-nums">
                  {totalOrders > 0
                    ? Math.round(((totalOrders - pendingUpiPayments.length) / totalOrders) * 100)
                    : 100}%
                </div>
                <div className="text-[10px] text-slate-500">Confirmed &amp; captured funds</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fulfillment Rate</span>
                <div className="text-2xl font-black text-blue-600 tabular-nums">
                  {totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0}%
                </div>
                <div className="text-[10px] text-slate-500">Delivered customer orders</div>
              </div>
            </div>

            {/* Dynamic Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Real Daily Revenue Trajectory */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">Revenue Trajectory</h4>
                    <p className="text-[11px] text-slate-500">Daily gross sales distribution across the past 7 days</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#0b5c37] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    INR (₹)
                  </span>
                </div>

                {orders.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                    <BarChart3 className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold text-slate-600">No Sales Transactions Recorded</p>
                    <p className="text-[11px] text-slate-400 max-w-xs">
                      When customers complete orders, daily revenue trajectories will appear here dynamically.
                    </p>
                  </div>
                ) : (
                  <div className="h-56 w-full pt-4 flex flex-col justify-between">
                    {/* SVG Bar Chart with real calculated scale */}
                    {(() => {
                      const maxDaily = Math.max(...dailyTrajectory.map((d) => d.total), 100);
                      return (
                        <div className="h-44 w-full flex items-end justify-between gap-2 px-2 pb-2 border-b border-slate-200">
                          {dailyTrajectory.map((d, i) => {
                            const barHeight = Math.max(8, Math.round((d.total / maxDaily) * 140));
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <span className="text-[9px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 whitespace-nowrap bg-slate-900 text-white px-1.5 py-0.5 rounded z-10">
                                  {formatPrice(d.total)} ({d.orderCount} ord)
                                </span>
                                <div
                                  style={{ height: `${barHeight}px` }}
                                  className={`w-full max-w-[40px] rounded-t-lg transition-all ${
                                    d.total > 0
                                      ? 'bg-gradient-to-t from-[#0b5c37] to-emerald-500 hover:to-emerald-400'
                                      : 'bg-slate-100'
                                  }`}
                                />
                                <span className="text-[10px] font-bold text-slate-600 truncate mt-1">
                                  {d.dayLabel}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Chart 2: Dynamic Category Sales Breakdown */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Department Sales Breakdown</h4>
                  <p className="text-[11px] text-slate-500">Revenue generation across active catalog categories</p>
                </div>

                {categoryRevenueBreakdown.length === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                    <PieChart className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold text-slate-600">No Category Breakdown Yet</p>
                    <p className="text-[11px] text-slate-400 max-w-xs">
                      Category share distribution will populate once customer orders are placed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5 pt-2 max-h-56 overflow-y-auto">
                    {categoryRevenueBreakdown.map((cat, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">{cat.name}</span>
                          <div className="space-x-2">
                            <span className="font-bold text-slate-900 tabular-nums">
                              {formatPrice(cat.total)}
                            </span>
                            <span className="text-slate-400 text-[11px]">({cat.percentage}%)</span>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${cat.color} rounded-full transition-all`}
                            style={{ width: `${Math.max(5, cat.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dynamic Top Selling Products Leaderboard */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-3">
              <h4 className="font-bold text-sm text-slate-900">Top Selling Products</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono tracking-wider text-[10px] border-y border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Price</th>
                      <th className="py-2.5 px-3">Stock Units</th>
                      <th className="py-2.5 px-3 text-right">Units Sold</th>
                      <th className="py-2.5 px-3 text-right">Gross Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topSellingProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                          No product checkout units recorded yet. Top sellers will dynamically rank here.
                        </td>
                      </tr>
                    ) : (
                      topSellingProducts.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            <span className="text-slate-400 font-mono mr-2">#{idx + 1}</span>
                            {p.name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{p.category}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 tabular-nums">
                            {formatPrice(p.price)}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-slate-600">{p.stockCount} units</td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#0b5c37] tabular-nums">
                            {p.unitsSold} sold
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 tabular-nums">
                            {formatPrice(p.revenue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 9. ADMIN PROFILE & SECURITY SETTINGS */}
        {/* ===================================================================== */}
        {activeSection === 'settings' && (
          <div className="space-y-6 max-w-4xl">
            {/* Admin Profile Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-[#0b5c37] text-white font-black text-lg flex items-center justify-center shadow-md shadow-emerald-900/10">
                    {adminAvatar || user?.avatar || (adminFullName || user?.name || 'AD').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{adminFullName || user?.name || 'Administrator'}</h3>
                    <p className="text-xs text-slate-500 font-mono">{user?.email || 'admin@shopcart.com'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200">
                        Role: {user?.role || 'admin'}
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                        RBAC Authorized
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    await logout();
                    showToast('Signed out of Administrator Console', 'info');
                    onNavigate('admin-login');
                  }}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>

              {/* Edit Admin Profile Form */}
              <form onSubmit={handleSaveAdminProfile} className="space-y-4 pt-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                  Update Administrator Credentials
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Full Name</label>
                    <input
                      type="text"
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      placeholder="e.g. Sarah Connor"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 234-5678"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Avatar Initials / Icon</label>
                    <input
                      type="text"
                      value={adminAvatar}
                      onChange={(e) => setAdminAvatar(e.target.value)}
                      placeholder="e.g. SC or URL"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSavingAdminProfile}
                    className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingAdminProfile ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Profile Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Database Health & Ping Test */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                      Supabase Database Connectivity
                    </h4>
                    <p className="text-[11px] text-slate-500">Real-time health check on public PostgreSQL tables</p>
                  </div>

                  <button
                    onClick={handlePingDatabase}
                    disabled={isPingingDb}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Activity className={`w-3.5 h-3.5 ${isPingingDb ? 'animate-spin text-emerald-500' : ''}`} />
                    <span>{isPingingDb ? 'Pinging...' : 'Test Database Latency'}</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Status</span>
                    <strong className="text-emerald-700 font-bold flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isSupabaseConfigured() ? 'Connected & Verified' : 'Local Sandbox Mode'}</span>
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Latency</span>
                    <span className="text-slate-900 font-mono font-bold mt-0.5 block">
                      {dbPingLatency !== null ? `${dbPingLatency} ms` : 'Not tested yet'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Security Model</span>
                    <span className="text-slate-900 font-mono font-bold mt-0.5 block">
                      10 Tables · RLS Active
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Storefront Parameters Box */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Store Parameters &amp; Shipping Rates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Store Name</label>
                  <input
                    type="text"
                    disabled
                    value="Shop Cart International"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Default Currency</label>
                  <input
                    type="text"
                    disabled
                    value="INR (₹)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Sales Tax Calculation</label>
                  <input
                    type="text"
                    disabled
                    value="8.0% (Automated checkout rate)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Free Shipping Threshold</label>
                  <input
                    type="text"
                    disabled
                    value="₹499.00 INR"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Supabase Security Status */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Security &amp; Authorization Enforcements</span>
              </div>
              <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
                <li>Server-side role verification queries PostgreSQL profiles table directly.</li>
                <li>Admin credentials and sensitive service role keys are never sent to the client browser.</li>
                <li>RLS policies block customers from accessing foreign orders or administrative inventory tables.</li>
                <li>Full-stack Express backend handles Google Pay &amp; PhonePe UPI verification and bank ledger reconciliation.</li>
                <li>Database trigger <code>trg_protect_user_role</code> prevents customer privilege escalation.</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 1: ORDER COMPLETE DETAILS & LOGISTICS TRACKING DRAWER */}
      {/* --------------------------------------------------------------------- */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-6 my-8 animate-in zoom-in-95 duration-200 text-slate-900 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0b5c37] flex items-center justify-center text-white shadow-md shadow-emerald-900/10">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase text-[#08482b] font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Order Management &amp; Tracking
                    </span>
                    <span className="text-xs text-slate-500">
                      Status: <strong className="text-slate-900 uppercase">{selectedOrderDetails.status || 'order_placed'}</strong>
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    Order #{selectedOrderDetails.order_number || selectedOrderDetails.id}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-medium">Update Status:</span>
                <select
                  value={normalizeOrderStatus(selectedOrderDetails.status)}
                  onChange={(e) =>
                    handleUpdateOrderStatus(
                      selectedOrderDetails.id || selectedOrderDetails.order_number,
                      e.target.value
                    )
                  }
                  className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-[#0b5c37] cursor-pointer"
                >
                  <option value="order_placed">1. Order Placed</option>
                  <option value="confirmed">2. Confirmed</option>
                  <option value="processing">3. Processing</option>
                  <option value="shipped">4. Shipped</option>
                  <option value="out_for_delivery">5. Out for Delivery</option>
                  <option value="delivered">6. Delivered</option>
                  <option value="cancelled">7. Cancelled</option>
                  <option value="refunded">8. Refunded</option>
                </select>
              </div>

              <div className="text-right">
                <span className="text-slate-500 text-xs block">Order Total:</span>
                <span className="text-base font-black text-[#0b5c37] tabular-nums">
                  {formatPrice(Number(selectedOrderDetails.total_amount))}
                </span>
              </div>
            </div>

            {/* FEATURE 1: LOGISTICS & TRACKING MANAGEMENT (Carrier, Tracking Number, ETA) */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#0b5c37]" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                    Logistics &amp; Tracking Management
                  </h4>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Syncs to Customer Portal</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Carrier Partner</label>
                  <select
                    value={carrierInput}
                    onChange={(e) => setCarrierInput(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0b5c37]"
                  >
                    <option value="Shop Cart Express">Shop Cart Express</option>
                    <option value="FedEx">FedEx</option>
                    <option value="UPS">UPS</option>
                    <option value="USPS">USPS</option>
                    <option value="DHL Express">DHL Express</option>
                    <option value="BlueDart">BlueDart</option>
                    <option value="Delhivery">Delhivery</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Tracking Number</label>
                  <input
                    type="text"
                    value={trackingNumberInput}
                    onChange={(e) => setTrackingNumberInput(e.target.value)}
                    placeholder="e.g. SC-TRK-8492019482"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Estimated Delivery Date</label>
                  <input
                    type="date"
                    value={estDeliveryDateInput}
                    onChange={(e) => setEstDeliveryDateInput(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0b5c37]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveTracking}
                  disabled={isSavingTracking}
                  className="px-4 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingTracking ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving in Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Tracking &amp; Delivery ETA</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* FEATURE 2: ADD SHIPMENT UPDATE FORM */}
            <form onSubmit={handlePublishShipmentUpdate} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#0b5c37]" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                    Add Real-Time Shipment Update
                  </h4>
                </div>
                <span className="text-[10px] text-emerald-700 font-mono">Appends to Customer Timeline</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Milestone Status</label>
                  <select
                    value={updateStatusInput}
                    onChange={(e) => setUpdateStatusInput(e.target.value as OrderStatus)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0b5c37] font-medium"
                  >
                    <option value="order_placed">Order Placed</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-600 mb-1">Update Title</label>
                  <input
                    type="text"
                    required
                    value={updateTitleInput}
                    onChange={(e) => setUpdateTitleInput(e.target.value)}
                    placeholder="e.g. Package arrived at local carrier facility"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Location (City, Facility)</label>
                  <input
                    type="text"
                    value={updateLocationInput}
                    onChange={(e) => setUpdateLocationInput(e.target.value)}
                    placeholder="e.g. Seattle Sort Center, WA"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Description / Courier Notes</label>
                  <input
                    type="text"
                    value={updateDescriptionInput}
                    onChange={(e) => setUpdateDescriptionInput(e.target.value)}
                    placeholder="e.g. Loaded onto delivery vehicle for residential delivery"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5c37]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isPublishingUpdate}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isPublishingUpdate ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Publish Shipment Update</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* LIVE TIMELINE LOG PREVIEW */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-600 uppercase font-mono tracking-wider">
                Live Timeline Activity ({(selectedOrderDetails.shipment_updates || []).length} Events)
              </span>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white max-h-48 overflow-y-auto">
                {!selectedOrderDetails.shipment_updates || selectedOrderDetails.shipment_updates.length === 0 ? (
                  <div className="p-3 text-xs text-slate-400 text-center">No updates logged yet.</div>
                ) : (
                  [...selectedOrderDetails.shipment_updates]
                    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((evt: any, idx: number) => (
                      <div key={idx} className="p-3 text-xs flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-emerald-100 text-[#0b5c37] flex items-center justify-center shrink-0 mt-0.5">
                          <Truck className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{evt.title}</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(evt.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {evt.description && <p className="text-[11px] text-slate-600 mt-0.5">{evt.description}</p>}
                          {evt.location && (
                            <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>{evt.location}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Customer & Shipping Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="space-y-1">
                <span className="text-slate-500 block uppercase font-mono text-[10px]">Customer</span>
                <strong className="text-slate-900 block">
                  {selectedOrderDetails.shipping_address?.fullName || selectedOrderDetails.guest_email || 'Customer'}
                </strong>
                <p className="text-slate-600 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedOrderDetails.guest_email || 'Verified account'}</span>
                </p>
                <p className="text-slate-600 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedOrderDetails.shipping_address?.phone || 'No phone provided'}</span>
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 block uppercase font-mono text-[10px]">Delivery Destination</span>
                <p className="text-slate-900 font-medium">
                  {selectedOrderDetails.shipping_address?.street || selectedOrderDetails.shipping_address?.address}
                </p>
                <p className="text-slate-600">
                  {selectedOrderDetails.shipping_address?.city}, {selectedOrderDetails.shipping_address?.state}{' '}
                  {selectedOrderDetails.shipping_address?.postalCode}
                </p>
                <p className="text-slate-600">{selectedOrderDetails.shipping_address?.country}</p>
              </div>
            </div>

            {/* Ordered Products List */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-600 uppercase font-mono tracking-wider">
                Ordered Products ({selectedOrderDetails.order_items?.length || 1})
              </span>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl p-3 bg-slate-50 max-h-48 overflow-y-auto">
                {(selectedOrderDetails.order_items || []).map((it: any, idx: number) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs first:pt-1 last:pb-1">
                    <div>
                      <span className="font-bold text-slate-900 block">{it.product_name}</span>
                      <span className="text-slate-500 text-[11px]">
                        Qty: {it.quantity} · ${Number(it.unit_price).toFixed(2)} each
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">
                      ${Number(it.total_price || it.unit_price * it.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2A: VIEW PAYMENT DETAILS MODAL */}
      {/* --------------------------------------------------------------------- */}
      {viewingPaymentOrder && (() => {
        const pay = viewingPaymentOrder.payment_records?.[0] || {};
        const pMethod = (viewingPaymentOrder.paymentMethod || pay.payment_method || 'gpay_upi').toLowerCase();
        const isPhonePe = pMethod.includes('phonepe');
        const rawStatus = (pay.payment_status || viewingPaymentOrder.paymentStatus || '').toLowerCase();
        const ordStatus = (viewingPaymentOrder.status || '').toLowerCase();
        const isVerified = rawStatus === 'verified' || ordStatus === 'confirmed' || ordStatus === 'processing' || ordStatus === 'shipped' || ordStatus === 'delivered';
        const isRejected = rawStatus === 'rejected' || rawStatus === 'failed' || ordStatus === 'cancelled';
        const utrRef = pay.transaction_reference || viewingPaymentOrder.transactionReference || 'N/A';
        const raw = pay.raw_details || {};
        const screenshotUrl = pay.screenshot_url || viewingPaymentOrder.screenshot_url || raw.screenshotUrl;
        const aiAnalysis: AIScreenshotAnalysis | undefined = pay.ai_analysis || viewingPaymentOrder.ai_analysis || raw.aiAnalysis;

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-slate-900 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isPhonePe ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-[#0b5c37]'
                  }`}>
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">Payment Reconciliation &amp; Fraud Audit</h3>
                    <p className="text-xs text-slate-500">Order #{viewingPaymentOrder.order_number || viewingPaymentOrder.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingPaymentOrder(null)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Banner */}
              <div className={`p-3.5 rounded-2xl border flex items-center gap-3 text-xs ${
                isVerified
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : isRejected
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                {isVerified ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : isRejected ? (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <p className="font-bold">
                    {isVerified
                      ? 'Payment Status: Verified & Settled'
                      : isRejected
                      ? 'Payment Status: Rejected'
                      : 'Payment Status: Pending Administrator Ledger Reconciliation'}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {isVerified
                      ? `Reconciled and confirmed against official merchant bank statement.`
                      : isRejected
                      ? `Transaction rejected: ${raw.rejectionReason || viewingPaymentOrder.rejectionReason || 'UTR not found in bank ledger'}`
                      : 'Awaiting human administrator bank ledger verification prior to order confirmation.'}
                  </p>
                </div>
              </div>

              {/* Uploaded Receipt & Gemini AI Fraud Screening Section */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#0b5c37]" />
                    <span>Receipt Screenshot &amp; Gemini 3.8 Flash AI Screening</span>
                  </span>
                  {aiAnalysis && (
                    <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                      Score: {aiAnalysis.confidence_score}%
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  {/* Screenshot thumbnail */}
                  {screenshotUrl ? (
                    <div className="shrink-0 space-y-1">
                      <div
                        onClick={() => setAdminZoomScreenshot(screenshotUrl)}
                        className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden border border-slate-300 relative group cursor-pointer shadow-xs bg-slate-900 flex items-center justify-center"
                      >
                        <img
                          src={screenshotUrl}
                          alt="Customer Receipt Screenshot"
                          className="w-full h-full object-cover group-hover:opacity-85 transition-opacity"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[11px] font-bold gap-1">
                          <Eye className="w-4 h-4" />
                          <span>Zoom</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAdminZoomScreenshot(screenshotUrl)}
                        className="text-[10px] text-[#0b5c37] hover:underline block text-center w-full font-bold cursor-pointer"
                      >
                        Inspect Full Image
                      </button>
                    </div>
                  ) : (
                    <div className="w-28 h-28 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 p-2 text-center text-[10px]">
                      <FileImage className="w-6 h-6 mb-1 opacity-50" />
                      <span>No Screenshot Uploaded</span>
                    </div>
                  )}

                  {/* AI Analysis Breakdown */}
                  <div className="flex-1 space-y-2 text-xs">
                    {aiAnalysis ? (
                      <div className="space-y-2">
                        <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                          aiAnalysis.recommended_action === 'DETAILS_MATCH'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                            : aiAnalysis.recommended_action === 'REVIEW_REQUIRED'
                            ? 'bg-amber-50 border-amber-200 text-amber-950'
                            : 'bg-rose-50 border-rose-200 text-rose-950'
                        }`}>
                          <span>AI Recommendation: {aiAnalysis.recommended_action.replace('_', ' ')}</span>
                          <span className="font-mono">{aiAnalysis.confidence_score}%</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="bg-white p-2 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block text-[10px] font-mono uppercase">Detected App</span>
                            <strong className="text-slate-900">{aiAnalysis.extracted_app || 'UPI App'}</strong>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block text-[10px] font-mono uppercase">Amount Verification</span>
                            <strong className={aiAnalysis.amount_matches ? 'text-emerald-700' : 'text-rose-700 font-bold'}>
                              {aiAnalysis.amount_matches ? 'Matches Total' : `₹${aiAnalysis.extracted_amount} (Mismatch)`}
                            </strong>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block text-[10px] font-mono uppercase">Extracted UTR</span>
                            <strong className="font-mono text-slate-900 truncate block">
                              {aiAnalysis.extracted_utr || 'Not Found'}
                            </strong>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block text-[10px] font-mono uppercase">Payee Check</span>
                            <strong className={aiAnalysis.merchant_matches ? 'text-emerald-700' : 'text-amber-700'}>
                              {aiAnalysis.merchant_matches ? 'Merchant Matches' : 'Unconfirmed Payee'}
                            </strong>
                          </div>
                        </div>

                        {aiAnalysis.ai_summary && (
                          <p className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 leading-relaxed">
                            <strong>AI Analysis:</strong> {aiAnalysis.ai_summary}
                          </p>
                        )}

                        {aiAnalysis.suspicious_indicators && aiAnalysis.suspicious_indicators.length > 0 && (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-900">
                            <span className="font-bold block mb-0.5">Suspicious Flags:</span>
                            <ul className="list-disc list-inside space-y-0.5">
                              {aiAnalysis.suspicious_indicators.map((ind, i) => (
                                <li key={i}>{ind}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-[11px] italic bg-white p-3 rounded-xl border border-slate-200">
                        No automated AI fraud analysis is stored for this transaction. Please manually inspect the 12-digit UTR against your merchant bank statement.
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <p>
                    <strong>Mandatory Protocol:</strong> AI assessment is a preliminary risk check only. Never mark an order paid based only on a screenshot or AI recommendation. Direct bank account ledger verification is required before confirming payment and dispatching goods.
                  </p>
                </div>
              </div>

              {/* Transaction Metrics */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Payment Gateway:</span>
                  <span className="font-bold text-slate-900 capitalize">
                    {pMethod.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Payable Amount:</span>
                  <strong className="text-[#0b5c37] font-extrabold text-sm tabular-nums">
                    {formatPrice(Number(viewingPaymentOrder.total_amount))}
                  </strong>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                  <span className="text-slate-500">12-Digit UTR Reference:</span>
                  <div className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    <span>{utrRef}</span>
                    {utrRef !== 'N/A' && (
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(utrRef);
                          showToast(`Copied UTR: ${utrRef}`, 'success');
                        }}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Copy UTR"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-semibold text-slate-900">
                    {viewingPaymentOrder.shipping_address?.fullName || viewingPaymentOrder.customer_name || 'Customer'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Contact Email:</span>
                  <span className="font-mono text-slate-700">
                    {viewingPaymentOrder.guest_email || viewingPaymentOrder.user_id || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Submitted Timestamp:</span>
                  <span className="text-slate-700">
                    {viewingPaymentOrder.created_at ? new Date(viewingPaymentOrder.created_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
                {raw.verifiedAt && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Verified At / By:</span>
                    <span className="text-slate-700 text-[11px]">
                      {new Date(raw.verifiedAt).toLocaleString()} ({raw.verifiedBy || 'Administrator'})
                    </span>
                  </div>
                )}
                {raw.adminNotes && (
                  <div className="pt-1 border-t border-slate-200 text-slate-600">
                    <span className="text-slate-500 block mb-0.5">Admin Ledger Notes:</span>
                    <p className="bg-white p-2 rounded-lg border border-slate-200 text-[11px] font-mono">{raw.adminNotes}</p>
                  </div>
                )}
              </div>

              {/* Order Items Preview */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase font-mono tracking-wider">
                  Order Items ({viewingPaymentOrder.order_items?.length || 1})
                </span>
                <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 text-xs">
                  {(viewingPaymentOrder.order_items || []).map((it: any, idx: number) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="text-slate-800 font-medium">{it.product_name} × {it.quantity}</span>
                      <span className="font-mono text-slate-900 font-bold">{formatPrice(it.total_price || it.unit_price * it.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setViewingPaymentOrder(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Close
                </button>
                {!isVerified && !isRejected && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const target = viewingPaymentOrder;
                        setViewingPaymentOrder(null);
                        setRequestingScreenshotOrder(target);
                        setRequestMessage('');
                      }}
                      className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl border border-amber-200 cursor-pointer"
                    >
                      Request Clearer Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const target = viewingPaymentOrder;
                        setViewingPaymentOrder(null);
                        setRejectingOrder(target);
                        setRejectionReason('');
                      }}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 cursor-pointer"
                    >
                      Reject Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const target = viewingPaymentOrder;
                        setViewingPaymentOrder(null);
                        setVerifyingOrder(target);
                        setAdminNotes('');
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs"
                    >
                      Reconcile &amp; Verify UTR
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2B: MANUAL UPI VERIFICATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {verifyingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Manual UPI Payment Verification</h3>
                <p className="text-xs text-slate-500">Order #{verifyingOrder.order_number || verifyingOrder.id}</p>
              </div>
            </div>

            {/* Strict Anti-Fraud Rule */}
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Strict Security Protocol</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Confirm that this 12-digit UTR reference appears in your merchant bank account statement before approving. Never approve solely based on customer claims.
              </p>
            </div>

            {/* Data summary */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Transferred:</span>
                <strong className="text-[#0b5c37] font-extrabold text-sm tabular-nums">
                  {formatPrice(Number(verifyingOrder.total_amount))}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Gateway:</span>
                <strong className="text-slate-900">
                  {(verifyingOrder.paymentMethod || verifyingOrder.payment_records?.[0]?.payment_method || '').includes('phonepe')
                    ? 'PhonePe (UPI)'
                    : 'Google Pay (UPI)'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-slate-900">
                  {verifyingOrder.shipping_address?.fullName || verifyingOrder.guest_email || 'Customer'}
                </strong>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="text-slate-500">Submitted 12-Digit UTR:</span>
                <div className="inline-flex items-center gap-1.5">
                  <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {verifyingOrder.payment_records?.[0]?.transaction_reference ||
                      verifyingOrder.transactionReference ||
                      'N/A'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const ref = verifyingOrder.payment_records?.[0]?.transaction_reference || verifyingOrder.transactionReference;
                      if (ref) {
                        navigator.clipboard?.writeText(ref);
                        showToast(`Copied UTR: ${ref}`, 'success');
                      }
                    }}
                    className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                    title="Copy UTR"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admin Audit Notes / Bank Ledger Reference
              </label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Verified with Merchant UPI statement at 11:45 AM"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVerifyingOrder(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = verifyingOrder;
                  setVerifyingOrder(null);
                  setRejectingOrder(target);
                  setRejectionReason('');
                }}
                className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 cursor-pointer transition-colors"
              >
                Reject Payment
              </button>
              <button
                type="button"
                onClick={handleVerifyPendingPayment}
                disabled={isProcessingVerify}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessingVerify ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm Credit &amp; Mark Verified</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2C: REJECT PAYMENT MODAL */}
      {/* --------------------------------------------------------------------- */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Reject Payment Reference</h3>
                <p className="text-xs text-slate-500">Order #{rejectingOrder.order_number || rejectingOrder.id}</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
              <p className="font-bold">Transaction Rejection Warning</p>
              <p className="text-[11px] leading-relaxed">
                Rejecting this transaction will mark the payment as <strong>Rejected</strong> and cancel the associated order. The customer will be informed that the UTR could not be reconciled.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Order Amount:</span>
                <strong className="text-slate-900 font-bold">{formatPrice(Number(rejectingOrder.total_amount))}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Submitted UTR:</span>
                <span className="font-mono font-bold text-rose-700">
                  {rejectingOrder.payment_records?.[0]?.transaction_reference || rejectingOrder.transactionReference || 'N/A'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rejection Reason (Required)
              </label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. 12-digit UTR not found in merchant bank ledger / amount mismatch"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-rose-500 focus:bg-white resize-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingOrder(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectPendingPayment}
                disabled={isProcessingVerify}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessingVerify ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2D: MERCHANT UPI SETTINGS CONFIGURATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {isMerchantSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#0b5c37] flex items-center justify-center shrink-0">
                  <Settings className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Merchant UPI Configuration</h3>
                  <p className="text-xs text-slate-500">Update verified store UPI ID, QR, and dynamic checkout settings</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMerchantSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMerchantSettings} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Merchant UPI ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={merchantSettingsForm.merchant_upi_id}
                  onChange={(e) => setMerchantSettingsForm({ ...merchantSettingsForm, merchant_upi_id: e.target.value })}
                  placeholder="e.g. shopcart.merchant@okaxis"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  The verified VPA handle displayed to customers on checkout.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Merchant Business Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={merchantSettingsForm.merchant_name}
                  onChange={(e) => setMerchantSettingsForm({ ...merchantSettingsForm, merchant_name: e.target.value })}
                  placeholder="e.g. Shop Cart Online Store"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Merchant UPI Registered Phone Number
                </label>
                <input
                  type="text"
                  value={merchantSettingsForm.merchant_upi_number}
                  onChange={(e) => setMerchantSettingsForm({ ...merchantSettingsForm, merchant_upi_number: e.target.value })}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Merchant QR Code Image URL
                </label>
                <input
                  type="text"
                  value={merchantSettingsForm.qr_image_url}
                  onChange={(e) => setMerchantSettingsForm({ ...merchantSettingsForm, qr_image_url: e.target.value })}
                  placeholder="e.g. /assets/aistudio/qr_eeef5752.jpeg"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-[11px] focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="enable_dynamic_qr"
                  checked={merchantSettingsForm.enable_dynamic_qr}
                  onChange={(e) => setMerchantSettingsForm({ ...merchantSettingsForm, enable_dynamic_qr: e.target.checked })}
                  className="accent-[#0b5c37] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="enable_dynamic_qr" className="cursor-pointer font-bold text-slate-800 text-xs">
                  Enable Dynamic Order-Linked QR Codes
                  <span className="block text-[11px] font-normal text-slate-500">
                    Automatically encodes the exact payable order amount and order reference into the QR code for seamless scanning.
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Payment Instructions for Customers
                </label>
                <textarea
                  rows={2}
                  value={merchantSettingsForm.instructions || ''}
                  onChange={(e) => setMerchantSettingsForm({ ...merchantSettingsForm, instructions: e.target.value })}
                  placeholder="Instructions displayed to customers during checkout..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMerchantSettingsOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMerchantSettings}
                  className="px-5 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingMerchantSettings ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Settings...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Configuration</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2E: REQUEST REPLACEMENT RECEIPT MODAL */}
      {/* --------------------------------------------------------------------- */}
      {requestingScreenshotOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-4 my-8 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <FileImage className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Request Replacement Receipt</h3>
                <p className="text-xs text-slate-500">Order #{requestingScreenshotOrder.order_number || requestingScreenshotOrder.id}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Notify the customer to upload a clearer or full payment receipt screenshot showing the 12-digit UPI UTR reference number and transfer status.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Instructions for Customer
              </label>
              <textarea
                rows={3}
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="e.g. Your uploaded receipt was cropped and the 12-digit UTR is unreadable. Please upload a full screenshot showing the bank transaction details."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRequestingScreenshotOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendScreenshotRequest}
                disabled={isSendingScreenshotRequest}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSendingScreenshotRequest ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Request...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Request to Customer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2F: ADMIN ZOOM SCREENSHOT PREVIEW */}
      {/* --------------------------------------------------------------------- */}
      {adminZoomScreenshot && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <FileImage className="w-4 h-4 text-[#0b5c37]" />
                <span>Payment Receipt High-Resolution Inspection</span>
              </h3>
              <button
                type="button"
                onClick={() => setAdminZoomScreenshot(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-2xl bg-slate-900 flex items-center justify-center p-3 border border-slate-800">
              <img
                src={adminZoomScreenshot}
                alt="Full Resolution Payment Receipt"
                className="max-h-[70vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 3: ADD PRODUCT MODAL */}
      {/* --------------------------------------------------------------------- */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#0b5c37]" />
                <h3 className="text-base font-bold text-slate-900">Add New Product to Catalog</h3>
              </div>
              <button
                onClick={() => setIsAddProductOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProductSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nova Wireless Studio Headphones"
                    value={prodForm.name}
                    onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Brand</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sony, Apple, Shop Cart"
                    value={prodForm.brand}
                    onChange={(e) => setProdForm({ ...prodForm, brand: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Category</label>
                  <select
                    value={prodForm.category}
                    onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Price (₹ INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={prodForm.price}
                    onChange={(e) => setProdForm({ ...prodForm, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Original Price (₹ INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={prodForm.originalPrice}
                    onChange={(e) => setProdForm({ ...prodForm, originalPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Initial Stock Count</label>
                  <input
                    type="number"
                    required
                    value={prodForm.stockCount}
                    onChange={(e) => setProdForm({ ...prodForm, stockCount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Visual Icon / Image Type</label>
                  <select
                    value={prodForm.visualType}
                    onChange={(e) => setProdForm({ ...prodForm, visualType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] cursor-pointer capitalize"
                  >
                    {[
                      'headphones',
                      'smartwatch',
                      'speaker',
                      'lamp',
                      'chair',
                      'backpack',
                      'serum',
                      'cream',
                      'coffee',
                      'glasses',
                      'coat',
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">Short Description</label>
                  <input
                    type="text"
                    placeholder="Brief 1-line promotional summary"
                    value={prodForm.shortDescription}
                    onChange={(e) => setProdForm({ ...prodForm, shortDescription: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                  />
                </div>
              </div>

              {/* Dedicated 4-Slot Product Image Gallery */}
              <div className="border-t border-slate-200 pt-3">
                <ProductImageGalleryEditor
                  images={prodImages}
                  onChange={setProdImages}
                  productId="new-product"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Save Product to Supabase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 4: EDIT PRODUCT MODAL */}
      {/* --------------------------------------------------------------------- */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#0b5c37]" />
                <h3 className="text-base font-bold text-slate-900">Edit Product</h3>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProductSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Brand</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.brand}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Category</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Price (₹ INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Original Price (₹ INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.originalPrice}
                    onChange={(e) => setEditingProduct({ ...editingProduct, originalPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Stock Units</label>
                  <input
                    type="number"
                    required
                    value={editingProduct.stockCount}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockCount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Discount %</label>
                  <input
                    type="number"
                    value={editingProduct.discountPercentage || 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, discountPercentage: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                  />
                </div>
              </div>

              {/* Dedicated 4-Slot Product Image Gallery */}
              <div className="border-t border-slate-200 pt-3">
                <ProductImageGalleryEditor
                  images={editingProductImages}
                  onChange={setEditingProductImages}
                  productId={editingProduct.id}
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Save Changes to Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 5: QUICK RESTOCK MODAL */}
      {/* --------------------------------------------------------------------- */}
      {restockProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 p-6 space-y-4 text-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0b5c37] border border-emerald-200 flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Restock Product</h3>
                <p className="text-xs text-slate-500 truncate max-w-[200px]">{restockProduct.name}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Stock:</span>
                <strong className="text-slate-900 font-mono">{restockProduct.stockCount} units</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Add Units:</span>
                <strong className="text-[#0b5c37] font-mono font-bold">+{restockAmount} units</strong>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                <span className="text-slate-700">Projected Level:</span>
                <span className="text-emerald-700 font-mono">
                  {restockProduct.stockCount + Number(restockAmount)} units
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Restock Units Quantity</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[5, 10, 25, 50].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRestockAmount(amt)}
                    className={`py-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                      restockAmount === amt
                        ? 'bg-[#0b5c37] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    +{amt}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                value={restockAmount}
                onChange={(e) => setRestockAmount(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestockProduct(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRestock}
                disabled={isSavingRestock}
                className="flex-1 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-colors flex items-center justify-center gap-1.5"
              >
                {isSavingRestock ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Apply Restock</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 6: DELETE CONFIRMATION */}
      {/* --------------------------------------------------------------------- */}
      {deletingProductId && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 p-6 space-y-4 text-center text-slate-900">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Delete Product from Catalog?</h3>
              <p className="text-xs text-slate-500 mt-1">
                This will remove the product row and associated inventory record from Supabase.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeletingProductId(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteProduct}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 7: ADD CATEGORY MODAL */}
      {/* --------------------------------------------------------------------- */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 p-6 space-y-4 text-slate-900">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900">Add Store Category</h3>
              <button
                onClick={() => setIsAddCategoryOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Category Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Smart Wearables"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">URL Slug (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. smart-wearables"
                  value={newCatSlug}
                  onChange={(e) => setNewCatSlug(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Curated smart lifestyle accessories"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded-xl font-bold cursor-pointer shadow-xs transition-colors"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 8: EDIT CATEGORY MODAL */}
      {/* --------------------------------------------------------------------- */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 p-6 space-y-4 text-slate-900">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900">Edit Store Category</h3>
              <button
                onClick={() => setEditingCategory(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCategorySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Category Title</label>
                <input
                  type="text"
                  required
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">URL Slug</label>
                <input
                  type="text"
                  value={editCatSlug}
                  onChange={(e) => setEditCatSlug(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] font-mono focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <input
                  type="text"
                  value={editCatDesc}
                  onChange={(e) => setEditCatDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#0b5c37] focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded-xl font-bold cursor-pointer shadow-xs transition-colors"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 9: DELETE CATEGORY CONFIRMATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-slate-200 p-6 space-y-4 text-center text-slate-900">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Delete Category</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove category <strong className="text-slate-800">"{deletingCategory.name}"</strong>?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCategory(deletingCategory)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 10: CUSTOMER PROFILE & ORDER HISTORY MODAL */}
      {/* --------------------------------------------------------------------- */}
      {viewingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 font-black text-sm flex items-center justify-center border border-teal-200">
                  {viewingCustomer.avatar_url || (viewingCustomer.full_name || 'CU').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{viewingCustomer.full_name || 'Customer Profile'}</h3>
                  <p className="text-xs text-slate-500 font-mono">{viewingCustomer.email}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingCustomer(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Details Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="space-y-1">
                <span className="text-slate-500 uppercase font-mono text-[10px] block">Customer Credentials</span>
                <p className="text-slate-900 font-bold">{viewingCustomer.full_name || 'Customer'}</p>
                <p className="text-slate-600 flex items-center gap-1 font-mono text-[11px]">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{viewingCustomer.email}</span>
                </p>
                <p className="text-slate-600 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{viewingCustomer.phone || 'No phone registered'}</span>
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                  Role: {viewingCustomer.role || 'customer'}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 uppercase font-mono text-[10px] block">Saved Shipping Address</span>
                {viewingCustomer.shipping_address ? (
                  <>
                    <p className="text-slate-900 font-medium">
                      {viewingCustomer.shipping_address.street || viewingCustomer.shipping_address.address || 'Street not specified'}
                    </p>
                    <p className="text-slate-600">
                      {viewingCustomer.shipping_address.city || ''}{viewingCustomer.shipping_address.state ? `, ${viewingCustomer.shipping_address.state}` : ''}{' '}
                      {viewingCustomer.shipping_address.zipCode || viewingCustomer.shipping_address.postalCode || ''}
                    </p>
                    <p className="text-slate-600">{viewingCustomer.shipping_address.country || 'United States'}</p>
                  </>
                ) : (
                  <p className="text-slate-400 italic">No saved address in public.profiles yet.</p>
                )}
              </div>
            </div>

            {/* Customer Order History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase font-mono tracking-wider">
                  Order History &amp; Checkout Transactions
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {orders.filter((o) => o.user_id === viewingCustomer.id || o.guest_email === viewingCustomer.email).length} Orders Placed
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-mono text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Order #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const custOrders = orders.filter(
                        (o) => o.user_id === viewingCustomer.id || o.guest_email === viewingCustomer.email
                      );
                      if (custOrders.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                              No orders found for this customer account.
                            </td>
                          </tr>
                        );
                      }
                      return custOrders.map((ord) => (
                        <tr key={ord.id || ord.order_number} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            #{ord.order_number || ord.id?.slice(0, 8)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {ord.created_at ? new Date(ord.created_at).toLocaleDateString() : 'Recent'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="capitalize px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {ord.status?.replace('_', ' ') || 'pending'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-[#0b5c37] tabular-nums">
                            {formatPrice(ord.total_amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => {
                                setViewingCustomer(null);
                                setSelectedOrderDetails(ord);
                              }}
                              className="text-xs text-[#0b5c37] font-bold hover:underline cursor-pointer"
                            >
                              View Order →
                            </button>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Close Customer Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
