import { CartItem, User, Order, OrderStatus, ShipmentUpdate, PaymentStatus, AIScreenshotAnalysis } from '../types';
import { supabase, isSupabaseConfigured, getAuthHeaders } from '../lib/supabase';
import {
  normalizeOrderStatus,
  createInitialShipmentUpdates,
  getStatusMeta,
} from '../utils/orderTracking';

export interface CreateOrderParams {
  orderNumber: string;
  user: User | null;
  guestEmail?: string;
  cart: CartItem[];
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  couponCode?: string | null;
  shippingSpeed?: 'standard' | 'express';
  shippingAddress: {
    fullName: string;
    street: string;
    flatHouseNumber?: string;
    buildingApartment?: string;
    apartment?: string;
    houseBuilding?: string;
    streetArea?: string;
    city: string;
    state: string;
    postalCode: string;
    pinCode?: string;
    country: string;
    phone: string;
    email?: string;
    landmark?: string;
    deliveryInstructions?: string;
  };
  customerNotes?: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  transactionReference?: string;
  screenshotUrl?: string | null;
  aiAnalysis?: AIScreenshotAnalysis | null;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  orderNumber: string;
  errorMessage?: string;
  isStoredInSupabase: boolean;
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
  screenshotUrl?: string | null;
  aiAnalysis?: AIScreenshotAnalysis | null;
  pricing?: {
    subtotal: number;
    discountAmount: number;
    shippingFee: number;
    taxAmount: number;
    totalAmount: number;
    couponCode?: string | null;
    shippingSpeed?: 'standard' | 'express';
  };
}

/**
 * Creates order strictly via the authoritative backend API (/api/orders/create)
 * which validates product prices, coupons, shipping, taxes, customer/address details,
 * UTR uniqueness, and executes the atomic create_complete_order RPC on Supabase.
 */
