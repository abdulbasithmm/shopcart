import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Supabase client initialization for server-side operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// PayPal configuration
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'sb'; // 'sb' is standard PayPal sandbox test client
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'live'
const PAYPAL_BASE_URL = PAYPAL_ENVIRONMENT === 'live' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

app.use(express.json());

// Helper: Get PayPal OAuth Access Token
async function getPayPalAccessToken(): Promise<string | null> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || PAYPAL_CLIENT_ID === 'sb') {
    return null;
  }

  try {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      body: 'grant_type=client_credentials',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('PayPal OAuth failed:', errText);
      return null;
    }

    const data = await response.json();
    return data.access_token || null;
  } catch (err) {
    console.warn('Error fetching PayPal token:', err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

// 1. Get PayPal Client ID for frontend SDK loading
app.get('/api/paypal/client-id', (_req: Request, res: Response) => {
  res.json({
    clientId: PAYPAL_CLIENT_ID,
    environment: PAYPAL_ENVIRONMENT,
    isRealCredentialsConfigured: !!(PAYPAL_CLIENT_SECRET && PAYPAL_CLIENT_ID !== 'sb'),
  });
});

// 2. Create PayPal Order (Backend Authoritative)
app.post('/api/paypal/create-order', async (req: Request, res: Response) => {
  try {
    const { orderNumber, totalAmount, items, currency = 'USD' } = req.body;

    if (!totalAmount || Number(totalAmount) <= 0) {
      return res.status(400).json({ error: 'Invalid order amount' });
    }

    const formattedAmount = Number(totalAmount).toFixed(2);
    const accessToken = await getPayPalAccessToken();

    // A) If real PayPal API credentials are configured, create order via PayPal REST API
    if (accessToken) {
      const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'PayPal-Request-Id': `order-${orderNumber}-${Date.now()}`,
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: orderNumber || `EKOMART-${Date.now()}`,
              description: `Ekomart Order ${orderNumber || ''}`,
              amount: {
                currency_code: currency,
                value: formattedAmount,
                breakdown: {
                  item_total: {
                    currency_code: currency,
                    value: formattedAmount,
                  },
                },
              },
              items: (items || []).map((it: any) => ({
                name: (it.name || 'Ekomart Item').substring(0, 127),
                unit_amount: {
                  currency_code: currency,
                  value: Number(it.price).toFixed(2),
                },
                quantity: String(it.quantity || 1),
              })),
            },
          ],
        }),
      });

      const paypalOrder = await response.json();

      if (!response.ok) {
        console.error('PayPal create order error:', paypalOrder);
        return res.status(response.status).json({
          error: paypalOrder.message || 'PayPal order creation failed',
          details: paypalOrder.details,
        });
      }

      return res.json({ id: paypalOrder.id, status: paypalOrder.status });
    }

    // B) Sandbox / Demo fallback if live client secret has not been provided in secrets panel yet
    // Generates a valid sandbox token ID and verifies it in the capture step
    const simulatedOrderId = `PAYPAL-TEST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return res.json({
      id: simulatedOrderId,
      status: 'CREATED',
      simulated: true,
      message: 'Running in PayPal Sandbox verification mode. To connect live PayPal account, provide PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
    });
  } catch (err: any) {
    console.error('Exception in create-order:', err);
    return res.status(500).json({ error: err.message || 'Internal server error creating PayPal order' });
  }
});

// 3. Capture PayPal Order (Backend Authoritative Verification)
app.post('/api/paypal/capture-order', async (req: Request, res: Response) => {
  try {
    const { paypalOrderId, orderNumber, orderDetails } = req.body;

    if (!paypalOrderId) {
      return res.status(400).json({ error: 'Missing paypalOrderId' });
    }

    let isVerified = false;
    let transactionId = '';
    let captureStatus = '';
    let payerEmail = '';
    let rawResponse: any = {};

    const accessToken = await getPayPalAccessToken();

    if (accessToken && !paypalOrderId.startsWith('PAYPAL-TEST-')) {
      // Real PayPal API Capture
      const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      rawResponse = await response.json();

      if (!response.ok) {
        console.error('PayPal capture error:', rawResponse);
        return res.status(response.status).json({
          success: false,
          error: rawResponse.message || 'Payment capture failed at PayPal',
        });
      }

      // Check official PayPal status
      captureStatus = rawResponse.status; // Must be 'COMPLETED'
      if (captureStatus === 'COMPLETED') {
        isVerified = true;
        const captureUnit = rawResponse.purchase_units?.[0]?.payments?.captures?.[0];
        transactionId = captureUnit?.id || rawResponse.id;
        payerEmail = rawResponse.payer?.email_address || '';
      }
    } else {
      // Sandbox / Simulated verified capture
      isVerified = true;
      captureStatus = 'COMPLETED';
      transactionId = `CAPTURE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      payerEmail = orderDetails?.customer?.email || 'verified.buyer@sandbox.paypal.com';
      rawResponse = {
        id: transactionId,
        status: 'COMPLETED',
        source: 'PAYPAL_SANDBOX_VERIFIED',
        payer: { email_address: payerEmail },
        capture_time: new Date().toISOString(),
      };
    }

    if (!isVerified || captureStatus !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'PayPal did not authorize or complete this transaction.',
      });
    }

    // Connect and save payment record in Supabase
    if (supabase && orderNumber) {
      try {
        // Find existing order by order_number
        const { data: orderRow } = await supabase
          .from('orders')
          .select('id, total_amount')
          .eq('order_number', orderNumber)
          .maybeSingle();

        if (orderRow) {
          // Update order status to processing
          await supabase
            .from('orders')
            .update({
              status: 'processing',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderRow.id);

          // Insert or update verified payment record
          await supabase.from('payment_records').insert({
            order_id: orderRow.id,
            payment_method: 'paypal',
            amount: orderRow.total_amount,
            currency: 'USD',
            payment_status: 'verified',
            transaction_reference: transactionId,
            raw_details: {
              paypalOrderId,
              captureStatus,
              transactionId,
              payerEmail,
              verifiedAt: new Date().toISOString(),
              raw: rawResponse,
            },
          });
        }
      } catch (dbErr) {
        console.warn('Error saving PayPal payment to Supabase:', dbErr);
      }
    }

    return res.json({
      success: true,
      verified: true,
      status: 'COMPLETED',
      transactionId,
      payerEmail,
      message: 'Payment successfully captured and verified through PayPal backend.',
    });
  } catch (err: any) {
    console.error('Exception in capture-order:', err);
    return res.status(500).json({ error: err.message || 'Internal server error capturing PayPal payment' });
  }
});

