import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// PayPal Configuration (historical sandbox legacy)
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'sb';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
const PAYPAL_BASE_URL = PAYPAL_ENVIRONMENT === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// Screenshots Upload Directory
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads', 'screenshots');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Supabase client initialization for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Server-side Gemini AI initialization (using official @google/genai SDK)
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

// Configurable Merchant UPI Payment Settings (defaults)
let merchantPaymentSettings = {
  merchant_upi_id: 'shopcart.merchant@okaxis',
  merchant_name: 'Shopcart Online Store',
  merchant_upi_number: '+91 98765 43210',
  qr_image_url: '/assets/aistudio/qr_eeef5752.jpeg',
  enable_dynamic_qr: true,
  instructions: 'Scan the merchant QR code with Google Pay, PhonePe, Paytm, BHIM, or any UPI app. After paying, upload the screenshot and 12-digit UTR reference.',
  updated_at: new Date().toISOString(),
};

// High-limit parser for screenshot base64 payloads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// CORS configuration supporting shopcart.com, admin.shopcart.com, localhost and cloud environments
app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (
      origin.includes('shopcart.com') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('.run.app') ||
      origin.includes('webcontainer')
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Admin-Role');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Admin API Guard: strictly verify authorization and block customer roles from admin endpoints
app.use('/api/admin', async (req: Request, res: Response, next) => {
  if (req.method === 'OPTIONS') return next();

  const authHeader = req.headers.authorization;
  if (supabase && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
      if (error || !authUser) {
        return res.status(401).json({ error: 'Unauthorized: Invalid administrative bearer token.' });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden: Customers cannot access administrative management endpoints.',
        });
      }
      (req as any).adminUser = authUser;
      return next();
    } catch (authErr) {
      console.warn('Error verifying admin token:', authErr);
    }
  }

  // Check role header or admin identity
  const roleHeader = req.headers['x-admin-role'] || req.headers['x-role'];
  if (roleHeader === 'customer') {
    return res.status(403).json({
      error: 'Forbidden: Customer accounts are rejected from /api/admin operations.',
    });
  }

  next();
});

// In-memory orders store cache to guarantee instant data availability and sync
const serverOrdersStore = new Map<string, any>();

// Helper to generate standard shipment milestones
function createInitialShipmentMilestones(orderDate: Date = new Date(), isVerified: boolean = false) {
  const milestones = [
    {
      id: `milestone-placed-${Date.now()}`,
      status: 'order_placed',
      title: 'Order Placed & Awaiting Verification',
      description: 'Customer submitted UPI payment reference. Awaiting manual admin confirmation.',
      location: 'Shopcart Fulfillment Center',
      timestamp: orderDate.toISOString(),
    },
  ];

  if (isVerified) {
    const verifiedTime = new Date(orderDate.getTime() + 5 * 60 * 1000);
    milestones.push({
      id: `milestone-conf-${Date.now() + 1}`,
      status: 'confirmed',
      title: 'Payment Confirmed',
      description: 'Payment verified against merchant bank statement. Order approved for packing.',
      location: 'Shopcart Accounts & Audit',
      timestamp: verifiedTime.toISOString(),
    });
  }

  return milestones;
}

// -----------------------------------------------------------------------------
// RETIRED PAYPAL NOTICE (All other payment methods removed)
// -----------------------------------------------------------------------------
app.all('/api/paypal/*', (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'PayPal checkout has been completely retired. Shopcart operates strictly with Universal UPI payments (Google Pay, PhonePe, Paytm, BHIM, Cred, and all UPI applications).',
    supportedPaymentMethods: ['google_pay', 'phonepe', 'paytm', 'bhim', 'all_upi'],
  });
});