export async function createOrder(params: CreateOrderParams): Promise<OrderResult> {
  const initialStatus: OrderStatus = 'order_placed';
  const enforcedPaymentStatus: PaymentStatus = 'pending_admin_verification';

  const estDeliveryDate = new Date();
  estDeliveryDate.setDate(estDeliveryDate.getDate() + (params.shippingSpeed === 'express' ? 2 : 4));
  const fallbackEstimatedISO = estDeliveryDate.toISOString();
  const fallbackTrackingNumber = `SC-TRK-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const carrier = 'Shop Cart Express';

  const normalizedUtr = (params.transactionReference || '').replace(/[\s-]+/g, '').trim().toUpperCase();
  const initialShipmentUpdates = createInitialShipmentUpdates(new Date(), false);

  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderNumber: params.orderNumber,
        status: initialStatus,
        paymentStatus: enforcedPaymentStatus,
        customerName: params.shippingAddress.fullName,
        customerEmail: params.guestEmail || params.shippingAddress.email || params.user?.email || '',
        customerPhone: params.shippingAddress.phone || params.user?.phone || '',
        flatHouseNumber: params.shippingAddress.flatHouseNumber || '',
        buildingApartment: params.shippingAddress.buildingApartment || '',
        houseBuilding: params.shippingAddress.houseBuilding || [params.shippingAddress.flatHouseNumber, params.shippingAddress.buildingApartment].filter(Boolean).join(', ') || params.shippingAddress.apartment || params.shippingAddress.street,
        streetArea: params.shippingAddress.streetArea || params.shippingAddress.street,
        city: params.shippingAddress.city,
        state: params.shippingAddress.state,
        pinCode: params.shippingAddress.pinCode || params.shippingAddress.postalCode,
        landmark: params.shippingAddress.landmark || '',
        deliveryInstructions: params.shippingAddress.deliveryInstructions || params.customerNotes || '',
        country: params.shippingAddress.country || 'India',
        shippingSpeed: params.shippingSpeed || 'standard',
        cartItems: params.cart.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          productImage: item.product.image || item.product.images?.[0] || null,
          quantity: item.quantity,
          unitPrice: item.product.price,
          totalPrice: Number((item.product.price * item.quantity).toFixed(2)),
          selectedColor: item.selectedColor || null,
          selectedSize: item.selectedSize || null,
        })),
        pricing: {
          subtotal: params.subtotal,
          discountAmount: params.discountAmount,
          shippingFee: params.shippingFee,
          taxAmount: params.taxAmount,
          totalAmount: params.totalAmount,
          couponCode: params.couponCode || null,
          shippingSpeed: params.shippingSpeed || 'standard',
        },
        paymentMethod: params.paymentMethod,
        transactionReference: normalizedUtr,
        screenshotBase64: params.screenshotUrl?.startsWith('data:') ? params.screenshotUrl : undefined,
        screenshotUrl: !params.screenshotUrl?.startsWith('data:') ? params.screenshotUrl : undefined,
        customerNotes: params.customerNotes,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        success: false,
        orderNumber: params.orderNumber,
        errorMessage: data?.error || `Order submission rejected (HTTP ${res.status}). Please verify your order details and retry.`,
        isStoredInSupabase: false,
      };
    }

    const authoritativePricing = {
      subtotal: Number(data.pricing?.subtotal ?? params.subtotal),
      discountAmount: Number(data.pricing?.discountAmount ?? params.discountAmount),
      shippingFee: Number(data.pricing?.shippingFee ?? params.shippingFee),
      taxAmount: Number(data.pricing?.taxAmount ?? params.taxAmount),
      totalAmount: Number(data.pricing?.totalAmount ?? params.totalAmount),
      couponCode: data.pricing?.couponCode ?? params.couponCode ?? null,
      shippingSpeed: (data.pricing?.shippingSpeed ?? params.shippingSpeed ?? 'standard') as 'standard' | 'express',
    };

    const resolvedOrderId = data.orderId || `ord-${Date.now()}`;
    const resolvedTracking = data.trackingNumber || fallbackTrackingNumber;
    const resolvedDeliveryISO = data.estimatedDeliveryDate || fallbackEstimatedISO;
    const serverAiAnalysis: AIScreenshotAnalysis | null = data.aiAnalysis || null;
    const resolvedScreenshotUrl: string | null = data.screenshotUrl || params.screenshotUrl || null;

    try {
      const localOrders: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      const newOrder: Order = {
        id: resolvedOrderId,
        order_number: params.orderNumber,
        user_id: params.user?.id || null,
        guest_email: params.user?.id ? null : (params.guestEmail || params.shippingAddress.email || null),
        customer_name: params.shippingAddress.fullName,
        customer_email: params.guestEmail || params.shippingAddress.email || null,
        customer_phone: params.shippingAddress.phone,
        status: initialStatus,
        subtotal: authoritativePricing.subtotal,
        discount_amount: authoritativePricing.discountAmount,
        shipping_fee: authoritativePricing.shippingFee,
        tax_amount: authoritativePricing.taxAmount,
        total_amount: authoritativePricing.totalAmount,
        coupon_code: authoritativePricing.couponCode,
        shipping_address: params.shippingAddress,
        customer_notes: params.customerNotes || null,
        tracking_number: resolvedTracking,
        carrier: data.carrier || carrier,
        estimated_delivery_date: resolvedDeliveryISO,
        shipment_updates: initialShipmentUpdates,
        paymentMethod: params.paymentMethod,
        paymentStatus: enforcedPaymentStatus,
        transactionReference: data.transactionReference || normalizedUtr || null,
        screenshotUrl: resolvedScreenshotUrl,
        aiAnalysis: serverAiAnalysis,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: params.cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          product_image: item.product.image || item.product.images?.[0] || null,
          unit_price: item.product.price,
          quantity: item.quantity,
          total_price: Number((item.product.price * item.quantity).toFixed(2)),
          line_total: Number((item.product.price * item.quantity).toFixed(2)),
          selected_color: item.selectedColor || null,
          selected_size: item.selectedSize || null,
          product: item.product,
        })),
        payment_records: [
          {
            id: `pay-${Date.now()}`,
            payment_method: params.paymentMethod,
            amount: authoritativePricing.totalAmount,
            currency: 'INR',
            payment_status: enforcedPaymentStatus,
            transaction_reference: data.transactionReference || normalizedUtr || null,
            screenshot_url: resolvedScreenshotUrl,
            ai_analysis: serverAiAnalysis,
            ai_confidence_score: serverAiAnalysis?.confidence_score ?? null,
            ai_recommendation: serverAiAnalysis?.recommended_action || null,
            suspicious_indicators: serverAiAnalysis?.suspicious_indicators || [],
            created_at: new Date().toISOString(),
          },
        ],
      };
      const filtered = localOrders.filter((o) => o.order_number !== params.orderNumber);
      filtered.unshift(newOrder);
      localStorage.setItem('shopcart_orders', JSON.stringify(filtered));
    } catch {
      // Non-fatal local mirror error
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('shopcart-orders-updated', {
          detail: { orderNumber: params.orderNumber, orderId: resolvedOrderId },
        })
      );
    }

    return {
      success: true,
      orderId: resolvedOrderId,
      orderNumber: params.orderNumber,
      isStoredInSupabase: data.isStoredInSupabase ?? true,
      trackingNumber: resolvedTracking,
      estimatedDeliveryDate: resolvedDeliveryISO,
      screenshotUrl: resolvedScreenshotUrl,
      aiAnalysis: serverAiAnalysis,
      pricing: authoritativePricing,
    };
  } catch (err: any) {
    console.error('Error during secure backend order placement:', err);
    return {
      success: false,
      orderNumber: params.orderNumber,
      errorMessage: err?.message || 'Unable to reach order creation service. Please try again.',
      isStoredInSupabase: false,
    };
  }
}

/**
 * Fetch orders strictly for a specific customer
 * Enforces customer privacy and isolation
 */
export async function fetchUserOrders(
  userId: string,
  options?: { includeHidden?: boolean }
): Promise<Order[]> {
  if (!userId) return [];

  const includeHidden = Boolean(options?.includeHidden);

  // 1. Try Backend API
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/orders/customer/${userId}?includeHidden=${includeHidden}`, {
      headers,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.orders)) {
        const orderMap = new Map<string, Order>();
        json.orders.forEach((o: any) => {
          const norm = normalizeOrderRecord(o);
          if (includeHidden || !norm.is_hidden_by_customer) {
            orderMap.set(norm.order_number || norm.id, norm);
          }
        });
        return Array.from(orderMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    }
  } catch {
    // Non-fatal, try direct Supabase
  }

  // 2. Local storage mirror
  let local: Order[] = [];
  try {
    local = JSON.parse(localStorage.getItem('shopcart_orders') || '[]')
      .filter((o: Order) => !o.user_id || o.user_id === userId || userId === 'usr-demo-customer')
      .filter((o: Order) => includeHidden || !o.is_hidden_by_customer);
  } catch {
    local = [];
  }

  if (!isSupabaseConfigured()) {
    return local;
  }

  // 3. Supabase direct
  try {
    let query = supabase
      .from('orders')
      .select('*, order_items(*), payment_records(*)')
      .eq('user_id', userId);

    if (!includeHidden) {
      query = query.eq('is_hidden_by_customer', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch user orders from Supabase:', error.message);
      return local;
    }

    const remote = (data || [])
      .map(normalizeOrderRecord)
      .filter((o) => includeHidden || !o.is_hidden_by_customer);

    const map = new Map<string, Order>();
    local.forEach((o) => map.set(o.order_number, o));
    remote.forEach((o) => map.set(o.order_number, o));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } catch (err) {
    console.warn('Exception in fetchUserOrders:', err);
    return local;
  }
}