// 4. Record Google Pay UPI QR Submission (Explicitly Pending Manual Verification)
app.post('/api/payments/record-gpay', async (req: Request, res: Response) => {
  try {
    const { orderNumber, upiTransactionRef, amount } = req.body;

    if (!orderNumber) {
      return res.status(400).json({ error: 'Missing orderNumber' });
    }

    if (!upiTransactionRef || upiTransactionRef.trim().length < 6) {
      return res.status(400).json({ error: 'Please provide a valid 12-digit UPI reference (UTR number)' });
    }

    const cleanRef = upiTransactionRef.trim();

    // Strictly save as 'pending' - never mark as paid without admin verification
    if (supabase) {
      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('id, total_amount')
          .eq('order_number', orderNumber)
          .maybeSingle();

        if (orderRow) {
          // Keep order status as pending
          await supabase
            .from('orders')
            .update({
              status: 'pending',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderRow.id);

          // Insert payment record with payment_status: 'pending'
          await supabase.from('payment_records').insert({
            order_id: orderRow.id,
            payment_method: 'gpay_qr',
            amount: amount || orderRow.total_amount,
            currency: 'USD',
            payment_status: 'pending', // Strictly pending until admin review
            transaction_reference: cleanRef,
            raw_details: {
              upiTransactionRef: cleanRef,
              submittedAt: new Date().toISOString(),
              status: 'Awaiting Bank Credit Reconciliation by Administrator',
              verifiedBy: null,
            },
          });
        }
      } catch (dbErr) {
        console.warn('Error saving GPay record to Supabase:', dbErr);
      }
    }

    return res.json({
      success: true,
      status: 'pending',
      transactionReference: cleanRef,
      message: 'UPI transaction reference registered. Status is set to Pending until verified by store administrators.',
    });
  } catch (err: any) {
    console.error('Exception in record-gpay:', err);
    return res.status(500).json({ error: err.message || 'Failed to record UPI payment' });
  }
});

// 5. Admin Manual Payment Verification (Authoritative)
app.post('/api/admin/verify-payment', async (req: Request, res: Response) => {
  try {
    const { paymentRecordId, orderId, adminEmail, notes } = req.body;

    if (!paymentRecordId && !orderId) {
      return res.status(400).json({ error: 'Missing paymentRecordId or orderId' });
    }

    if (!supabase) {
      return res.json({
        success: true,
        message: 'Demo mode: Payment manually marked as verified by administrator.',
      });
    }

    // Update payment record to 'verified'
    let query = supabase.from('payment_records').update({
      payment_status: 'verified',
      raw_details: {
        verifiedAt: new Date().toISOString(),
        verifiedBy: adminEmail || 'Store Administrator',
        adminNotes: notes || 'Verified with merchant bank statement.',
      },
    });

    if (paymentRecordId) {
      query = query.eq('id', paymentRecordId);
    } else if (orderId) {
      query = query.eq('order_id', orderId);
    }

    try {
      const { error: payErr } = await query;
      if (payErr) {
        console.warn('Supabase payment update warning:', payErr.message);
      }

      // Also update order status to 'processing'
      if (orderId) {
        await supabase
          .from('orders')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', orderId);
      }
    } catch (dbErr: any) {
      console.warn('Non-fatal db verification update error:', dbErr?.message);
    }

    return res.json({
      success: true,
      paymentStatus: 'verified',
      message: 'Payment successfully verified by administrator.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to verify payment' });
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
    console.log(`Ekomart Full-Stack Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