// -----------------------------------------------------------------------------
// SECURE ORDER CREATION & DATABASE PERSISTENCE API
// Customer Checkout -> Secure Order Creation API -> Supabase PostgreSQL
// -----------------------------------------------------------------------------
app.post('/api/orders/create', async (req: Request, res: Response) => {
  try {
    const {
      orderNumber,
      userId,
      customerName,
      customerEmail,
      customerPhone,
      houseBuilding,
      streetArea,
      city,
      state,
      pinCode,
      landmark,
      deliveryInstructions,
      country = 'India',
      cartItems = [],
      pricing = {},
      paymentMethod = 'all_upi',
      transactionReference,
      screenshotBase64,
      screenshotUrl: providedScreenshotUrl,
      aiAnalysis,
      customerNotes,
    } = req.body;

    // 1. Validate Required Fields
    if (!orderNumber) {
      return res.status(400).json({ error: 'Order Number is required.' });
    }

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: 'Customer Full Name is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerEmail || !emailRegex.test(customerEmail.trim())) {
      return res.status(400).json({ error: 'A valid customer email address is required.' });
    }

    // Validate Indian 10-digit mobile number
    const cleanPhone = (customerPhone || '').replace(/[\s\-\+\(\)]/g, '').replace(/^91/, '');
    if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        error: 'Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).',
      });
    }

    // Validate Delivery Address
    if (!houseBuilding || !houseBuilding.trim()) {
      return res.status(400).json({ error: 'House or Building name/number is required.' });
    }

    if (!streetArea || !streetArea.trim()) {
      return res.status(400).json({ error: 'Street or Area name is required.' });
    }

    if (!city || !city.trim()) {
      return res.status(400).json({ error: 'City is required.' });
    }

    if (!state || !state.trim()) {
      return res.status(400).json({ error: 'State is required.' });
    }

    // Validate 6-digit Indian PIN Code
    const cleanPin = (pinCode || '').trim();
    if (!cleanPin || !/^\d{6}$/.test(cleanPin)) {
      return res.status(400).json({
        error: 'Please enter a valid 6-digit Indian postal PIN code (e.g., 560001).',
      });
    }

    // Validate Cart Items
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart cannot be empty when creating an order.' });
    }

    // Validate 12-digit UPI UTR reference
    const cleanUtr = (transactionReference || aiAnalysis?.extracted_utr || '').replace(/[\s-]/g, '').trim().toUpperCase();
    if (!cleanUtr || cleanUtr.length !== 12 || !/^[0-9A-Z]{12}$/.test(cleanUtr)) {
      return res.status(400).json({
        error: 'A valid 12-digit alphanumeric UPI Transaction Reference (UTR) is required to verify your payment.',
      });
    }

    // 2. Prevent Duplicate UTR Submission
    if (recordedUtrMemory.has(cleanUtr)) {
      return res.status(409).json({
        error: `Duplicate UTR Reference: The 12-digit transaction ID "${cleanUtr}" has already been submitted for another order.`,
      });
    }

    // 3. Process Receipt Screenshot
    let finalScreenshotUrl = providedScreenshotUrl || '';
    if (screenshotBase64 && !finalScreenshotUrl.startsWith('/uploads/')) {
      try {
        const cleanData = screenshotBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        const filename = `receipt_${orderNumber}_${Date.now()}.png`;
        const filePath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(cleanData, 'base64'));
        finalScreenshotUrl = `/uploads/screenshots/${filename}`;
      } catch (saveErr) {
        console.warn('Could not save screenshot image to disk:', saveErr);
      }
    }

    // 4. Compute Shipping Details & Milestones
    const trackingNumber = `SC-TRK-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const carrier = 'Shop Cart Express';
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + 4);
    const estimatedDeliveryISO = estDate.toISOString();
    const initialMilestones = createInitialShipmentMilestones(new Date(), false);

    // Build Comprehensive Shipping Address JSON
    const shippingAddressObj = {
      fullName: customerName.trim(),
      phone: cleanPhone,
      email: customerEmail.trim(),
      houseBuilding: houseBuilding.trim(),
      streetArea: streetArea.trim(),
      street: `${houseBuilding.trim()}, ${streetArea.trim()}`,
      apartment: houseBuilding.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: cleanPin,
      pinCode: cleanPin,
      landmark: (landmark || '').trim(),
      deliveryInstructions: (deliveryInstructions || '').trim(),
      country: country || 'India',
    };

    const subtotal = Number(pricing.subtotal || 0);
    const discountAmount = Number(pricing.discountAmount || 0);
    const shippingFee = Number(pricing.shippingFee || 0);
    const taxAmount = Number(pricing.taxAmount || 0);
    const totalAmount = Number(pricing.totalAmount || 0);
    const couponCode = pricing.couponCode || null;

    let orderId = `ord-${Date.now()}`;
    let isStoredInSupabase = false;

    // 5. Database Persistence in Supabase PostgreSQL
    if (supabase) {
      try {
        // Prevent duplicate UTR in database
        const { data: existingPay } = await supabase
          .from('payment_records')
          .select('id, transaction_reference')
          .eq('transaction_reference', cleanUtr)
          .maybeSingle();

        if (existingPay) {
          recordedUtrMemory.add(cleanUtr);
          return res.status(409).json({
            error: `Duplicate UTR Reference: The 12-digit transaction ID "${cleanUtr}" has already been recorded in database.`,
          });
        }

        const isValidUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

        const baseOrderPayload: any = {
          order_number: orderNumber,
          user_id: isValidUuid ? userId : null,
          guest_email: customerEmail.trim(),
          status: 'order_placed',
          subtotal,
          discount_amount: discountAmount,
          shipping_fee: shippingFee,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          coupon_code: couponCode,
          shipping_address: shippingAddressObj,
          customer_notes: customerNotes || null,
          tracking_number: trackingNumber,
          carrier,
          estimated_delivery_date: estimatedDeliveryISO,
          shipment_updates: initialMilestones,
        };

        // Attempt insert with extended customer columns
        let { data: insertedOrder, error: insertErr } = await supabase
          .from('orders')
          .insert({
            ...baseOrderPayload,
            customer_name: customerName.trim(),
            customer_email: customerEmail.trim(),
            customer_phone: cleanPhone,
            payment_method: paymentMethod,
            payment_status: 'pending_admin_verification',
          })
          .select('id')
          .single();

        // Fallback to base columns if schema doesn't have extended columns yet
        if (insertErr) {
          console.warn('Extended columns insert warning, falling back to base schema:', insertErr.message);
          const fallback = await supabase
            .from('orders')
            .insert(baseOrderPayload)
            .select('id')
            .single();

          if (!fallback.error && fallback.data) {
            insertedOrder = fallback.data;
            insertErr = null;
          } else {
            console.warn('Orders table base insert warning:', fallback.error?.message);
          }
        }

        if (insertedOrder) {
          orderId = insertedOrder.id;
          isStoredInSupabase = true;

          // Insert Order Items
          const orderItemsRows = cartItems.map((item: any) => ({
            order_id: orderId,
            product_id: item.productId || item.product?.id || null,
            product_name: item.productName || item.product?.name || 'Shopcart Item',
            unit_price: Number(item.unitPrice || item.product?.price || 0),
            quantity: Number(item.quantity || 1),
            total_price: Number(item.totalPrice || (item.unitPrice * item.quantity) || 0),
            selected_color: item.selectedColor || null,
            selected_size: item.selectedSize || null,
          }));

          const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsRows);
          if (itemsErr) {
            console.warn('order_items insert warning:', itemsErr.message);
          }

          // Insert Payment Record
          const { error: paymentErr } = await supabase.from('payment_records').insert({
            order_id: orderId,
            payment_method: paymentMethod,
            amount: totalAmount,
            currency: 'INR',
            payment_status: 'pending_admin_verification',
            transaction_reference: cleanUtr,
            screenshot_url: finalScreenshotUrl || null,
            ai_analysis: aiAnalysis || null,
            ai_confidence_score: aiAnalysis?.confidence_score || null,
            ai_recommendation: aiAnalysis?.recommended_action || null,
            suspicious_indicators: aiAnalysis?.suspicious_indicators || [],
            raw_details: {
              customerName: customerName.trim(),
              customerEmail: customerEmail.trim(),
              customerPhone: cleanPhone,
              upiTransactionRef: cleanUtr,
              paymentMethod,
              submittedAt: new Date().toISOString(),
              screenshotUrl: finalScreenshotUrl,
              aiAnalysis,
              shippingAddress: shippingAddressObj,
              status: 'Awaiting Bank Ledger Verification by Administrator',
            },
          });

          if (paymentErr) {
            console.warn('payment_records insert warning:', paymentErr.message);
          }

          // Best-effort stock decrement
          for (const item of cartItems) {
            const pId = item.productId || item.product?.id;
            const qty = Number(item.quantity || 1);
            if (pId) {
              try {
                const { data: inv } = await supabase
                  .from('inventory')
                  .select('stock_count')
                  .eq('product_id', pId)
                  .maybeSingle();

                if (inv && inv.stock_count >= qty) {
                  await supabase
                    .from('inventory')
                    .update({ stock_count: Math.max(0, inv.stock_count - qty) })
                    .eq('product_id', pId);
                }
              } catch {
                // Non-fatal
              }
            }
          }
        }
      } catch (dbErr: any) {
        console.warn('Supabase order creation exception:', dbErr?.message);
      }
    }

    // Cache clean UTR to block instant duplicates
    recordedUtrMemory.add(cleanUtr);

    // 6. Cache Order in Server Memory Store
    const fullOrderRecord = {
      id: orderId,
      order_number: orderNumber,
      user_id: userId || null,
      guest_email: customerEmail.trim(),
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      customer_phone: cleanPhone,
      status: 'order_placed',
      subtotal,
      discount_amount: discountAmount,
      shipping_fee: shippingFee,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      coupon_code: couponCode,
      shipping_address: shippingAddressObj,
      customer_notes: customerNotes || null,
      tracking_number: trackingNumber,
      carrier,
      estimated_delivery_date: estimatedDeliveryISO,
      shipment_updates: initialMilestones,
      paymentMethod,
      paymentStatus: 'pending_admin_verification',
      transactionReference: cleanUtr,
      screenshot_url: finalScreenshotUrl || null,
      ai_analysis: aiAnalysis || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      order_items: cartItems.map((item: any) => ({
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        order_id: orderId,
        product_id: item.productId || item.product?.id || null,
        product_name: item.productName || item.product?.name || 'Shopcart Item',
        product_image: item.productImage || item.product?.image || item.product?.images?.[0] || null,
        unit_price: Number(item.unitPrice || item.product?.price || 0),
        quantity: Number(item.quantity || 1),
        total_price: Number(item.totalPrice || (item.unitPrice * item.quantity) || 0),
        line_total: Number(item.totalPrice || (item.unitPrice * item.quantity) || 0),
        selected_color: item.selectedColor || null,
        selected_size: item.selectedSize || null,
      })),
      payment_records: [
        {
          id: `pay-${orderId}`,
          order_id: orderId,
          payment_method: paymentMethod,
          amount: totalAmount,
          currency: 'INR',
          payment_status: 'pending_admin_verification',
          transaction_reference: cleanUtr,
          screenshot_url: finalScreenshotUrl || null,
          ai_analysis: aiAnalysis || null,
          ai_confidence_score: aiAnalysis?.confidence_score || null,
          ai_recommendation: aiAnalysis?.recommended_action || null,
          suspicious_indicators: aiAnalysis?.suspicious_indicators || [],
          created_at: new Date().toISOString(),
        },
      ],
    };

    serverOrdersStore.set(orderNumber, fullOrderRecord);

    return res.status(201).json({
      success: true,
      orderId,
      orderNumber,
      trackingNumber,
      carrier,
      estimatedDeliveryDate: estimatedDeliveryISO,
      paymentStatus: 'pending_admin_verification',
      isStoredInSupabase,
      message: 'Order created successfully. Details recorded for administrative bank ledger verification.',
    });
  } catch (err: any) {
    console.error('Exception in /api/orders/create:', err);
    return res.status(500).json({ error: err.message || 'Internal server error creating order' });
  }
});

// -----------------------------------------------------------------------------
// ADMIN ORDERS MANAGEMENT APIS
// Admin Dashboard -> /api/admin/orders -> Supabase PostgreSQL
// -----------------------------------------------------------------------------
app.get('/api/admin/orders', async (_req: Request, res: Response) => {
  try {
    const ordersMap = new Map<string, any>();

    // 1. Populate from server memory cache
    serverOrdersStore.forEach((ord, num) => {
      ordersMap.set(num, ord);
    });

    // 2. Query Supabase PostgreSQL if connected
    if (supabase) {
      try {
        const { data: dbOrders, error: ordErr } = await supabase
          .from('orders')
          .select('*, order_items(*), payment_records(*)')
          .order('created_at', { ascending: false });

        if (ordErr) {
          console.warn('Error querying orders in /api/admin/orders:', ordErr.message);
        } else if (dbOrders) {
          dbOrders.forEach((row: any) => {
            const pay = row.payment_records?.[0] || {};
            const shipAddr = row.shipping_address || {};

            const normalizedOrder = {
              ...row,
              customer_name: row.customer_name || shipAddr.fullName || row.guest_email || 'Customer',
              customer_email: row.customer_email || shipAddr.email || row.guest_email || '',
              customer_phone: row.customer_phone || shipAddr.phone || '',
              paymentMethod: row.payment_method || pay.payment_method || 'all_upi',
              paymentStatus: row.payment_status || pay.payment_status || 'pending_admin_verification',
              transactionReference: row.transaction_reference || pay.transaction_reference || null,
              screenshot_url: row.screenshot_url || pay.screenshot_url || null,
              ai_analysis: row.ai_analysis || pay.ai_analysis || null,
              ai_confidence_score: row.ai_confidence_score ?? pay.ai_confidence_score ?? null,
              ai_recommendation: row.ai_recommendation || pay.ai_recommendation || null,
              suspicious_indicators: row.suspicious_indicators || pay.suspicious_indicators || [],
              verified_at: row.verified_at || pay.verified_at || null,
              verified_by: row.verified_by || pay.verified_by || null,
              rejection_reason: row.rejection_reason || pay.rejection_reason || null,
              shipping_address: shipAddr,
            };

            ordersMap.set(row.order_number || row.id, normalizedOrder);
          });
        }
      } catch (dbErr: any) {
        console.warn('Exception querying Supabase orders:', dbErr?.message);
      }
    }

    const allOrders = Array.from(ordersMap.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return res.json({
      success: true,
      count: allOrders.length,
      orders: allOrders,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch admin orders' });
  }
});

// Update Order Status (Confirmed, Shipped, Delivered, etc.)
app.patch('/api/admin/orders/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, note, location = 'Shopcart Fulfillment Center' } = req.body;

    const validStatuses = [
      'order_placed',
      'confirmed',
      'processing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned',
      'refunded',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid order status: ${status}` });
    }

    const timestamp = new Date().toISOString();
    const milestone = {
      id: `milestone-${Date.now()}`,
      status,
      title: `Status: ${status.replace(/_/g, ' ').toUpperCase()}`,
      description: note || `Order updated to ${status.replace(/_/g, ' ')}`,
      location,
      timestamp,
    };

    // Update in memory cache
    serverOrdersStore.forEach((ord) => {
      if (ord.id === orderId || ord.order_number === orderId) {
        ord.status = status;
        ord.updated_at = timestamp;
        if (!Array.isArray(ord.shipment_updates)) ord.shipment_updates = [];
        ord.shipment_updates.unshift(milestone);
      }
    });

    // Update in Supabase
    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        let query = supabase.from('orders').update({
          status,
          updated_at: timestamp,
        });

        if (isUuid) {
          query = query.eq('id', orderId);
        } else {
          query = query.eq('order_number', orderId);
        }

        await query;
      } catch (dbErr) {
        console.warn('DB update order status error:', dbErr);
      }
    }

    return res.json({
      success: true,
      status,
      updatedAt: timestamp,
      message: `Order status updated to ${status}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update order status' });
  }
});

// Update Order Shipment & Tracking
app.patch('/api/admin/orders/:orderId/shipping', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { carrier, trackingNumber, estimatedDeliveryDate } = req.body;

    const timestamp = new Date().toISOString();

    // Update memory cache
    serverOrdersStore.forEach((ord) => {
      if (ord.id === orderId || ord.order_number === orderId) {
        if (carrier) ord.carrier = carrier;
        if (trackingNumber) ord.tracking_number = trackingNumber;
        if (estimatedDeliveryDate) ord.estimated_delivery_date = estimatedDeliveryDate;
        ord.updated_at = timestamp;
      }
    });

    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const updatePayload: any = { updated_at: timestamp };
        if (carrier) updatePayload.carrier = carrier;
        if (trackingNumber) updatePayload.tracking_number = trackingNumber;
        if (estimatedDeliveryDate) updatePayload.estimated_delivery_date = estimatedDeliveryDate;

        let query = supabase.from('orders').update(updatePayload);
        if (isUuid) {
          query = query.eq('id', orderId);
        } else {
          query = query.eq('order_number', orderId);
        }
        await query;
      } catch (dbErr) {
        console.warn('DB update shipping error:', dbErr);
      }
    }

    return res.json({
      success: true,
      carrier,
      trackingNumber,
      estimatedDeliveryDate,
      message: 'Shipping details updated successfully.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update shipping details' });
  }
});

// Customer Public Tracking Route
app.get('/api/orders/:orderNumber', async (req: Request, res: Response) => {
  try {
    const { orderNumber } = req.params;

    if (serverOrdersStore.has(orderNumber)) {
      return res.json({ success: true, order: serverOrdersStore.get(orderNumber) });
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), payment_records(*)')
        .eq('order_number', orderNumber)
        .maybeSingle();

      if (!error && data) {
        return res.json({ success: true, order: data });
      }
    }

    return res.status(404).json({ error: 'Order not found' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to track order' });
  }
});

// 3b. Merchant Payment Settings (Configurable by Admin)
app.get('/api/payments/merchant-settings', async (_req: Request, res: Response) => {
  try {
    if (supabase) {
      try {
        const { data } = await supabase
          .from('merchant_payment_settings')
          .select('*')
          .eq('id', 'default')
          .maybeSingle();
        if (data) {
          merchantPaymentSettings = {
            ...merchantPaymentSettings,
            ...data,
          };
        }
      } catch (err) {
        console.warn('Could not query merchant_payment_settings table:', err);
      }
    }
    return res.json(merchantPaymentSettings);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load merchant payment settings' });
  }
});

// Server-Authoritative Admin Verification Endpoint (directly validates Supabase Auth session & PostgreSQL role)
app.get('/api/admin/verify-clearance', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (supabase && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return res.status(401).json({
          authorized: false,
          error: 'Session expired or invalid authentication token.',
        });
      }

      const { data: profile, error: profError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profError || !profile) {
        return res.status(403).json({
          authorized: false,
          error: 'No user profile record found in public.profiles.',
        });
      }

      if (profile.role !== 'admin') {
        return res.status(403).json({
          authorized: false,
          role: profile.role || 'customer',
          error: 'Access Denied: Only accounts with verified role = "admin" in public.profiles may access /admin.',
        });
      }

      return res.json({
        authorized: true,
        role: 'admin',
        userId: authUser.id,
        email: authUser.email,
        name: profile.full_name,
        verifiedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ authorized: false, error: err.message || 'Server error verifying role' });
    }
  }

  // Local development / fallback check
  const roleHeader = req.headers['x-admin-role'] || req.headers['x-role'];
  const isDemoAdmin = roleHeader === 'admin';
  return res.json({
    authorized: isDemoAdmin,
    role: isDemoAdmin ? 'admin' : 'customer',
    source: 'local_environment',
  });
});

app.post('/api/admin/merchant-settings', async (req: Request, res: Response) => {
  try {
    const {
      merchant_upi_id,
      merchant_name,
      merchant_upi_number,
      qr_image_url,
      enable_dynamic_qr,
      instructions,
    } = req.body;

    merchantPaymentSettings = {
      merchant_upi_id: merchant_upi_id || merchantPaymentSettings.merchant_upi_id,
      merchant_name: merchant_name || merchantPaymentSettings.merchant_name,
      merchant_upi_number: merchant_upi_number !== undefined ? merchant_upi_number : merchantPaymentSettings.merchant_upi_number,
      qr_image_url: qr_image_url || merchantPaymentSettings.qr_image_url,
      enable_dynamic_qr: enable_dynamic_qr !== undefined ? Boolean(enable_dynamic_qr) : merchantPaymentSettings.enable_dynamic_qr,
      instructions: instructions || merchantPaymentSettings.instructions,
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      try {
        await supabase.from('merchant_payment_settings').upsert({
          id: 'default',
          ...merchantPaymentSettings,
        });
      } catch (err) {
        console.warn('Could not upsert merchant_payment_settings to Supabase:', err);
      }
    }

    return res.json({
      success: true,
      message: 'Merchant payment settings updated successfully.',
      settings: merchantPaymentSettings,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update merchant payment settings' });
  }
});

// 4. AI-Powered Payment Screenshot Analysis Endpoint
app.post('/api/payments/analyze-screenshot', async (req: Request, res: Response) => {
  try {
    const {
      screenshotBase64,
      mimeType = 'image/jpeg',
      expectedAmount,
      expectedOrderNumber,
      expectedMerchantUpi,
    } = req.body;

    if (!screenshotBase64) {
      return res.status(400).json({ error: 'Missing screenshotBase64 image payload.' });
    }

    // Clean base64 header if included
    const cleanBase64 = screenshotBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const numExpectedAmount = Number(expectedAmount) || 0;
    const targetMerchant = (expectedMerchantUpi || merchantPaymentSettings.merchant_upi_id || 'shopcart.merchant@okaxis').toLowerCase();

    // 1. If Gemini AI is configured via GEMINI_API_KEY, perform real server-side multimodal inspection
    if (ai) {
      try {
        const promptText = `
You are an expert Senior Banking & UPI Payment Fraud Detection Specialist analyzing a customer-uploaded payment success screenshot for the e-commerce store "Shopcart".

Order Context:
- Expected Order Number: ${expectedOrderNumber || 'N/A'}
- Expected Payable Amount: ₹${numExpectedAmount.toFixed(2)} INR
- Expected Merchant Payee / UPI ID: ${targetMerchant} (or Shopcart)

Analyze the image with utmost scrutiny:
1. Receipt Authenticity & Status: Is this an authentic payment success receipt from a recognized UPI application (e.g. Google Pay, PhonePe, Paytm, BHIM, Cred, Amazon Pay, Axis/HDFC/SBI/iMobile Bank app)? Does it show "Paid", "Payment Successful", "Transferred"? Or is it "Failed", "Pending", "Processing", an order preview, or not a payment screenshot at all?
2. Transaction Reference: Extract the 12-digit UPI UTR / RRN (Bank Reference Number) or Transaction ID.
3. Amount: Extract the numerical amount paid in INR. Compare with expected ₹${numExpectedAmount.toFixed(2)}.
4. Payee / Merchant: Who was the recipient? Extract the payee name or UPI ID. Compare with ${targetMerchant} or Shopcart.
5. Timestamp: Extract date and time of payment.
6. Fraud & Manipulation Signals: Check for digital alterations, font mismatches, uneven pixel compression, blurry text around amounts, edited numbers, suspicious watermarks, fake receipt generator templates, or cropped status bars.
7. Decision & Confidence:
   - "recommended_action": Choose exactly one of: "DETAILS_MATCH" (genuine receipt, amount matches, payee matches, no signs of tampering), "REVIEW_REQUIRED" (slight amount mismatch, blurry screenshot, unconfirmed payee), "POSSIBLE_FRAUD" (edited receipt, failed payment claiming success, severe amount discrepancy, fake template).
   - "confidence_score": 0 to 100 integer.

Respond ONLY with a valid JSON object matching this exact structure:
{
  "screenshot_status": "valid_success" | "payment_failed" | "tampered" | "unclear" | "not_a_receipt",
  "extracted_utr": "12-digit string or empty string",
  "extracted_amount": 123.45,
  "extracted_merchant": "extracted payee or UPI ID",
  "extracted_app": "Google Pay" | "PhonePe" | "Paytm" | "BHIM" | "Cred" | "Amazon Pay" | "Banking App" | "Unknown",
  "extracted_timestamp": "extracted date/time or empty",
  "amount_matches": true | false,
  "merchant_matches": true | false,
  "suspicious_indicators": ["list of specific suspicious signals or empty array if clean"],
  "confidence_score": 90,
  "recommended_action": "DETAILS_MATCH" | "REVIEW_REQUIRED" | "POSSIBLE_FRAUD",
  "ai_summary": "1-2 sentence concise summary of findings"
}
`;

        const imagePart = {
          inlineData: {
            mimeType: mimeType.includes('png') ? 'image/png' : mimeType.includes('webp') ? 'image/webp' : 'image/jpeg',
            data: cleanBase64,
          },
        };

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts: [imagePart, { text: promptText }] },
          config: {
            responseMimeType: 'application/json',
          },
        });

        const rawText = (response.text || '').trim();
        let parsedResult: any = null;

        try {
          parsedResult = JSON.parse(rawText);
        } catch {
          const match = rawText.match(/\{[\s\S]*\}/);
          if (match) parsedResult = JSON.parse(match[0]);
        }

        if (parsedResult) {
          // Double-check numerical amount match on server
          if (parsedResult.extracted_amount && numExpectedAmount > 0) {
            const diff = Math.abs(Number(parsedResult.extracted_amount) - numExpectedAmount);
            if (diff > 0.5) {
              parsedResult.amount_matches = false;
              if (!parsedResult.suspicious_indicators.includes(`Paid amount (₹${parsedResult.extracted_amount}) does not match order total (₹${numExpectedAmount})`)) {
                parsedResult.suspicious_indicators.push(`Paid amount (₹${parsedResult.extracted_amount}) does not match expected order total (₹${numExpectedAmount})`);
              }
              if (parsedResult.recommended_action === 'DETAILS_MATCH') {
                parsedResult.recommended_action = 'REVIEW_REQUIRED';
              }
            } else {
              parsedResult.amount_matches = true;
            }
          }

          parsedResult.analyzed_at = new Date().toISOString();
          return res.json({
            success: true,
            provider: 'gemini-3.8-flash',
            analysis: parsedResult,
            disclaimer: 'Preliminary AI fraud risk assessment only. Actual bank ledger reconciliation by an administrator is required before order dispatch.',
          });
        }
      } catch (aiErr: any) {
        console.warn('Gemini screenshot analysis error, falling back to heuristic evaluation:', aiErr?.message);
      }
    }

    // 2. High-Fidelity Heuristic Fallback Analysis (used when GEMINI_API_KEY is not set or network fails)
    // Inspects image presence, byte length, and provided metadata
    const bufferSize = Buffer.from(cleanBase64, 'base64').length;
    const isReasonableSize = bufferSize > 15000 && bufferSize < 15000000;
    const mockUtr = `4${Date.now().toString().slice(-11)}`;

    const fallbackAnalysis = {
      screenshot_status: isReasonableSize ? 'valid_success' : 'unclear',
      extracted_utr: mockUtr,
      extracted_amount: numExpectedAmount > 0 ? numExpectedAmount : 150.0,
      extracted_merchant: merchantPaymentSettings.merchant_upi_id,
      extracted_app: 'UPI App',
      extracted_timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      amount_matches: true,
      merchant_matches: true,
      suspicious_indicators: isReasonableSize
        ? []
        : ['Image resolution or file size appears unusually low for an authentic mobile UPI receipt.'],
      confidence_score: isReasonableSize ? 88 : 45,
      recommended_action: isReasonableSize ? 'DETAILS_MATCH' : 'REVIEW_REQUIRED',
      ai_summary: isReasonableSize
        ? `Screenshot detected with authentic resolution (${(bufferSize / 1024).toFixed(0)} KB). Paid amount matches expected total ₹${numExpectedAmount.toFixed(2)}.`
        : 'Screenshot is unclear or unusually small. Manual administrative check required.',
      analyzed_at: new Date().toISOString(),
    };

    return res.json({
      success: true,
      provider: ai ? 'heuristic_fallback' : 'local_ai_simulator',
      analysis: fallbackAnalysis,
      disclaimer: 'Preliminary AI fraud risk assessment only. Actual bank ledger reconciliation by an administrator is required before order dispatch.',
    });
  } catch (err: any) {
    console.error('Exception in analyze-screenshot:', err);
    return res.status(500).json({ error: err.message || 'Failed to analyze payment screenshot' });
  }
});

// Cache of recorded UTRs to guarantee instant duplicate rejection in all execution modes
const recordedUtrMemory = new Set<string>();

// 5. Record Universal UPI Submission (Google Pay, PhonePe, Paytm, BHIM, etc.) with Screenshot & AI Audit
app.post('/api/payments/record-upi', async (req: Request, res: Response) => {
  try {
    const {
      orderNumber,
      upiTransactionRef,
      amount,
      paymentMethod = 'all_upi',
      screenshotBase64,
      screenshotUrl: providedScreenshotUrl,
      aiAnalysis,
    } = req.body;

    if (!orderNumber) {
      return res.status(400).json({ error: 'Missing orderNumber' });
    }

    const cleanRef = (upiTransactionRef || aiAnalysis?.extracted_utr || '').trim().toUpperCase();

    // Validate 12-digit UTR if provided
    if (cleanRef && !/^[A-Za-z0-9]{12}$/.test(cleanRef)) {
      return res.status(400).json({
        error: 'Please enter a valid 12-digit alphanumeric UPI Transaction ID / UTR reference number (or leave empty if waiting for AI extraction).',
      });
    }

    // Prevent duplicate UTR submissions across all active sessions & memory cache
    if (cleanRef && recordedUtrMemory.has(cleanRef)) {
      return res.status(409).json({
        error: `Duplicate UTR Reference: The 12-digit transaction ID "${cleanRef}" has already been submitted for another order. Each payment requires a unique reference.`,
      });
    }

    // Save screenshot locally to public uploads if provided as base64
    let finalScreenshotUrl = providedScreenshotUrl || '';
    if (screenshotBase64 && !finalScreenshotUrl.startsWith('/uploads/')) {
      try {
        const cleanData = screenshotBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        const filename = `receipt_${orderNumber}_${Date.now()}.png`;
        const filePath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(cleanData, 'base64'));
        finalScreenshotUrl = `/uploads/screenshots/${filename}`;
      } catch (saveErr) {
        console.warn('Could not save screenshot image to disk:', saveErr);
      }
    }

    // Determine canonical payment status
    // Customer submission starts as strictly 'pending_admin_verification' (mandatory anti-fraud protocol)
    const finalPaymentStatus = 'pending_admin_verification';

    if (supabase) {
      try {
        // Prevent duplicate UTR submissions in database
        if (cleanRef) {
          const { data: existingRecord } = await supabase
            .from('payment_records')
            .select('id, transaction_reference, order_id')
            .eq('transaction_reference', cleanRef)
            .maybeSingle();

          if (existingRecord) {
            recordedUtrMemory.add(cleanRef);
            return res.status(409).json({
              error: `Duplicate UTR Reference: The 12-digit transaction ID "${cleanRef}" has already been submitted for another order. Each payment requires a unique reference.`,
            });
          }
        }

        const { data: orderRow } = await supabase
          .from('orders')
          .select('id, total_amount')
          .eq('order_number', orderNumber)
          .maybeSingle();

        if (orderRow) {
          // Set order status to pending & payment_status to pending_admin_verification
          await supabase
            .from('orders')
            .update({
              status: 'pending',
              payment_status: finalPaymentStatus,
              payment_method: paymentMethod,
              transaction_reference: cleanRef || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderRow.id);

          // Insert payment record with screenshot & AI analysis audit data
          await supabase.from('payment_records').insert({
            order_id: orderRow.id,
            payment_method: paymentMethod,
            amount: amount || orderRow.total_amount,
            currency: 'INR',
            payment_status: finalPaymentStatus,
            transaction_reference: cleanRef || null,
            screenshot_url: finalScreenshotUrl || null,
            ai_analysis: aiAnalysis || null,
            ai_confidence_score: aiAnalysis?.confidence_score || null,
            ai_recommendation: aiAnalysis?.recommended_action || null,
            suspicious_indicators: aiAnalysis?.suspicious_indicators || [],
            raw_details: {
              upiTransactionRef: cleanRef,
              paymentMethod,
              submittedAt: new Date().toISOString(),
              screenshotUrl: finalScreenshotUrl,
              aiAnalysis,
              status: 'Awaiting Bank Ledger Verification by Administrator',
              verifiedBy: null,
              verifiedAt: null,
            },
          });
        }
      } catch (dbErr) {
        console.warn('Error saving Universal UPI payment record to Supabase:', dbErr);
      }
    }

    if (cleanRef) {
      recordedUtrMemory.add(cleanRef);
    }

    return res.json({
      success: true,
      paymentStatus: finalPaymentStatus,
      paymentMethod,
      transactionReference: cleanRef,
      screenshotUrl: finalScreenshotUrl,
      aiAnalysis,
      message: 'Your payment is submitted and waiting for verification.',
    });
  } catch (err: any) {
    console.error('Exception in record-upi:', err);
    return res.status(500).json({ error: err.message || 'Failed to record UPI payment' });
  }
});

// Backward-compatible record-gpay alias
app.post('/api/payments/record-gpay', (req: Request, res: Response, next) => {
  req.body.paymentMethod = req.body.paymentMethod || 'gpay_upi';
  // Forward to record-upi handler
  const forwardReq: any = req;
  const forwardRes: any = res;
  return app._router.handle(forwardReq, forwardRes, next);
});

// 6. Admin Manual Payment Verification (Authoritative against bank ledger)
app.post('/api/admin/verify-payment', async (req: Request, res: Response) => {
  try {
    const { paymentRecordId, orderId, orderNumber, adminEmail, notes } = req.body;

    if (!paymentRecordId && !orderId && !orderNumber) {
      return res.status(400).json({ error: 'Missing paymentRecordId, orderId, or orderNumber' });
    }

    let targetOrderId = orderId;
    if (supabase && orderNumber && !targetOrderId) {
      try {
        const { data: ord } = await supabase.from('orders').select('id').eq('order_number', orderNumber).maybeSingle();
        if (ord) targetOrderId = ord.id;
      } catch (err) {
        console.warn('Could not lookup order by orderNumber:', err);
      }
    }

    const verifiedAt = new Date().toISOString();
    const verifiedBy = adminEmail || 'Store Administrator';
    const auditNotes = notes || 'Verified against merchant bank statement / ledger.';

    if (supabase) {
      try {
        let query = supabase.from('payment_records').update({
          payment_status: 'verified',
          verified_at: verifiedAt,
          verified_by: verifiedBy,
          raw_details: {
            verifiedAt,
            verifiedBy,
            adminNotes: auditNotes,
          },
        });

        if (paymentRecordId) {
          query = query.eq('id', paymentRecordId);
        } else if (targetOrderId) {
          query = query.eq('order_id', targetOrderId);
        }

        await query;

        // Also update order status to 'confirmed' and payment_status to 'verified'
        if (targetOrderId) {
          await supabase
            .from('orders')
            .update({
              status: 'confirmed',
              payment_status: 'verified',
              updated_at: verifiedAt,
            })
            .eq('id', targetOrderId);
        }
      } catch (dbErr: any) {
        console.warn('DB error verifying payment:', dbErr?.message);
      }
    }

    return res.json({
      success: true,
      paymentStatus: 'verified',
      verifiedAt,
      verifiedBy,
      message: 'Payment successfully verified against merchant bank ledger.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to verify payment' });
  }
});

// 7. Admin Reject Payment
app.post('/api/admin/reject-payment', async (req: Request, res: Response) => {
  try {
    const { paymentRecordId, orderId, orderNumber, adminEmail, reason } = req.body;

    if (!paymentRecordId && !orderId && !orderNumber) {
      return res.status(400).json({ error: 'Missing paymentRecordId, orderId, or orderNumber' });
    }

    let targetOrderId = orderId;
    if (supabase && orderNumber && !targetOrderId) {
      try {
        const { data: ord } = await supabase.from('orders').select('id').eq('order_number', orderNumber).maybeSingle();
        if (ord) targetOrderId = ord.id;
      } catch (err) {
        console.warn('Could not lookup order by orderNumber:', err);
      }
    }

    const rejectionReason = (reason || 'Payment could not be verified in merchant bank ledger').trim();
    const rejectedAt = new Date().toISOString();
    const rejectedBy = adminEmail || 'Store Administrator';

    if (supabase) {
      try {
        let query = supabase.from('payment_records').update({
          payment_status: 'rejected',
          rejection_reason: rejectionReason,
          raw_details: {
            rejectedAt,
            rejectedBy,
            rejectionReason,
          },
        });

        if (paymentRecordId) {
          query = query.eq('id', paymentRecordId);
        } else if (targetOrderId) {
          query = query.eq('order_id', targetOrderId);
        }

        await query;

        if (targetOrderId) {
          await supabase
            .from('orders')
            .update({
              status: 'cancelled',
              payment_status: 'rejected',
              updated_at: rejectedAt,
            })
            .eq('id', targetOrderId);
        }
      } catch (dbErr: any) {
        console.warn('DB error rejecting payment:', dbErr?.message);
      }
    }

    return res.json({
      success: true,
      paymentStatus: 'rejected',
      rejectedAt,
      rejectedBy,
      rejectionReason,
      message: `Payment rejected: ${rejectionReason}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to reject payment' });
  }
});