/**
 * Fetch all orders for administrator with archive filtering
 */
export async function fetchAllAdminOrders(options?: { includeArchived?: boolean }): Promise<Order[]> {
  const includeArchived = Boolean(options?.includeArchived);

  let localOrders: Order[] = [];
  try {
    localOrders = JSON.parse(localStorage.getItem('shopcart_orders') || '[]').filter(
      (o: Order) => includeArchived || !o.is_archived_by_admin
    );
  } catch {
    localOrders = [];
  }

  // 1. Primary path: Fetch from server-authoritative Admin Orders endpoint
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/orders?includeArchived=${includeArchived}`, {
      headers,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.orders)) {
        const orderMap = new Map<string, Order>();
        localOrders.forEach((o) => orderMap.set(o.order_number || o.id, o));
        json.orders.forEach((o: any) => {
          const norm = normalizeOrderRecord(o);
          if (includeArchived || !norm.is_archived_by_admin) {
            orderMap.set(norm.order_number || norm.id, norm);
          }
        });
        return Array.from(orderMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    }
  } catch (apiErr) {
    console.warn('Backend /api/admin/orders failed, trying direct Supabase:', apiErr);
  }

  if (!isSupabaseConfigured()) {
    return localOrders;
  }

  try {
    let query = supabase
      .from('orders')
      .select('*, order_items(*), payment_records(*)')
      .order('created_at', { ascending: false });

    if (!includeArchived) {
      query = query.eq('is_archived_by_admin', false);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Failed to fetch admin orders from Supabase:', error.message);
      return localOrders;
    }

    if (data && data.length > 0) {
      const missingProdIds = new Set<string>();
      data.forEach((o: any) => {
        (o.order_items || []).forEach((it: any) => {
          if (it.product_id && !it.product_image) missingProdIds.add(it.product_id);
        });
      });
      if (missingProdIds.size > 0) {
        try {
          const { data: prods } = await supabase
            .from('products')
            .select('id, name, price, image_url, images')
            .in('id', Array.from(missingProdIds));
          if (prods) {
            const pMap = new Map(prods.map((p) => [p.id, p]));
            data.forEach((o: any) => {
              (o.order_items || []).forEach((it: any) => {
                if (it.product_id && !it.product) {
                  it.product = pMap.get(it.product_id);
                }
              });
            });
          }
        } catch {
          // Ignore
        }
      }
    }

    const remoteOrders = (data || [])
      .map(normalizeOrderRecord)
      .filter((o) => includeArchived || !o.is_archived_by_admin);

    const orderMap = new Map<string, Order>();
    localOrders.forEach((o) => orderMap.set(o.order_number, o));
    remoteOrders.forEach((o) => orderMap.set(o.order_number, o));
    return Array.from(orderMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } catch (err) {
    console.warn('Exception in fetchAllAdminOrders:', err);
    return localOrders;
  }
}


/**
 * Helper to normalize order record from database
 */
function normalizeOrderRecord(row: any): Order {
  const normStatus = normalizeOrderStatus(row.status);
  const payRecord = (row.payment_records && row.payment_records[0]) || {};
  const shipAddr = row.shipping_address || {};

  // Normalize ordered items with images, IDs, quantities, and prices
  const rawItems = Array.isArray(row.order_items) ? row.order_items : [];
  const normalizedItems = rawItems.map((it: any) => {
    const prod = it.product || {};
    const img =
      it.product_image ||
      prod.image_url ||
      (Array.isArray(prod.images) && prod.images.length > 0 ? prod.images[0] : null) ||
      null;

    const unitPrice = Number(it.unit_price || prod.price || 0);
    const qty = Number(it.quantity || 1);
    const totalPrice = Number(it.total_price || (unitPrice * qty) || 0);

    return {
      id: it.id,
      order_id: it.order_id,
      product_id: it.product_id || prod.id,
      product_name: it.product_name || prod.name || 'Product',
      product_image: img,
      unit_price: unitPrice,
      quantity: qty,
      total_price: totalPrice,
      line_total: totalPrice,
      selected_color: it.selectedColor || it.selected_color || null,
      selected_size: it.selectedSize || it.selected_size || null,
      product: prod,
    };
  });

  // Strict payment status: never automatically mark pending as verified
  const rawPayStatus = row.payment_status || row.paymentStatus || payRecord.payment_status;
  const paymentStatus = rawPayStatus || 'pending_admin_verification';

  // Normalize full customer delivery address
  const cleanAddress = {
    fullName: row.customer_name || shipAddr.fullName || shipAddr.name || row.guest_email || 'Customer',
    phone: row.customer_phone || shipAddr.phone || shipAddr.mobile || '',
    email: row.customer_email || shipAddr.email || row.guest_email || '',
    flatHouseNumber: shipAddr.flatHouseNumber || '',
    buildingApartment: shipAddr.buildingApartment || '',
    houseBuilding: shipAddr.houseBuilding || [shipAddr.flatHouseNumber, shipAddr.buildingApartment].filter(Boolean).join(', ') || shipAddr.apartment || '',
    streetArea: shipAddr.streetArea || shipAddr.street || '',
    street: shipAddr.street || shipAddr.streetArea || '',
    apartment: shipAddr.buildingApartment || shipAddr.apartment || shipAddr.houseBuilding || '',
    city: shipAddr.city || '',
    state: shipAddr.state || '',
    postalCode: shipAddr.pinCode || shipAddr.postalCode || '',
    pinCode: shipAddr.pinCode || shipAddr.postalCode || '',
    country: shipAddr.country || 'India',
    landmark: shipAddr.landmark || '',
    deliveryInstructions: shipAddr.deliveryInstructions || shipAddr.instructions || row.customer_notes || '',
  };

  const initialMilestones = createInitialShipmentUpdates(
    new Date(row.created_at || Date.now()),
    paymentStatus === 'verified'
  );

  return {
    ...row,
    customer_name: cleanAddress.fullName,
    customer_email: cleanAddress.email || null,
    customer_phone: cleanAddress.phone || null,
    status: normStatus,
    cancellation_reason: row.cancellation_reason || null,
    cancelled_at: row.cancelled_at || null,
    cancelled_by: row.cancelled_by || null,
    admin_notes: row.admin_notes || null,
    status_history: Array.isArray(row.status_history)
      ? row.status_history
      : [
          {
            status: normStatus,
            changedAt: row.created_at || new Date().toISOString(),
            changedBy: 'System',
            note: 'Order placed',
          },
        ],
    is_archived_by_admin: Boolean(row.is_archived_by_admin),
    is_hidden_by_customer: Boolean(row.is_hidden_by_customer),
    subtotal: Number(row.subtotal || (Number(row.total_amount || 0) - Number(row.shipping_fee || 0))),
    shipping_fee: Number(row.shipping_fee || 0),
    discount_amount: Number(row.discount_amount || 0),
    tax_amount: Number(row.tax_amount || 0),
    total_amount: Number(row.total_amount || 0),
    order_items: normalizedItems,
    paymentMethod: row.payment_method || row.paymentMethod || payRecord.payment_method || 'upi',
    paymentStatus,
    transactionReference: row.transaction_reference || row.transactionReference || payRecord.transaction_reference || null,
    screenshot_url: row.screenshot_url || payRecord.screenshot_url || null,
    ai_analysis: row.ai_analysis || payRecord.ai_analysis || null,
    ai_confidence_score: row.ai_confidence_score ?? payRecord.ai_confidence_score ?? null,
    ai_recommendation: row.ai_recommendation || payRecord.ai_recommendation || null,
    suspicious_indicators: row.suspicious_indicators || payRecord.suspicious_indicators || [],
    verified_at: row.verified_at || payRecord.verified_at || null,
    verified_by: row.verified_by || payRecord.verified_by || null,
    rejection_reason: row.rejection_reason || payRecord.rejection_reason || null,
    shipping_address: cleanAddress,
    shipment_updates: Array.isArray(row.shipment_updates) && row.shipment_updates.length > 0
      ? row.shipment_updates
      : initialMilestones,
  };
}

/**
 * Admin: Update order status to any of the 8 canonical statuses
 * Automatically appends status history and shipment update milestone
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  options?: {
    customTitle?: string;
    customDescription?: string;
    location?: string;
    adminNotes?: string;
    cancellationReason?: string;
    cancelledBy?: 'admin' | 'customer';
  }
): Promise<{ success: boolean; message: string; updatedOrder?: Order }> {
  const meta = getStatusMeta(newStatus);
  const now = new Date();
  const timestamp = now.toISOString();

  const newUpdate: ShipmentUpdate = {
    id: `evt-${Date.now()}`,
    status: newStatus,
    title: options?.customTitle || (newStatus === 'cancelled' ? 'Order Cancelled' : meta.label),
    description: options?.cancellationReason || options?.customDescription || meta.description,
    location: options?.location || 'Shop Cart Fulfillment Network',
    timestamp,
  };

  const newHistoryItem = {
    status: newStatus,
    changedAt: timestamp,
    changedBy: options?.cancelledBy === 'customer' ? 'Customer' : 'Administrator',
    note: options?.cancellationReason || options?.adminNotes || options?.customDescription || undefined,
  };

  const isConnected = isSupabaseConfigured() && orderId && !orderId.startsWith('local-');

  // 1. Server-mediated Admin API Update (uses service_role on backend)
  let serverOk = false;
  let serverErrorMessage = '';
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: newStatus,
        note: options?.customDescription || options?.cancellationReason,
        location: options?.location,
        cancellationReason: options?.cancellationReason,
        adminNotes: options?.adminNotes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      serverOk = true;
    } else {
      serverErrorMessage = json?.error || `Server returned HTTP ${res.status}`;
    }
  } catch (err: any) {
    serverErrorMessage = err?.message || 'Network error updating order status';
  }

  if (isConnected && !serverOk) {
    return {
      success: false,
      message: serverErrorMessage || 'Failed to update order status on server',
    };
  }

  // 2. Local Storage Mirror
  try {
    const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
    let updatedOrder: Order | undefined;

    const nextOrders = local.map((ord) => {
      if (ord.id === orderId || ord.order_number === orderId) {
        const updates = [newUpdate, ...(ord.shipment_updates || [])];
        const history = [newHistoryItem, ...(ord.status_history || [])];
        updatedOrder = {
          ...ord,
          status: newStatus,
          shipment_updates: updates,
          status_history: history,
          cancellation_reason: options?.cancellationReason || (newStatus === 'cancelled' ? ord.cancellation_reason || 'Cancelled' : null),
          cancelled_at: newStatus === 'cancelled' ? timestamp : ord.cancelled_at,
          cancelled_by: options?.cancelledBy || (newStatus === 'cancelled' ? 'admin' : ord.cancelled_by),
          admin_notes: options?.adminNotes !== undefined ? options.adminNotes : ord.admin_notes,
          updated_at: timestamp,
        };
        return updatedOrder;
      }
      return ord;
    });

    localStorage.setItem('shopcart_orders', JSON.stringify(nextOrders));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shopcart-orders-updated', { detail: { orderId, status: newStatus } }));
    }
  } catch {
    // Non-fatal
  }

  return {
    success: true,
    message: isConnected ? `Status updated to ${meta.label} in database` : `Status updated to ${meta.label}`,
  };
}

/**
 * Admin: Cancel an order with a mandatory cancellation reason
 */
export async function cancelOrderByAdmin(
  orderId: string,
  cancellationReason: string,
  adminNotes?: string
): Promise<{ success: boolean; message: string }> {
  if (!cancellationReason || !cancellationReason.trim()) {
    return { success: false, message: 'A cancellation reason is required.' };
  }

  return updateOrderStatus(orderId, 'cancelled', {
    cancellationReason: cancellationReason.trim(),
    adminNotes: adminNotes?.trim(),
    cancelledBy: 'admin',
    customTitle: 'Order Cancelled by Administrator',
    customDescription: cancellationReason.trim(),
  });
}

/**
 * Admin: Archive or unarchive a cancelled order (soft-delete / archive)
 * Keeps financial records and order history completely intact.
 */
export async function archiveAdminOrder(
  orderId: string,
  archive = true
): Promise<{ success: boolean; message: string }> {
  const timestamp = new Date().toISOString();
  const isConnected = isSupabaseConfigured() && orderId && !orderId.startsWith('local-');

  // 1. Server-mediated Admin API Update
  let serverOk = false;
  let serverError = '';
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/admin/orders/${orderId}/archive`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ archive }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      serverOk = true;
    } else {
      serverError = json?.error || `Server returned HTTP ${res.status}`;
    }
  } catch (err: any) {
    serverError = err?.message || 'Network error updating archive status';
  }

  if (isConnected && !serverOk) {
    return {
      success: false,
      message: serverError || 'Failed to update order archive state on server.',
    };
  }

  // 2. Update local storage mirror
  try {
    const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
    const nextOrders = local.map((ord) => {
      if (ord.id === orderId || ord.order_number === orderId) {
        return {
          ...ord,
          is_archived_by_admin: Boolean(archive),
          updated_at: timestamp,
        };
      }
      return ord;
    });
    localStorage.setItem('shopcart_orders', JSON.stringify(nextOrders));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shopcart-orders-updated', { detail: { orderId, isArchived: archive } }));
    }
  } catch {
    // Non-fatal
  }

  return {
    success: true,
    message: archive
      ? 'Order archived successfully. It will no longer appear in the active orders list.'
      : 'Order restored to active list.',
  };
}

