import { CartItem, User, Order, OrderStatus, ShipmentUpdate, PaymentStatus, AIScreenshotAnalysis } from '../types';
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

  // 1. Primary path: Call Secure Backend Order Creation API
  try {
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: params.orderNumber,
        userId: params.user?.id && !params.user.id.startsWith('usr-') ? params.user.id : null,
        customerName: params.shippingAddress.fullName,
        customerEmail: params.guestEmail || params.shippingAddress.email || params.user?.email || '',
        customerPhone: params.shippingAddress.phone || params.user?.phone || '',
        houseBuilding: params.shippingAddress.houseBuilding || params.shippingAddress.apartment || params.shippingAddress.street,
        streetArea: params.shippingAddress.streetArea || params.shippingAddress.street,
        city: params.shippingAddress.city,
        state: params.shippingAddress.state,
        pinCode: params.shippingAddress.pinCode || params.shippingAddress.postalCode,
        landmark: params.shippingAddress.landmark || '',
        deliveryInstructions: params.shippingAddress.deliveryInstructions || params.customerNotes || '',
        country: params.shippingAddress.country || 'India',
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
          couponCode: params.couponCode,
        },
        paymentMethod: params.paymentMethod,
        transactionReference: params.transactionReference,
        screenshotBase64: params.screenshotUrl?.startsWith('data:') ? params.screenshotUrl : undefined,
        screenshotUrl: !params.screenshotUrl?.startsWith('data:') ? params.screenshotUrl : undefined,
        aiAnalysis: params.aiAnalysis,
        customerNotes: params.customerNotes,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        // Cache locally for instant availability
        try {
          const localOrders: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
          const newOrder: Order = {
            id: data.orderId || `ord-${Date.now()}`,
            order_number: params.orderNumber,
            user_id: params.user?.id || null,
            guest_email: params.guestEmail || params.shippingAddress.email || null,
            customer_name: params.shippingAddress.fullName,
            customer_email: params.guestEmail || params.shippingAddress.email || null,
            customer_phone: params.shippingAddress.phone,
            status: initialStatus,
            subtotal: params.subtotal,
            discount_amount: params.discountAmount,
            shipping_fee: params.shippingFee,
            tax_amount: params.taxAmount,
            total_amount: params.totalAmount,
            coupon_code: params.couponCode || null,
            shipping_address: params.shippingAddress,
            customer_notes: params.customerNotes || null,
            tracking_number: data.trackingNumber || trackingNumber,
            carrier: data.carrier || carrier,
            estimated_delivery_date: data.estimatedDeliveryDate || estimatedDeliveryISO,
            shipment_updates: initialShipmentUpdates,
            paymentMethod: params.paymentMethod,
            paymentStatus: params.paymentStatus,
            transactionReference: params.transactionReference || null,
            screenshotUrl: params.screenshotUrl || null,
            aiAnalysis: params.aiAnalysis || null,
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
                amount: params.totalAmount,
                currency: 'INR',
                payment_status: params.paymentStatus,
                transaction_reference: params.transactionReference || null,
                screenshot_url: params.screenshotUrl || null,
                ai_analysis: params.aiAnalysis || null,
                ai_confidence_score: params.aiAnalysis?.confidence_score || null,
                ai_recommendation: params.aiAnalysis?.recommended_action || null,
                suspicious_indicators: params.aiAnalysis?.suspicious_indicators || [],
                created_at: new Date().toISOString(),
              },
            ],
          };
          localOrders.unshift(newOrder);
          localStorage.setItem('shopcart_orders', JSON.stringify(localOrders));
        } catch {
          // Non-fatal
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('shopcart-orders-updated', {
              detail: { orderNumber: params.orderNumber, orderId: data.orderId },
            })
          );
        }

        return {
          success: true,
          orderId: data.orderId,
          orderNumber: params.orderNumber,
          isStoredInSupabase: data.isStoredInSupabase ?? true,
          trackingNumber: data.trackingNumber || trackingNumber,
          estimatedDeliveryDate: data.estimatedDeliveryDate || estimatedDeliveryISO,
        };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      if (errData.error) {
        throw new Error(errData.error);
      }
    }
  } catch (apiErr: any) {
    console.warn('Backend order creation endpoint warning, falling back to direct client client:', apiErr?.message);
    if (apiErr?.message && apiErr.message.includes('Duplicate UTR')) {
      throw apiErr;
    }
  }

  try {
    // Attempt 2: Try atomic PostgreSQL RPC create_complete_order if available
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_complete_order', {
        p_order: {
          order_number: params.orderNumber,
          user_id: params.user?.id && !params.user.id.startsWith('usr-') ? params.user.id : null,
          guest_email: params.guestEmail || params.shippingAddress.email || null,
          customer_name: params.shippingAddress.fullName,
          customer_email: params.guestEmail || params.shippingAddress.email || null,
          customer_phone: params.shippingAddress.phone,
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
        },
        p_items: params.cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          unit_price: item.product.price,
          quantity: item.quantity,
          total_price: Number((item.product.price * item.quantity).toFixed(2)),
          selected_color: item.selectedColor || null,
          selected_size: item.selectedSize || null,
        })),
        p_payment: {
          payment_method: params.paymentMethod,
          payment_status: params.paymentStatus,
          transaction_reference: params.transactionReference || null,
          screenshot_url: params.screenshotUrl || null,
          ai_analysis: params.aiAnalysis || null,
          ai_confidence_score: params.aiAnalysis?.confidence_score || null,
          ai_recommendation: params.aiAnalysis?.recommended_action || null,
          suspicious_indicators: params.aiAnalysis?.suspicious_indicators || [],
        },
      });

      if (!rpcErr && rpcRes && rpcRes.success) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('shopcart-orders-updated', {
              detail: { orderNumber: params.orderNumber, orderId: rpcRes.order_id },
            })
          );
        }
        return {
          success: true,
          orderId: rpcRes.order_id,
          orderNumber: params.orderNumber,
          isStoredInSupabase: true,
          trackingNumber,
          estimatedDeliveryDate: estimatedDeliveryISO,
        };
      }
    } catch {
      // Non-fatal, fall back to direct inserts
    }

    // Attempt 3: Direct insert into orders table
    const orderInsertPayload: any = {
      order_number: params.orderNumber,
      user_id: params.user?.id && !params.user.id.startsWith('usr-') ? params.user.id : null,
      guest_email: params.guestEmail || params.shippingAddress.email || null,
      customer_name: params.shippingAddress.fullName,
      customer_email: params.guestEmail || params.shippingAddress.email || null,
      customer_phone: params.shippingAddress.phone,
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
      status_history: [
        {
          status: initialStatus,
          changedAt: new Date().toISOString(),
          changedBy: 'Customer',
          note: 'Order placed',
        },
      ],
      payment_method: params.paymentMethod,
      payment_status: params.paymentStatus,
      is_archived_by_admin: false,
      is_hidden_by_customer: false,
    };

    let { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert(orderInsertPayload)
      .select('id')
      .single();

    // Fallback without extended columns if schema cache not reloaded
    if (orderErr) {
      console.warn('Primary orders insert error, attempting base columns:', orderErr.message);
      const basePayload = {
        order_number: params.orderNumber,
        user_id: params.user?.id && !params.user.id.startsWith('usr-') ? params.user.id : null,
        guest_email: params.guestEmail || params.shippingAddress.email || null,
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
      };

      const fallback = await supabase
        .from('orders')
        .insert(basePayload)
        .select('id')
        .single();

      if (!fallback.error && fallback.data) {
        orderData = fallback.data;
        orderErr = null;
      } else {
        throw new Error(fallback.error?.message || orderErr.message);
      }
    }

    if (orderErr || !orderData) {
      console.error('Failed to insert order in Supabase:', orderErr);
      throw new Error((orderErr as any)?.message || 'Failed to create order record in Supabase');
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
      currency: 'INR',
      payment_status: params.paymentStatus,
      transaction_reference: params.transactionReference || null,
      screenshot_url: params.screenshotUrl || null,
      ai_analysis: params.aiAnalysis || null,
      ai_confidence_score: params.aiAnalysis?.confidence_score ?? null,
      ai_recommendation: params.aiAnalysis?.recommended_action || null,
      suspicious_indicators: params.aiAnalysis?.suspicious_indicators || [],
      raw_details: {
        recordedAt: new Date().toISOString(),
        paymentMethodName: params.paymentMethod,
        aiAnalysis: params.aiAnalysis || null,
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
export async function fetchUserOrders(
  userId: string,
  options?: { includeHidden?: boolean }
): Promise<Order[]> {
  if (!userId) return [];

  const includeHidden = Boolean(options?.includeHidden);

  // 1. Try Backend API
  try {
    const res = await fetch(`/api/orders/customer/${userId}?includeHidden=${includeHidden}`);
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
    const res = await fetch(`/api/admin/orders?includeArchived=${includeArchived}`);
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
    houseBuilding: shipAddr.houseBuilding || shipAddr.apartment || '',
    streetArea: shipAddr.streetArea || shipAddr.street || '',
    street: shipAddr.street || shipAddr.streetArea || '',
    apartment: shipAddr.apartment || shipAddr.houseBuilding || '',
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
    paymentMethod: row.payment_method || row.paymentMethod || payRecord.payment_method || 'all_upi',
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

  // 1. Try Backend API
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        note: options?.customDescription || options?.cancellationReason,
        location: options?.location,
        cancellationReason: options?.cancellationReason,
        adminNotes: options?.adminNotes,
      }),
    });
    if (res.ok) {
      // Backend updated successfully
    }
  } catch {
    // Non-fatal if backend endpoint is unavailable
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

  const isConnected = isSupabaseConfigured() && orderId && !orderId.startsWith('local-');
  if (!isConnected) {
    return { success: true, message: `Status updated to ${meta.label}` };
  }

  // 3. Supabase Direct Update
  try {
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('shipment_updates, status_history, admin_notes')
      .eq('id', orderId)
      .maybeSingle();

    const existingUpdates: ShipmentUpdate[] = Array.isArray(currentOrder?.shipment_updates)
      ? currentOrder.shipment_updates
      : [];
    const mergedUpdates = [newUpdate, ...existingUpdates];

    const existingHistory = Array.isArray(currentOrder?.status_history)
      ? currentOrder.status_history
      : [];
    const mergedHistory = [newHistoryItem, ...existingHistory];

    const payload: any = {
      status: newStatus,
      shipment_updates: mergedUpdates as any,
      status_history: mergedHistory as any,
      updated_at: timestamp,
    };

    if (options?.adminNotes !== undefined) {
      payload.admin_notes = options.adminNotes;
    }

    if (newStatus === 'cancelled') {
      payload.cancellation_reason = options?.cancellationReason || 'Cancelled by Administrator';
      payload.cancelled_at = timestamp;
      payload.cancelled_by = options?.cancelledBy || 'admin';
    }

    const { data: updatedData, error: updateErr } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', orderId)
      .select('*, order_items(*), payment_records(*)')
      .maybeSingle();

    if (updateErr) {
      console.warn('Direct Supabase update warning:', updateErr.message);
    }

    // Optional table insert
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
      // Ignored
    }

    return {
      success: true,
      message: `Status updated to ${meta.label} in database`,
      updatedOrder: updatedData ? normalizeOrderRecord(updatedData) : undefined,
    };
  } catch (err: any) {
    console.error('Error updating order status in Supabase:', err);
    return { success: false, message: err.message || 'Failed to update order status' };
  }
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

  // 1. Try Backend API
  try {
    await fetch(`/api/admin/orders/${orderId}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive }),
    });
  } catch {
    // Non-fatal
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

  // 3. Update Supabase
  if (isSupabaseConfigured() && orderId && !orderId.startsWith('local-')) {
    try {
      await supabase
        .from('orders')
        .update({
          is_archived_by_admin: Boolean(archive),
          updated_at: timestamp,
        })
        .eq('id', orderId);
    } catch (err: any) {
      console.warn('Supabase archive warning:', err?.message);
    }
  }

  return {
    success: true,
    message: archive
      ? 'Order archived successfully. It will no longer appear in the active orders list.'
      : 'Order restored to active list.',
  };
}

/**
 * Customer: Request cancellation for an eligible order
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

  const timestamp = new Date().toISOString();

  // 1. Try Backend API
  try {
    const res = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancellationReason, userId }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message || 'Order cancelled successfully.' };
    }
  } catch {
    // Fall back to direct
  }

  // 2. Direct Supabase / local update
  return updateOrderStatus(orderId, 'cancelled', {
    cancellationReason: cancellationReason.trim(),
    cancelledBy: 'customer',
    customTitle: 'Cancellation Requested by Customer',
    customDescription: cancellationReason.trim(),
  });
}

/**
 * Customer: Hide a cancelled/refunded order from their order history
 */
export async function hideCustomerOrder(
  orderId: string,
  userId?: string
): Promise<{ success: boolean; message: string }> {
  const timestamp = new Date().toISOString();

  // 1. Try Backend API
  try {
    await fetch(`/api/orders/${orderId}/hide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    // Non-fatal
  }

  // 2. Update local storage mirror
  try {
    const local: Order[] = JSON.parse(localStorage.getItem('shopcart_orders') || '[]');
    const nextOrders = local.map((ord) => {
      if (ord.id === orderId || ord.order_number === orderId) {
        return {
          ...ord,
          is_hidden_by_customer: true,
          updated_at: timestamp,
        };
      }
      return ord;
    });
    localStorage.setItem('shopcart_orders', JSON.stringify(nextOrders));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shopcart-orders-updated', { detail: { orderId, hidden: true } }));
    }
  } catch {
    // Non-fatal
  }

  // 3. Update Supabase
  if (isSupabaseConfigured() && orderId && !orderId.startsWith('local-')) {
    try {
      await supabase
        .from('orders')
        .update({
          is_hidden_by_customer: true,
          updated_at: timestamp,
        })
        .eq('id', orderId);
    } catch (err: any) {
      console.warn('Supabase hide order warning:', err?.message);
    }
  }

  return { success: true, message: 'Order hidden from your order history.' };
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