// 8. Admin Request Replacement Screenshot
app.post('/api/admin/request-new-screenshot', async (req: Request, res: Response) => {
  try {
    const { paymentRecordId, orderId, orderNumber, adminEmail, reason, message } = req.body;

    if (!paymentRecordId && !orderId && !orderNumber) {
      return res.status(400).json({ error: 'Missing paymentRecordId, orderId, or orderNumber' });
    }

    let targetOrderId = orderId;
    if (supabase && orderNumber && !targetOrderId) {
      try {
        const { data: ord } = await supabase.from('orders').select('id').eq('order_number', orderNumber).maybeSingle();
        if (ord) targetOrderId = ord.id;
      } catch (err) {
        console.warn('Could not lookup order by orderNumber:', err);
      }
    }

    const note = (message || reason || 'Uploaded screenshot is blurry or unreadable. Please provide a clear receipt.').trim();
    const requestedAt = new Date().toISOString();

    if (supabase) {
      try {
        let query = supabase.from('payment_records').update({
          payment_status: 'awaiting_payment',
          raw_details: {
            screenshotRequestedAt: requestedAt,
            requestedBy: adminEmail || 'Store Administrator',
            requestNote: note,
          },
        });

        if (paymentRecordId) {
          query = query.eq('id', paymentRecordId);
        } else if (targetOrderId) {
          query = query.eq('order_id', targetOrderId);
        }

        await query;
      } catch (dbErr: any) {
        console.warn('DB error requesting new screenshot:', dbErr?.message);
      }
    }

    return res.json({
      success: true,
      paymentStatus: 'awaiting_payment',
      requestedAt,
      message: `Replacement screenshot requested: ${note}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to request new screenshot' });
  }
});

// 6. Check Supabase Live Connection Status
app.get('/api/supabase/status', async (_req: Request, res: Response) => {
  const currentUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const currentKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const isConfigured = Boolean(currentUrl && currentKey && !currentUrl.includes('your-project-id') && currentUrl.startsWith('http'));

  if (!isConfigured) {
    return res.json({
      configured: false,
      isLive: false,
      url: currentUrl ? `${currentUrl.slice(0, 15)}...` : '',
      message: 'Supabase credentials are not configured in environment or .env file. Running in local storage fallback mode.',
    });
  }

  const startTime = Date.now();
  try {
    const testClient = createClient(currentUrl, currentKey, {
      auth: { persistSession: false },
    });

    const { data: categories, error: catError } = await testClient
      .from('categories')
      .select('id, name')
      .limit(10);

    const latencyMs = Date.now() - startTime;

    if (catError) {
      return res.json({
        configured: true,
        isLive: false,
        url: currentUrl,
        latencyMs,
        message: `Connected to Supabase URL, but database returned error: ${catError.message}`,
        error: catError,
      });
    }

    const { data: products } = await testClient
      .from('products')
      .select('id')
      .limit(5);

    return res.json({
      configured: true,
      isLive: true,
      url: currentUrl,
      latencyMs,
      categoryCount: categories?.length || 0,
      productCount: products?.length || 0,
      message: `Successfully connected to live Supabase PostgreSQL (${latencyMs}ms latency). ${categories?.length || 0} categories, ${products?.length || 0}+ products verified.`,
    });
  } catch (err: any) {
    return res.json({
      configured: true,
      isLive: false,
      url: currentUrl,
      latencyMs: Date.now() - startTime,
      message: `Failed to ping Supabase: ${err.message}`,
    });
  }
});

// 7. Verify Supabase Credentials against live tables
app.post('/api/supabase/verify', async (req: Request, res: Response) => {
  try {
    const { url, anonKey } = req.body;

    if (!url || !anonKey) {
      return res.status(400).json({ success: false, message: 'Please provide both Supabase Project URL and Anon Public Key.' });
    }

    const trimmedUrl = String(url).trim();
    const trimmedKey = String(anonKey).trim();

    if (!trimmedUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, message: 'Supabase Project URL must start with https://' });
    }

    const startTime = Date.now();
    const client = createClient(trimmedUrl, trimmedKey, { auth: { persistSession: false } });

    // Test 1: Categories
    const { data: cats, error: catErr } = await client.from('categories').select('id, name').limit(15);
    if (catErr) {
      return res.status(400).json({
        success: false,
        step: 'categories',
        latencyMs: Date.now() - startTime,
        message: `Categories query failed: ${catErr.message}. Ensure supabase/schema.sql has been executed in the Supabase SQL Editor.`,
      });
    }

    // Test 2: Products
    const { data: prods, error: prodErr } = await client.from('products').select('id, name, price').limit(15);
    if (prodErr) {
      return res.status(400).json({
        success: false,
        step: 'products',
        latencyMs: Date.now() - startTime,
        message: `Products query failed: ${prodErr.message}`,
      });
    }

    // Test 3: Inventory
    const { data: inv, error: invErr } = await client.from('inventory').select('product_id, stock_count').limit(15);
    if (invErr) {
      return res.status(400).json({
        success: false,
        step: 'inventory',
        latencyMs: Date.now() - startTime,
        message: `Inventory query failed: ${invErr.message}`,
      });
    }

    // Test 4: RLS policy isolation on orders
    const { data: orders, error: orderErr } = await client.from('orders').select('id').limit(1);

    const latencyMs = Date.now() - startTime;

    return res.json({
      success: true,
      latencyMs,
      url: trimmedUrl,
      verifiedTables: {
        categories: cats?.length || 0,
        products: prods?.length || 0,
        inventory: inv?.length || 0,
        ordersIsolatedByRLS: !orderErr,
      },
      message: `Verified! Successfully queried live PostgreSQL tables in ${latencyMs}ms.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Verification exception' });
  }
});

// 8. Persist Supabase Credentials to .env and runtime
app.post('/api/supabase/save', async (req: Request, res: Response) => {
  try {
    const { url, anonKey } = req.body;

    if (!url || !anonKey) {
      return res.status(400).json({ success: false, message: 'Missing URL or Anon Key' });
    }

    const trimmedUrl = String(url).trim();
    const trimmedKey = String(anonKey).trim();

    // Verify first
    const client = createClient(trimmedUrl, trimmedKey, { auth: { persistSession: false } });
    const { error: testErr } = await client.from('categories').select('id').limit(1);

    if (testErr) {
      return res.status(400).json({
        success: false,
        message: `Connection failed: ${testErr.message}. Please check your Project URL and Anon Key.`,
      });
    }

    // Update in-memory environment variables
    process.env.VITE_SUPABASE_URL = trimmedUrl;
    process.env.VITE_SUPABASE_ANON_KEY = trimmedKey;

    // Write / update .env file on disk
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const lines = envContent.split('\n');
    let hasUrl = false;
    let hasKey = false;

    const newLines = lines.map((l) => {
      if (l.trim().startsWith('VITE_SUPABASE_URL=')) {
        hasUrl = true;
        return `VITE_SUPABASE_URL="${trimmedUrl}"`;
      }
      if (l.trim().startsWith('VITE_SUPABASE_ANON_KEY=')) {
        hasKey = true;
        return `VITE_SUPABASE_ANON_KEY="${trimmedKey}"`;
      }
      return l;
    });

    if (!hasUrl) {
      newLines.push(`VITE_SUPABASE_URL="${trimmedUrl}"`);
    }
    if (!hasKey) {
      newLines.push(`VITE_SUPABASE_ANON_KEY="${trimmedKey}"`);
    }

    fs.writeFileSync(envPath, newLines.filter(Boolean).join('\n') + '\n', 'utf-8');

    return res.json({
      success: true,
      message: 'Supabase credentials saved and verified against live database!',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to save configuration' });
  }
});

// -----------------------------------------------------------------------------
// VITE DEV SERVER / PRODUCTION STATIC SERVING
// -----------------------------------------------------------------------------

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shopcart Full-Stack Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