/**
 * Customer: Request cancellation for an eligible order (server-mediated)
 */
export async function requestCustomerCancellation(
  orderId: string,
  reasonOrUserId: string,
  maybeReason?: string
): Promise<{ success: boolean; message: string }> {
  const cancellationReason = maybeReason ? maybeReason : reasonOrUserId;
  const userId = maybeReason ? reasonOrUserId : '';

  if (!cancellationReason || !cancellationReason.trim()) {
    return { success: false, message: 'Please provide a cancellation reason.' };
  }

  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cancellationReason: cancellationReason.trim(), userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        message: data?.error || 'Unable to cancel order. Please sign in and try again.',
      };
    }

    const timestamp = new Date().toISOString();
    try {
      const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      const nextOrders = local.map((ord) =>
        ord.id === orderId || ord.order_number === orderId
          ? {
              ...ord,
              status: 'cancelled' as OrderStatus,
              cancellation_reason: cancellationReason.trim(),
              cancelled_at: timestamp,
              cancelled_by: 'customer' as const,
              updated_at: timestamp,
            }
          : ord
      );
      localStorage.setItem('shopcart_orders', JSON.stringify(nextOrders));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('shopcart-orders-updated', { detail: { orderId, status: 'cancelled' } }));
      }
    } catch {
      // Non-fatal
    }

    return { success: true, message: data.message || 'Order cancelled successfully.' };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network error requesting order cancellation.',
    };
  }
}

