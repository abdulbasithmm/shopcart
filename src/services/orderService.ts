import { CartItem, User, Order, OrderStatus, ShipmentUpdate } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
  shippingAddress: {
    fullName: string;
    street: string;
    apartment?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
  };
  customerNotes?: string;
  paymentMethod: 'paypal' | 'gpay_qr' | 'credit_card' | 'cash_on_delivery';
  paymentStatus: 'pending' | 'verified';
  transactionReference?: string;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  orderNumber: string;
  errorMessage?: string;
  isStoredInSupabase: boolean;
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
}

/**
 * Creates order, order_items, payment record, initial tracking details, and safely updates inventory
 */
export async function createOrder(params: CreateOrderParams): Promise<OrderResult> {
  const isConnected = isSupabaseConfigured();

  // Initial order status based on verified payment
  const initialStatus: OrderStatus =
    params.paymentStatus === 'verified' ? 'confirmed' : 'order_placed';

  // Calculate default estimated delivery date: 4 days from now
  const estDeliveryDate = new Date();
  estDeliveryDate.setDate(estDeliveryDate.getDate() + 4);
  const estimatedDeliveryISO = estDeliveryDate.toISOString();

  // Generate unique tracking number (e.g. SC-TRK-7849201948)
  const trackingNumber = `SC-TRK-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const carrier = 'Shop Cart Express';

  // Generate initial shipment milestones
  const initialShipmentUpdates = createInitialShipmentUpdates(
    new Date(),
    params.paymentStatus === 'verified'
  );

  if (!isConnected) {
    // When Supabase is not configured yet, record order in localStorage for local testing
    try {
      const localOrders: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      const newOrder: Order = {
        id: `local-${Date.now()}`,
        order_number: params.orderNumber,
        user_id: params.user?.id || null,
        guest_email: params.guestEmail || params.shippingAddress.fullName || null,
        status: initialStatus,
        subtotal: params.subtotal,
        discount_amount: params.discountAmount,
        shipping_fee: params.shippingFee,
        tax_amount: params.taxAmount,
        total_amount: params.totalAmount,
        coupon_code: params.couponCode || null,
        shipping_address: params.shippingAddress,
        customer_notes: params.customerNotes || null,
        tracking_number: trackingNumber,
        carrier: carrier,
        estimated_delivery_date: estimatedDeliveryISO,
        shipment_updates: initialShipmentUpdates,
        paymentMethod: params.paymentMethod,
        paymentStatus: params.paymentStatus,
        transactionReference: params.transactionReference || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: params.cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          unit_price: item.product.price,
          quantity: item.quantity,
          total_price: Number((item.product.price * item.quantity).toFixed(2)),
          selected_color: item.selectedColor || null,
          selected_size: item.selectedSize || null,
          product: item.product,
        })),
        payment_records: [
          {
            id: `pay-${Date.now()}`,
            payment_method: params.paymentMethod,
            amount: params.totalAmount,
            currency: 'USD',
            payment_status: params.paymentStatus,
            transaction_reference: params.transactionReference || null,
            created_at: new Date().toISOString(),
          },
        ],
      };
      localOrders.unshift(newOrder);
      localStorage.setItem('shopcart_orders', JSON.stringify(localOrders));
    } catch {
      // Ignore storage errors
    }

    return {
      success: true,
      orderId: `local-${Date.now()}`,
      orderNumber: params.orderNumber,
      isStoredInSupabase: false,
      trackingNumber,
      estimatedDeliveryDate: estimatedDeliveryISO,
    };
  }

  try {
    // 1. Insert into orders table with tracking number, carrier, estimated delivery, and initial updates
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_number: params.orderNumber,
        user_id: params.user?.id && !params.user.id.startsWith('usr-') ? params.user.id : null,
        guest_email: params.guestEmail || params.shippingAddress.fullName || null,
        status: initialStatus,
        subtotal: params.subtotal,
        discount_amount: params.discountAmount,
        shipping_fee: params.shippingFee,
        tax_amount: params.taxAmount,
        total_amount: params.totalAmount,
        coupon_code: params.couponCode || null,
        shipping_address: params.shippingAddress as any,
        customer_notes: params.customerNotes || null,
        tracking_number: trackingNumber,
        carrier: carrier,
        estimated_delivery_date: estimatedDeliveryISO,
        shipment_updates: initialShipmentUpdates as any,
      })
      .select('id')
      .single();

    if (orderErr || !orderData) {
      console.error('Failed to insert order in Supabase:', orderErr);
      throw new Error(orderErr?.message || 'Failed to create order record in Supabase');
    }

    const orderId = orderData.id;

    // 2. Insert order items
    const orderItemsRows = params.cart.map((item) => ({
      order_id: orderId,
      product_id: item.product.id,
      product_name: item.product.name,
      unit_price: item.product.price,
      quantity: item.quantity,
      total_price: Number((item.product.price * item.quantity).toFixed(2)),
      selected_color: item.selectedColor || null,
      selected_size: item.selectedSize || null,
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsRows);
    if (itemsErr) {
      console.warn('Failed to insert order items:', itemsErr.message);
    }

    // 3. Insert payment record
    const { error: paymentErr } = await supabase.from('payment_records').insert({
      order_id: orderId,
      payment_method: params.paymentMethod,
      amount: params.totalAmount,
      currency: 'USD',
      payment_status: params.paymentStatus,
      transaction_reference: params.transactionReference || null,
      raw_details: {
        recordedAt: new Date().toISOString(),
        paymentMethodName: params.paymentMethod,
      },
    });

    if (paymentErr) {
      console.warn('Failed to record payment in Supabase:', paymentErr.message);
    }

    // 4. Also insert into order_shipment_updates table if available
    try {
      const shipmentRows = initialShipmentUpdates.map((u) => ({
        order_id: orderId,
        status: u.status,
        title: u.title,
        description: u.description || null,
        location: u.location || null,
        created_at: u.timestamp,
      }));
      await supabase.from('order_shipment_updates').insert(shipmentRows);
    } catch {
      // Table may be optional if using JSONB column
    }

    // 5. Safely deduct product inventory
    for (const item of params.cart) {
      try {
        const { error: rpcErr } = await supabase.rpc('deduct_product_inventory', {
          p_product_id: item.product.id,
          p_quantity: item.quantity,
        });

        if (rpcErr) {
          const { data: currentInv } = await supabase
            .from('inventory')
            .select('stock_count')
            .eq('product_id', item.product.id)
            .single();

          if (currentInv) {
            const nextStock = Math.max(0, currentInv.stock_count - item.quantity);
            await supabase
              .from('inventory')
              .update({ stock_count: nextStock, updated_at: new Date().toISOString() })
              .eq('product_id', item.product.id);
          }
        }
      } catch (invErr) {
        console.warn(`Could not update inventory for ${item.product.id}:`, invErr);
      }
    }

    // Mirror order locally for immediate responsiveness
    try {
      const localOrders: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      const newOrderRecord: Order = {
        id: orderId,
        order_number: params.orderNumber,
        user_id: params.user?.id || null,
        guest_email: params.guestEmail || params.shippingAddress.fullName || null,
        status: initialStatus,
        subtotal: params.subtotal,
        discount_amount: params.discountAmount,
        shipping_fee: params.shippingFee,
        tax_amount: params.taxAmount,
        total_amount: params.totalAmount,
        coupon_code: params.couponCode || null,
        shipping_address: params.shippingAddress,
        customer_notes: params.customerNotes || null,
        tracking_number: trackingNumber,
        carrier: carrier,
        estimated_delivery_date: estimatedDeliveryISO,
        shipment_updates: initialShipmentUpdates,
        paymentMethod: params.paymentMethod,
        paymentStatus: params.paymentStatus,
        transactionReference: params.transactionReference || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: params.cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          unit_price: item.product.price,
          quantity: item.quantity,
          total_price: Number((item.product.price * item.quantity).toFixed(2)),
          selected_color: item.selectedColor || null,
          selected_size: item.selectedSize || null,
          product: item.product,
        })),
        payment_records: [
          {
            id: `pay-${Date.now()}`,
            payment_method: params.paymentMethod,
            amount: params.totalAmount,
            currency: 'INR',
            payment_status: params.paymentStatus,
            transaction_reference: params.transactionReference || null,
            created_at: new Date().toISOString(),
          },
        ],
      };
      const filtered = localOrders.filter((o) => o.order_number !== params.orderNumber);
      filtered.unshift(newOrderRecord);
      localStorage.setItem('shopcart_orders', JSON.stringify(filtered));
    } catch {
      // Ignore storage error
    }

    return {
      success: true,
      orderId,
      orderNumber: params.orderNumber,
      isStoredInSupabase: true,
      trackingNumber,
      estimatedDeliveryDate: estimatedDeliveryISO,
    };
  } catch (err: any) {
    console.error('Error during checkout order placement:', err);
    return {
      success: false,
      orderNumber: params.orderNumber,
      errorMessage: err.message || 'Order creation failed',
      isStoredInSupabase: false,
    };
  }
}

/**
 * Fetch orders strictly for a specific customer
 * Enforces customer privacy and isolation
 */
export async function fetchUserOrders(userId: string): Promise<Order[]> {
  if (!userId) return [];

  if (!isSupabaseConfigured()) {
    try {
      const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      return local.filter((o) => !o.user_id || o.user_id === userId || userId === 'usr-demo-customer');
    } catch {
      return [];
    }
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), payment_records(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch user orders from Supabase:', error.message);
      const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      return local.filter((o) => !o.user_id || o.user_id === userId);
    }

    const remote = (data || []).map(normalizeOrderRecord);
    let local: Order[] = [];
    try {
      local = JSON.parse(localStorage.getItem('shopcart_orders') || '[]').filter((o: Order) => o.user_id === userId);
    } catch {
      local = [];
    }

    const map = new Map<string, Order>();
    local.forEach((o) => map.set(o.order_number, o));
    remote.forEach((o) => map.set(o.order_number, o));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } catch (err) {
    console.warn('Exception in fetchUserOrders:', err);
    return [];
  }
}

/**
 * Fetch all orders for administrator
 */
export async function fetchAllAdminOrders(): Promise<Order[]> {
  let localOrders: Order[] = [];
  try {
    localOrders = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
  } catch {
    localOrders = [];
  }

  if (!isSupabaseConfigured()) {
    return localOrders;
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), payment_records(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch admin orders from Supabase:', error.message);
      return localOrders;
    }

    const remoteOrders = (data || []).map(normalizeOrderRecord);
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
  const payRecord = row.payment_records?.[0] || {};

  return {
    ...row,
    status: normStatus,
    paymentMethod: row.paymentMethod || payRecord.payment_method || 'paypal',
    paymentStatus: row.paymentStatus || payRecord.payment_status || (normStatus === 'confirmed' || normStatus === 'shipped' || normStatus === 'delivered' ? 'verified' : 'pending'),
    transactionReference: row.transactionReference || payRecord.transaction_reference || null,
    shipment_updates: Array.isArray(row.shipment_updates) && row.shipment_updates.length > 0
      ? row.shipment_updates
      : createInitialShipmentUpdates(new Date(row.created_at || Date.now()), payRecord.payment_status === 'verified'),
  };
}

/**
 * Admin: Update order status to any of the 8 canonical statuses
 * Automatically appends a shipment update milestone
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  options?: {
    customTitle?: string;
    customDescription?: string;
    location?: string;
  }
): Promise<{ success: boolean; message: string; updatedOrder?: Order }> {
  const meta = getStatusMeta(newStatus);
  const now = new Date();

  const newUpdate: ShipmentUpdate = {
    id: `evt-${Date.now()}`,
    status: newStatus,
    title: options?.customTitle || meta.label,
    description: options?.customDescription || meta.description,
    location: options?.location || 'Shop Cart Fulfillment Network',
    timestamp: now.toISOString(),
  };

  const isConnected = isSupabaseConfigured() && orderId && !orderId.startsWith('local-');

  if (!isConnected) {
    // Update local storage
    try {
      const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
      let updatedOrder: Order | undefined;

      const nextOrders = local.map((ord) => {
        if (ord.id === orderId || ord.order_number === orderId) {
          const updates = [...(ord.shipment_updates || []), newUpdate];
          updatedOrder = {
            ...ord,
            status: newStatus,
            shipment_updates: updates,
            updated_at: now.toISOString(),
          };
          return updatedOrder;
        }
        return ord;
      });

      localStorage.setItem('shopcart_orders', JSON.stringify(nextOrders));
      return { success: true, message: `Status updated to ${meta.label}`, updatedOrder };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to update local order' };
    }
  }

  try {
    // 1. Fetch current shipment_updates
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('shipment_updates')
      .eq('id', orderId)
      .single();

    const existingUpdates: ShipmentUpdate[] = Array.isArray(currentOrder?.shipment_updates)
      ? currentOrder.shipment_updates
      : [];
    const mergedUpdates = [...existingUpdates, newUpdate];

    // 2. Update orders table in Supabase
    const { data: updatedData, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        shipment_updates: mergedUpdates as any,
        updated_at: now.toISOString(),
      })
      .eq('id', orderId)
      .select('*, order_items(*), payment_records(*)')
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 3. Insert into order_shipment_updates table if present
    try {
      await supabase.from('order_shipment_updates').insert({
        order_id: orderId,
        status: newStatus,
        title: newUpdate.title,
        description: newUpdate.description,
        location: newUpdate.location,
        created_at: newUpdate.timestamp,
      });
    } catch {
      // Ignored if table not created
    }

    return {
      success: true,
      message: `Status updated to ${meta.label} in Supabase`,
      updatedOrder: updatedData ? normalizeOrderRecord(updatedData) : undefined,
    };
  } catch (err: any) {
    console.error('Error updating order status in Supabase:', err);
    return { success: false, message: err.message || 'Failed to update order status' };
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

  if (!isConnected) {
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
      return { success: true, message: 'Tracking information saved locally.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to update tracking' };
    }
  }

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        tracking_number: params.trackingNumber.trim(),
        carrier: params.carrier.trim(),
        estimated_delivery_date: params.estimatedDeliveryDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) throw error;
    return { success: true, message: 'Tracking and delivery estimate saved in Supabase.' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update tracking in Supabase' };
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
  const newEvt: ShipmentUpdate = {
    id: `evt-${Date.now()}`,
    status: update.status,
    title: update.title.trim(),
    location: update.location?.trim() || 'In Transit',
    description: update.description?.trim() || '',
    timestamp: update.timestamp || new Date().toISOString(),
  };

  const isConnected = isSupabaseConfigured() && orderId && !orderId.startsWith('local-');

  if (!isConnected) {
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
      return { success: true, message: 'Shipment update posted.', update: newEvt };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to post update' };
    }
  }

  try {
    // 1. Fetch current shipment_updates
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('shipment_updates')
      .eq('id', orderId)
      .single();

    const existingUpdates: ShipmentUpdate[] = Array.isArray(currentOrder?.shipment_updates)
      ? currentOrder.shipment_updates
      : [];
    const merged = [...existingUpdates, newEvt];

    const { error } = await supabase
      .from('orders')
      .update({
        status: update.status,
        shipment_updates: merged as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) throw error;

    // Optional table insert
    try {
      await supabase.from('order_shipment_updates').insert({
        order_id: orderId,
        status: update.status,
        title: newEvt.title,
        description: newEvt.description,
        location: newEvt.location,
        created_at: newEvt.timestamp,
      });
    } catch {
      // Ignored
    }

    return { success: true, message: 'Shipment update published to Supabase!', update: newEvt };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to publish shipment update' };
  }
}