/**
 * Customer: Hide a cancelled/refunded order from their order history (server-mediated)
 */
export async function hideCustomerOrder(
  orderId: string,
  userId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/orders/${orderId}/hide`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        message: data?.error || 'Unable to hide order from history. Please sign in and try again.',
      };
    }

    const timestamp = new Date().toISOString();
    try {
      const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      const nextOrders = local.map((ord) =>
        ord.id === orderId || ord.order_number === orderId
          ? { ...ord, is_hidden_by_customer: true, updated_at: timestamp }
          : ord
      );
      localStorage.setItem('shopcart_orders', JSON.stringify(nextOrders));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('shopcart-orders-updated', { detail: { orderId, hidden: true } }));
      }
    } catch {
      // Non-fatal
    }

    return { success: true, message: data.message || 'Order hidden from your order history.' };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network error updating order visibility.',
    };
  }
}


/**
 * Admin: Update tracking number, carrier, and estimated delivery date
 */
export async function updateOrderTracking(
  orderId: string,
  params: {
    trackingNumber: string;
    carrier: string;
    estimatedDeliveryDate?: string | null;
  }
): Promise<{ success: boolean; message: string }> {
  const isConnected = isSupabaseConfigured() && orderId && !orderId.startsWith('local-');

  if (isConnected) {
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`/api/admin/orders/${orderId}/shipping`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          trackingNumber: params.trackingNumber.trim(),
          carrier: params.carrier.trim(),
          estimatedDeliveryDate: params.estimatedDeliveryDate || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, message: json?.error || `Failed to update tracking (HTTP ${res.status})` };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network error updating tracking' };
    }
  }

  try {
    const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
    const updated = local.map((o) => {
      if (o.id === orderId || o.order_number === orderId) {
        return {
          ...o,
          tracking_number: params.trackingNumber.trim(),
          carrier: params.carrier.trim(),
          estimated_delivery_date: params.estimatedDeliveryDate || o.estimated_delivery_date,
          updated_at: new Date().toISOString(),
        };
      }
      return o;
    });
    localStorage.setItem('shopcart_orders', JSON.stringify(updated));
    return {
      success: true,
      message: isConnected ? 'Tracking and delivery estimate saved in Supabase.' : 'Tracking information saved locally.',
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update tracking' };
  }
}

/**
 * Admin: Add an explicit shipment update timeline event
 */
export async function addShipmentUpdate(
  orderId: string,
  update: {
    status: OrderStatus;
    title: string;
    location?: string;
    description?: string;
    timestamp?: string;
  }
): Promise<{ success: boolean; message: string; update?: ShipmentUpdate }> {
  let newEvt: ShipmentUpdate = {
    id: `evt-${Date.now()}`,
    status: update.status,
    title: update.title.trim(),
    location: update.location?.trim() || 'In Transit',
    description: update.description?.trim() || '',
    timestamp: update.timestamp || new Date().toISOString(),
  };

  const isConnected = isSupabaseConfigured() && orderId && !orderId.startsWith('local-');

  if (isConnected) {
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`/api/admin/orders/${orderId}/shipment-updates`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          status: update.status,
          title: newEvt.title,
          location: newEvt.location,
          description: newEvt.description,
          timestamp: newEvt.timestamp,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, message: json?.error || `Failed to publish shipment update (HTTP ${res.status})` };
      }
      if (json.update) {
        newEvt = json.update;
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network error publishing shipment update' };
    }
  }

  try {
    const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
    const updated = local.map((o) => {
      if (o.id === orderId || o.order_number === orderId) {
        const updates = [...(o.shipment_updates || []), newEvt];
        return {
          ...o,
          status: update.status,
          shipment_updates: updates,
          updated_at: new Date().toISOString(),
        };
      }
      return o;
    });
    localStorage.setItem('shopcart_orders', JSON.stringify(updated));
    return {
      success: true,
      message: isConnected ? 'Shipment update published to Supabase!' : 'Shipment update posted.',
      update: newEvt,
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to post update' };
  }
}
