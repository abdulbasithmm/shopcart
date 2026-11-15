import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import nodemailer from 'nodemailer';

dotenv.config();

const isServerlessRuntime = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION
);

// PayPal Configuration (historical sandbox legacy - retired)
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'sb';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
void PAYPAL_CLIENT_ID;
void PAYPAL_CLIENT_SECRET;
void PAYPAL_ENVIRONMENT;

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads', 'screenshots');
const ORDERS_DISK_FILE = path.join(process.cwd(), 'data', 'orders.json');
const CONTACT_FILE = path.join(process.cwd(), 'data', 'contact_messages.json');

const SUPPORT_EMAIL = 'basithmm08@gmail.com';
const SUPPORT_PHONE = '+91 9496660968';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canWriteLocalDisk(): boolean {
  if (isServerlessRuntime) return false;
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

// Supabase client initialization for server-side operations:
// - supabaseAnon uses ONLY the public anon key (safe for public queries & auth.getUser verification).
// - supabaseAdmin uses the private server-only SUPABASE_SERVICE_ROLE_KEY (never exposed to browser/VITE_*).
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://kciglyawyagwtgkwsxau.supabase.co').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9KTWhKGnHHGRmtmkaYz1eg_ib2A0bUp').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const supabaseAnon = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const supabaseAdmin = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function createUserSupabaseClient(accessToken: string) {
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

// Public alias strictly bound to anon client (never service_role)
const supabase = supabaseAnon;

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

const serverOrdersStore = new Map<string, any>();
const recordedUtrMemory = new Set<string>();
const inFlightOrderNumbers = new Set<string>();
const inFlightUtrs = new Set<string>();

const SUPPORTED_UPI_METHODS = new Set([
  'google_pay',
  'phonepe',
  'paytm',
  'bhim',
  'all_upi',
  'gpay_upi',
]);

function roundCurrency(value: number): number {
  return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
}

function normalizeUtrValue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\s-]+/g, '').trim().toUpperCase();
}

const serverAiAnalysisCache = new Map<string, { provider: string; analysis: any; createdAt: number }>();

function cacheServerAiAnalysis(key: string, value: { provider: string; analysis: any; createdAt: number }) {
  if (serverAiAnalysisCache.size >= 500) {
    const oldestKey = serverAiAnalysisCache.keys().next().value;
    if (oldestKey) serverAiAnalysisCache.delete(oldestKey);
  }
  serverAiAnalysisCache.set(key, value);
}

async function analyzePaymentScreenshotServer(params: {
  screenshotBase64: string;
  mimeType?: string;
  expectedAmount: number;
  expectedOrderNumber?: string;
  expectedMerchantUpi?: string;
}): Promise<{ provider: string; analysis: any }> {
  const rawInput = String(params.screenshotBase64 || '').trim();
  const dataUriMatch = rawInput.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/i);
  const detectedMime = dataUriMatch?.[1]?.toLowerCase() || String(params.mimeType || 'image/jpeg').toLowerCase();
  const normalizedMime = detectedMime.includes('png')
    ? 'image/png'
    : detectedMime.includes('webp')
      ? 'image/webp'
      : 'image/jpeg';

  const cleanBase64 = rawInput.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '').trim();
  const imageBuffer = Buffer.from(cleanBase64, 'base64');
  if (!cleanBase64 || imageBuffer.length === 0) {
    throw new Error('Invalid or empty screenshot image payload.');
  }

  const numExpectedAmount = roundCurrency(Number(params.expectedAmount) || 0);
  const cleanOrderNum = String(params.expectedOrderNumber || '').trim();
  const targetMerchant = String(
    params.expectedMerchantUpi || merchantPaymentSettings.merchant_upi_id || 'shopcart.merchant@okaxis'
  ).trim().toLowerCase();

  const imageSha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
  const cacheKey = `${imageSha256}:${numExpectedAmount.toFixed(2)}:${cleanOrderNum}:${targetMerchant}`;
  const cached = serverAiAnalysisCache.get(cacheKey);
  if (cached) {
    return {
      provider: cached.provider,
      analysis: { ...cached.analysis },
    };
  }

  if (ai) {
    try {
      const promptText = `
You are an expert Senior Banking & UPI Payment Fraud Detection Specialist analyzing a customer-uploaded payment success screenshot for the e-commerce store "Shopcart".

Order Context:
- Expected Order Number: ${cleanOrderNum || 'N/A'}
- Expected Payable Amount: ₹${numExpectedAmount.toFixed(2)} INR
- Expected Merchant Payee / UPI ID: ${targetMerchant} (or Shopcart)

Analyze the image with utmost scrutiny:
1. Receipt Authenticity & Status: Is this an authentic payment success receipt from a recognized UPI application (e.g. Google Pay, PhonePe, Paytm, BHIM, Cred, Amazon Pay, Axis/HDFC/SBI/iMobile Bank app)? Does it show "Paid", "Payment Successful", "Transferred"? Or is it "Failed", "Pending", "Processing", an order preview, or not a payment screenshot at all?
2. Transaction Reference: Extract the 12-character alphanumeric UPI UTR / RRN (Bank Reference Number) or Transaction ID if present, otherwise empty string.
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
  "extracted_utr": "12-character alphanumeric string or empty string",
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
          mimeType: normalizedMime,
          data: cleanBase64,
        },
      };

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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

      if (parsedResult && typeof parsedResult === 'object') {
        const allowedStatuses = new Set(['valid_success', 'payment_failed', 'tampered', 'unclear', 'not_a_receipt']);
        const allowedActions = new Set(['DETAILS_MATCH', 'REVIEW_REQUIRED', 'POSSIBLE_FRAUD']);

        const normalizedExtractedUtr = normalizeUtrValue(parsedResult.extracted_utr);
        const validExtractedUtr = /^[0-9A-Z]{12}$/.test(normalizedExtractedUtr) ? normalizedExtractedUtr : '';
        const extractedAmount = Number(parsedResult.extracted_amount);
        const safeExtractedAmount = Number.isFinite(extractedAmount) && extractedAmount >= 0
          ? roundCurrency(extractedAmount)
          : 0;

        const suspiciousList = Array.isArray(parsedResult.suspicious_indicators)
          ? parsedResult.suspicious_indicators.map((s: any) => String(s || '').trim()).filter(Boolean)
          : [];

        let recommendedAction = allowedActions.has(String(parsedResult.recommended_action))
          ? String(parsedResult.recommended_action)
          : 'REVIEW_REQUIRED';

        let amountMatches = Boolean(parsedResult.amount_matches);
        if (numExpectedAmount > 0 && safeExtractedAmount > 0) {
          const diff = Math.abs(safeExtractedAmount - numExpectedAmount);
          if (diff > 0.5) {
            amountMatches = false;
            const mismatchMsg = `Paid amount (₹${safeExtractedAmount}) does not match expected order total (₹${numExpectedAmount})`;
            if (!suspiciousList.includes(mismatchMsg)) {
              suspiciousList.push(mismatchMsg);
            }
            if (recommendedAction === 'DETAILS_MATCH') {
              recommendedAction = 'REVIEW_REQUIRED';
            }
          } else {
            amountMatches = true;
          }
        } else if (numExpectedAmount > 0) {
          amountMatches = false;
          if (recommendedAction === 'DETAILS_MATCH') {
            recommendedAction = 'REVIEW_REQUIRED';
          }
        }

        const sanitizedAnalysis = {
          screenshot_status: allowedStatuses.has(String(parsedResult.screenshot_status))
            ? String(parsedResult.screenshot_status)
            : 'unclear',
          extracted_utr: validExtractedUtr,
          extracted_amount: safeExtractedAmount,
          extracted_merchant: String(parsedResult.extracted_merchant || '').slice(0, 120),
          extracted_app: String(parsedResult.extracted_app || 'Unknown').slice(0, 60),
          extracted_timestamp: String(parsedResult.extracted_timestamp || '').slice(0, 80),
          amount_matches: amountMatches,
          merchant_matches: Boolean(parsedResult.merchant_matches),
          suspicious_indicators: suspiciousList,
          confidence_score: Math.max(0, Math.min(100, Math.round(Number(parsedResult.confidence_score) || 0))),
          recommended_action: recommendedAction,
          ai_summary: String(parsedResult.ai_summary || 'Preliminary AI screening completed. Manual administrative verification required.').slice(0, 500),
          source: 'server_gemini',
          image_sha256: imageSha256,
          expected_amount: numExpectedAmount,
          analyzed_at: new Date().toISOString(),
        };

        const out = { provider: 'gemini-4-hydrogen', analysis: sanitizedAnalysis };
        cacheServerAiAnalysis(cacheKey, { ...out, createdAt: Date.now() });
        return out;
      }
    } catch (aiErr: any) {
      console.warn('Gemini screenshot analysis error, falling back to heuristic evaluation:', aiErr?.message);
    }
  }

  const bufferSize = imageBuffer.length;
  const isReasonableSize = bufferSize > 15000 && bufferSize < 15000000;
  const indicators = [
    'Automated OCR extraction unavailable; manual administrator bank-ledger and 12-character UTR verification required.',
  ];
  if (!isReasonableSize) {
    indicators.push('Image resolution or file size appears unusually low for an authentic mobile UPI receipt.');
  }

  const fallbackAnalysis = {
    screenshot_status: 'unclear',
    extracted_utr: '',
    extracted_amount: 0,
    extracted_merchant: '',
    extracted_app: 'Unknown',
    extracted_timestamp: '',
    amount_matches: false,
    merchant_matches: false,
    suspicious_indicators: indicators,
    confidence_score: isReasonableSize ? 45 : 20,
    recommended_action: 'REVIEW_REQUIRED',
    ai_summary: isReasonableSize
      ? `Receipt image uploaded (${(bufferSize / 1024).toFixed(0)} KB). Automated OCR unavailable; payment remains pending manual administrative verification.`
      : 'Receipt image appears unclear or unusually small. Manual administrative verification required.',
    source: 'server_heuristic_advisory',
    image_sha256: imageSha256,
    expected_amount: numExpectedAmount,
    analyzed_at: new Date().toISOString(),
  };

  const out = {
    provider: ai ? 'heuristic_fallback' : 'local_heuristic_advisory',
    analysis: fallbackAnalysis,
  };
  cacheServerAiAnalysis(cacheKey, { ...out, createdAt: Date.now() });
  return out;
}

function loadOrdersFromDisk() {
  if (isServerlessRuntime) return;
  try {
    if (fs.existsSync(ORDERS_DISK_FILE)) {
      const raw = fs.readFileSync(ORDERS_DISK_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((ord: any) => {
          if (ord.order_number) serverOrdersStore.set(ord.order_number, ord);
        });
      }
    }
  } catch (err) {
    console.warn('Could not read orders from disk:', err);
  }
}

function saveOrdersToDisk() {
  if (isServerlessRuntime) return;
  try {
    fs.mkdirSync(path.dirname(ORDERS_DISK_FILE), { recursive: true });
    const list = Array.from(serverOrdersStore.values());
    fs.writeFileSync(ORDERS_DISK_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write orders to disk:', err);
  }
}

function loadContactMessages(): any[] {
  if (isServerlessRuntime) return [];
  try {
    if (!fs.existsSync(path.dirname(CONTACT_FILE))) {
      fs.mkdirSync(path.dirname(CONTACT_FILE), { recursive: true });
    }
    if (fs.existsSync(CONTACT_FILE)) {
      const raw = fs.readFileSync(CONTACT_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Error reading contact messages file:', err);
  }
  return [];
}

function saveContactMessage(msg: any) {
  if (isServerlessRuntime) return;
  try {
    const list = loadContactMessages();
    list.unshift(msg);
    if (!fs.existsSync(path.dirname(CONTACT_FILE))) {
      fs.mkdirSync(path.dirname(CONTACT_FILE), { recursive: true });
    }
    fs.writeFileSync(CONTACT_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Error saving contact message:', err);
  }
}

loadOrdersFromDisk();

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

// Verify a Supabase JWT Bearer token server-side and fetch the authoritative public.profiles row
export async function verifySupabaseBearerToken(req: Request): Promise<{
  user: any | null;
  profile: { id: string; email: string; full_name?: string | null; role: string } | null;
  token: string | null;
  userClient: any | null;
  errorStatus?: number;
  errorMessage?: string;
}> {
  const authHeader = req.headers.authorization;
  const bearerMatch = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  if (!bearerMatch) {
    return {
      user: null,
      profile: null,
      token: null,
      userClient: null,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Missing Supabase Bearer access token.',
    };
  }

  const token = bearerMatch[1].trim();
  if (!token) {
    return {
      user: null,
      profile: null,
      token: null,
      userClient: null,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Empty Supabase Bearer access token.',
    };
  }

  const authClient = supabaseAdmin || supabaseAnon;
  if (!authClient) {
    return {
      user: null,
      profile: null,
      token: null,
      userClient: null,
      errorStatus: 503,
      errorMessage: 'Authentication service unavailable: Supabase is not configured.',
    };
  }

  try {
    const { data: { user: authUser }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authUser) {
      return {
        user: null,
        profile: null,
        token: null,
        userClient: null,
        errorStatus: 401,
        errorMessage: 'Unauthorized: Invalid or expired Supabase access token.',
      };
    }

    const userClient = createUserSupabaseClient(token);
    const dbForProfile = supabaseAdmin || userClient || supabaseAnon;
    if (!dbForProfile) {
      return {
        user: authUser,
        profile: null,
        token,
        userClient,
        errorStatus: 503,
        errorMessage: 'Database client unavailable while verifying profile.',
      };
    }

    const { data: profile, error: profError } = await dbForProfile
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profError) {
      return {
        user: authUser,
        profile: null,
        token,
        userClient,
        errorStatus: 503,
        errorMessage: `Unable to verify role in public.profiles: ${profError.message}`,
      };
    }

    if (!profile) {
      return {
        user: authUser,
        profile: null,
        token,
        userClient,
        errorStatus: 403,
        errorMessage: 'Forbidden: No authoritative profile record found in public.profiles.',
      };
    }

    return {
      user: authUser,
      profile,
      token,
      userClient,
    };
  } catch {
    return {
      user: null,
      profile: null,
      token: null,
      userClient: null,
      errorStatus: 401,
      errorMessage: 'Unauthorized: Token verification failed.',
    };
  }
}

// Strict Admin API Guard: rejects unauthenticated (401) and non-admin (403) callers.
async function requireAdminAuth(req: Request, res: Response, next: express.NextFunction) {
  if (req.method === 'OPTIONS') return next();

  const verification = await verifySupabaseBearerToken(req);
  if (verification.errorStatus) {
    return res.status(verification.errorStatus).json({
      authorized: false,
      error: verification.errorMessage,
    });
  }

  const normalizedRole = String(verification.profile?.role || '').trim().toLowerCase();
  if (normalizedRole !== 'admin') {
    return res.status(403).json({
      authorized: false,
      role: normalizedRole || 'customer',
      error: 'Forbidden: Only authenticated accounts with role = "admin" in public.profiles may access administrative endpoints.',
    });
  }

  (req as any).adminUser = verification.user;
  (req as any).adminProfile = verification.profile;
  (req as any).adminToken = verification.token;
  (req as any).adminSupabase = supabaseAdmin || verification.userClient;
  return next();
}

function mapAdminDbError(err: any, fallbackMessage: string): { status: number; message: string } {
  const code = String(err?.code || '');
  const msg = String(err?.message || fallbackMessage);
  if (!supabaseAdmin && (code === '42501' || /permission denied/i.test(msg))) {
    return {
      status: 503,
      message: 'Server configuration required: SUPABASE_SERVICE_ROLE_KEY must be configured in your deployment environment variables to perform privileged administrative updates.',
    };
  }
  return {
    status: 400,
    message: msg || fallbackMessage,
  };
}

async function resolveTargetOrderRow(
  adminDb: any,
  opts: { orderId?: unknown; orderNumber?: unknown; selectColumns?: string }
): Promise<{ row: any | null; error: any | null }> {
  const rawOrderId = typeof opts.orderId === 'string' ? opts.orderId.trim() : '';
  const rawOrderNum = typeof opts.orderNumber === 'string' ? opts.orderNumber.trim() : '';
  const cols = opts.selectColumns || 'id, order_number, status, payment_status, shipment_updates, status_history';

  const runLookup = async (columns: string) => {
    if (rawOrderId && UUID_REGEX.test(rawOrderId)) {
      return adminDb.from('orders').select(columns).eq('id', rawOrderId).maybeSingle();
    }
    const orderNumCandidate = rawOrderNum || rawOrderId;
    if (orderNumCandidate) {
      return adminDb.from('orders').select(columns).eq('order_number', orderNumCandidate).maybeSingle();
    }
    return { data: null, error: null };
  };

  let res = await runLookup(cols);
  if (res.error && cols !== 'id, order_number, status, payment_status') {
    res = await runLookup('id, order_number, status, payment_status');
  }
  return { row: res.data || null, error: res.error || null };
}

export function createApiApp(): express.Express {
  const app = express();

  // Handle pre-parsed or already-consumed request streams on Vercel Serverless Node runtime without stalling express.json()
  app.use((req: any, _res: Response, next: express.NextFunction) => {
    if (req.body !== undefined || req.readableEnded) {
      if (req.body === undefined) {
        req.body = {};
      } else if (typeof req.body === 'string' && String(req.headers['content-type'] || '').includes('application/json')) {
        try {
          req.body = req.body.trim() ? JSON.parse(req.body) : {};
        } catch {
          // Leave string as-is if malformed
        }
      }
      if (req._body === undefined) {
        req._body = true;
      }
    }
    next();
  });

  // High-limit parser for screenshot base64 payloads
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // CORS configuration supporting shopcart.com, vercel.app, localhost and cloud environments
  app.use((req: Request, res: Response, next: express.NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      if (
        origin.includes('shopcart.com') ||
        origin.includes('.vercel.app') ||
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Health probe
  app.get('/api/health', (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      service: 'shopcart-api',
      runtime: isServerlessRuntime ? 'vercel-serverless' : 'express-node',
      supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
      serviceRoleConfigured: Boolean(supabaseAdmin),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/admin', requireAdminAuth);

  // ---------------------------------------------------------------------------
  // RETIRED PAYPAL NOTICE
  // ---------------------------------------------------------------------------
  app.all('/api/paypal/*', (_req: Request, res: Response) => {
    return res.status(410).json({
      error: 'PayPal checkout has been completely retired. Shopcart operates strictly with Universal UPI payments (Google Pay, PhonePe, Paytm, BHIM, Cred, and all UPI applications).',
      supportedPaymentMethods: ['google_pay', 'phonepe', 'paytm', 'bhim', 'all_upi'],
    });
  });

  // ---------------------------------------------------------------------------
  // SECURE ORDER CREATION & DATABASE PERSISTENCE API
  // ---------------------------------------------------------------------------
  app.post('/api/orders/create', async (req: Request, res: Response) => {
    let acquiredOrderLock = '';
    let acquiredUtrLock = '';

    try {
      const {
        orderNumber,
        status: requestedStatus,
        paymentStatus: requestedPaymentStatus,
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
        shippingSpeed: rawShippingSpeed,
        cartItems = [],
        pricing = {},
        paymentMethod = 'all_upi',
        transactionReference,
        screenshotBase64,
        screenshotUrl: providedScreenshotUrl,
        customerNotes,
      } = req.body || {};

      if (!supabaseAdmin) {
        return res.status(503).json({
          error: 'Order service unavailable: server-side SUPABASE_SERVICE_ROLE_KEY credentials are required.',
        });
      }

      if (requestedStatus !== undefined && requestedStatus !== null && String(requestedStatus).trim() !== '' && String(requestedStatus).trim() !== 'order_placed') {
        return res.status(400).json({
          error: 'Invalid initial order status: new orders must begin in order_placed state.',
        });
      }
      if (
        requestedPaymentStatus !== undefined &&
        requestedPaymentStatus !== null &&
        String(requestedPaymentStatus).trim() !== '' &&
        String(requestedPaymentStatus).trim() !== 'pending_admin_verification'
      ) {
        return res.status(400).json({
          error: 'Invalid initial payment status: new orders always require pending_admin_verification.',
        });
      }

      const cleanOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim() : '';
      if (!cleanOrderNumber || cleanOrderNumber.length < 3) {
        return res.status(400).json({ error: 'A valid Order Number (minimum 3 characters) is required.' });
      }

      if (inFlightOrderNumbers.has(cleanOrderNumber) || serverOrdersStore.has(cleanOrderNumber)) {
        return res.status(409).json({
          error: `Duplicate Order Number: Order "${cleanOrderNumber}" has already been submitted or is currently being processed.`,
        });
      }

      const cleanCustomerName = typeof customerName === 'string' ? customerName.trim() : '';
      if (!cleanCustomerName) {
        return res.status(400).json({ error: 'Customer Full Name is required.' });
      }

      const cleanCustomerEmail = typeof customerEmail === 'string' ? customerEmail.trim() : '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanCustomerEmail || !emailRegex.test(cleanCustomerEmail)) {
        return res.status(400).json({ error: 'A valid customer email address is required.' });
      }

      const cleanPhone = String(customerPhone || '').replace(/[\s\-\+\(\)]/g, '').replace(/^91(?=\d{10}$)/, '');
      if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({
          error: 'Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).',
        });
      }

      const cleanHouse = typeof houseBuilding === 'string' ? houseBuilding.trim() : '';
      const cleanStreet = typeof streetArea === 'string' ? streetArea.trim() : '';
      const cleanCity = typeof city === 'string' ? city.trim() : '';
      const cleanState = typeof state === 'string' ? state.trim() : '';
      const cleanPin = String(pinCode || '').replace(/\s+/g, '').trim();

      if (!cleanHouse) return res.status(400).json({ error: 'House or Building name/number is required.' });
      if (!cleanStreet) return res.status(400).json({ error: 'Street or Area name is required.' });
      if (!cleanCity) return res.status(400).json({ error: 'City is required.' });
      if (!cleanState) return res.status(400).json({ error: 'State is required.' });
      if (!cleanPin || !/^\d{6}$/.test(cleanPin)) {
        return res.status(400).json({
          error: 'Please enter a valid 6-digit Indian postal PIN code (e.g., 560001).',
        });
      }

      const shippingSpeedRaw = String(rawShippingSpeed || pricing?.shippingSpeed || 'standard').trim().toLowerCase();
      if (shippingSpeedRaw !== 'standard' && shippingSpeedRaw !== 'express') {
        return res.status(400).json({ error: 'Invalid shipping speed. Expected "standard" or "express".' });
      }
      const shippingSpeed: 'standard' | 'express' = shippingSpeedRaw;

      const rawSuppliedUserId = req.body?.userId ?? req.body?.user_id ?? req.body?.user?.id ?? null;
      const cleanSuppliedUserId =
        rawSuppliedUserId !== null && rawSuppliedUserId !== undefined
          ? String(rawSuppliedUserId).trim()
          : '';

      let verifiedAuthUser: any = null;
      if (req.headers.authorization) {
        const authCheck = await verifySupabaseBearerToken(req);
        if (authCheck.errorStatus || !authCheck.user) {
          return res.status(authCheck.errorStatus || 401).json({
            error: authCheck.errorMessage || 'Unauthorized: Invalid authentication token.',
          });
        }
        if (cleanSuppliedUserId && cleanSuppliedUserId !== authCheck.user.id) {
          return res.status(403).json({
            error: 'Forbidden: Ownership mismatch — supplied userId does not match the authenticated Supabase user.',
          });
        }
        verifiedAuthUser = authCheck.user;
      } else if (cleanSuppliedUserId) {
        return res.status(401).json({
          error: 'Unauthorized: Authenticated Supabase session is required to associate an order with a user account.',
        });
      }

      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        return res.status(400).json({ error: 'Cart cannot be empty when creating an order.' });
      }

      const normalizedCartInputs: Array<{
        productId: string;
        quantity: number;
        selectedColor: string | null;
        selectedSize: string | null;
        clientUnitPrice?: number;
        clientTotalPrice?: number;
        clientProductImage?: string | null;
      }> = [];
      const qtyByProduct = new Map<string, number>();

      for (const item of cartItems) {
        const pId = typeof (item?.productId ?? item?.product?.id) === 'string'
          ? String(item.productId ?? item.product.id).trim()
          : '';
        if (!pId) {
          return res.status(400).json({ error: 'Every order item must reference a valid product ID.' });
        }

        const qty = Number(item?.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          return res.status(400).json({ error: 'Every order item must have a positive integer quantity.' });
        }

        normalizedCartInputs.push({
          productId: pId,
          quantity: qty,
          selectedColor: item?.selectedColor ? String(item.selectedColor) : null,
          selectedSize: item?.selectedSize ? String(item.selectedSize) : null,
          clientUnitPrice: item?.unitPrice !== undefined && item?.unitPrice !== null ? Number(item.unitPrice) : undefined,
          clientTotalPrice: item?.totalPrice !== undefined && item?.totalPrice !== null ? Number(item.totalPrice) : undefined,
          clientProductImage: item?.productImage || item?.product?.image || item?.product?.images?.[0] || null,
        });

        qtyByProduct.set(pId, (qtyByProduct.get(pId) || 0) + qty);
      }

      const normalizedPaymentMethod = String(paymentMethod || 'all_upi').trim().toLowerCase();
      if (!SUPPORTED_UPI_METHODS.has(normalizedPaymentMethod)) {
        return res.status(400).json({
          error: `Unsupported payment method "${normalizedPaymentMethod}". Shopcart accepts UPI payments only.`,
        });
      }

      const cleanUtr = normalizeUtrValue(transactionReference);
      if (!cleanUtr || cleanUtr.length !== 12 || !/^[0-9A-Z]{12}$/.test(cleanUtr)) {
        return res.status(400).json({
          error: 'A valid 12-character alphanumeric UPI Transaction Reference (UTR) is required to verify your payment.',
        });
      }

      if (recordedUtrMemory.has(cleanUtr) || inFlightUtrs.has(cleanUtr)) {
        return res.status(409).json({
          error: `Duplicate UTR Reference: The 12-character transaction ID "${cleanUtr}" has already been submitted for another order.`,
        });
      }

      inFlightOrderNumbers.add(cleanOrderNumber);
      acquiredOrderLock = cleanOrderNumber;
      inFlightUtrs.add(cleanUtr);
      acquiredUtrLock = cleanUtr;

      const { data: existingOrderNumRow, error: orderNumCheckErr } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('order_number', cleanOrderNumber)
        .maybeSingle();

      if (orderNumCheckErr) {
        return res.status(500).json({ error: 'Database error verifying order uniqueness.' });
      }
      if (existingOrderNumRow) {
        return res.status(409).json({
          error: `Duplicate Order Number: Order "${cleanOrderNumber}" has already been placed.`,
        });
      }

      const { data: existingPayRows, error: payCheckErr } = await supabaseAdmin
        .from('payment_records')
        .select('id, transaction_reference')
        .ilike('transaction_reference', cleanUtr)
        .limit(1);

      if (payCheckErr) {
        return res.status(500).json({ error: 'Database error verifying UPI transaction reference.' });
      }
      if (existingPayRows && existingPayRows.length > 0) {
        recordedUtrMemory.add(cleanUtr);
        return res.status(409).json({
          error: `Duplicate UTR Reference: The 12-character transaction ID "${cleanUtr}" has already been recorded in the database.`,
        });
      }

      const uniqueProductIds = Array.from(qtyByProduct.keys());
      const prodRes = await supabaseAdmin
        .from('products')
        .select('id, name, price, gst_rate, is_active, image_url, images')
        .in('id', uniqueProductIds);

      const dbProducts: any[] | null = prodRes.data;
      const prodErr = prodRes.error;

      if (prodErr && /gst_rate/i.test(prodErr.message || '')) {
        return res.status(500).json({
          error: 'Database GST configuration missing: public.products.gst_rate column is required before commercial checkout.',
        });
      }

      const invRes = await supabaseAdmin
        .from('inventory')
        .select('product_id, stock_count')
        .in('product_id', uniqueProductIds);

      const dbInventory = invRes.data;
      const invErr = invRes.error;

      if (prodErr || invErr) {
        return res.status(500).json({ error: 'Failed to load authoritative product pricing and stock from database.' });
      }

      const productMap = new Map<string, any>((dbProducts || []).map((p: any) => [p.id, p]));
      const stockMap = new Map<string, number>((dbInventory || []).map((inv: any) => [inv.product_id, Number(inv.stock_count || 0)]));

      for (const [pId, requestedTotalQty] of qtyByProduct.entries()) {
        const dbProd = productMap.get(pId);
        if (!dbProd || dbProd.is_active !== true) {
          return res.status(400).json({
            error: `Product "${pId}" is unavailable or no longer active and cannot be ordered.`,
          });
        }

        if (
          dbProd.gst_rate === null ||
          dbProd.gst_rate === undefined ||
          !Number.isFinite(Number(dbProd.gst_rate)) ||
          Number(dbProd.gst_rate) < 0 ||
          Number(dbProd.gst_rate) > 100
        ) {
          return res.status(400).json({
            error: `GST configuration error: product "${dbProd.name}" requires an explicit GST rate configuration before commercial checkout.`,
          });
        }

        const availableStock = stockMap.get(pId);
        if (availableStock === undefined || availableStock < requestedTotalQty) {
          return res.status(400).json({
            error: `Insufficient stock for "${dbProd.name}" (requested ${requestedTotalQty}, available ${availableStock ?? 0}).`,
          });
        }
      }

      let authoritativeSubtotal = 0;
      const authoritativeItems = normalizedCartInputs.map((item) => {
        const dbProd = productMap.get(item.productId)!;
        const unitPrice = roundCurrency(Number(dbProd.price));
        const totalPrice = roundCurrency(unitPrice * item.quantity);
        const gstRate = Number(dbProd.gst_rate);
        const dbImg = dbProd.image_url || (Array.isArray(dbProd.images) ? dbProd.images[0] : null) || item.clientProductImage || null;

        return {
          productId: item.productId,
          productName: dbProd.name,
          productImage: dbImg,
          unitPrice,
          gstRate,
          quantity: item.quantity,
          totalPrice,
          selectedColor: item.selectedColor,
          selectedSize: item.selectedSize,
          clientUnitPrice: item.clientUnitPrice,
          clientTotalPrice: item.clientTotalPrice,
        };
      });

      for (const item of authoritativeItems) {
        if (item.clientUnitPrice !== undefined && (!Number.isFinite(item.clientUnitPrice) || Math.abs(item.clientUnitPrice - item.unitPrice) > 0.01)) {
          return res.status(400).json({
            error: `Price verification failed for "${item.productName}": submitted unit price does not match current catalog price.`,
          });
        }
        if (item.clientTotalPrice !== undefined && (!Number.isFinite(item.clientTotalPrice) || Math.abs(item.clientTotalPrice - item.totalPrice) > 0.01)) {
          return res.status(400).json({
            error: `Line total verification failed for "${item.productName}": submitted total does not match catalog calculation.`,
          });
        }
        authoritativeSubtotal = roundCurrency(authoritativeSubtotal + item.totalPrice);
      }

      const normalizedCoupon = typeof pricing?.couponCode === 'string' && pricing.couponCode.trim()
        ? pricing.couponCode.trim().toUpperCase()
        : null;

      let authoritativeDiscount = 0;
      if (normalizedCoupon === 'SHOPCART10') {
        authoritativeDiscount = roundCurrency((authoritativeSubtotal * 10) / 100);
      } else if (normalizedCoupon === 'SAVE20') {
        authoritativeDiscount = roundCurrency(Math.min(200, authoritativeSubtotal));
      } else if (normalizedCoupon === 'WELCOME') {
        authoritativeDiscount = roundCurrency((authoritativeSubtotal * 15) / 100);
      } else if (normalizedCoupon !== null) {
        return res.status(400).json({ error: `Invalid or unsupported coupon code "${normalizedCoupon}".` });
      }

      const baseShipping = authoritativeSubtotal === 0 ? 0 : authoritativeSubtotal >= 499 ? 0 : 49;
      const authoritativeShippingFee = roundCurrency(shippingSpeed === 'express' ? baseShipping + 99 : baseShipping);
      const taxableSubtotal = Math.max(0, roundCurrency(authoritativeSubtotal - authoritativeDiscount));

      let authoritativeTaxAmount = 0;
      if (authoritativeSubtotal > 0 && taxableSubtotal > 0) {
        for (const item of authoritativeItems) {
          const taxableShare = roundCurrency((item.totalPrice * taxableSubtotal) / authoritativeSubtotal);
          const lineTax = roundCurrency((taxableShare * item.gstRate) / 100);
          authoritativeTaxAmount = roundCurrency(authoritativeTaxAmount + lineTax);
        }
      }

      const authoritativeTotalAmount = roundCurrency(taxableSubtotal + authoritativeShippingFee + authoritativeTaxAmount);

      if (pricing?.subtotal !== undefined && (!Number.isFinite(Number(pricing.subtotal)) || Math.abs(Number(pricing.subtotal) - authoritativeSubtotal) > 0.01)) {
        return res.status(400).json({ error: 'Order subtotal mismatch against authoritative product prices. Please refresh your cart and try again.' });
      }
      if (pricing?.discountAmount !== undefined && (!Number.isFinite(Number(pricing.discountAmount)) || Math.abs(Number(pricing.discountAmount) - authoritativeDiscount) > 0.01)) {
        return res.status(400).json({ error: 'Order discount mismatch against authoritative coupon rules. Please refresh your cart and try again.' });
      }
      if (pricing?.shippingFee !== undefined && (!Number.isFinite(Number(pricing.shippingFee)) || Math.abs(Number(pricing.shippingFee) - authoritativeShippingFee) > 0.01)) {
        return res.status(400).json({ error: 'Shipping fee mismatch against authoritative shipping calculation. Please refresh checkout and try again.' });
      }
      if (pricing?.taxAmount !== undefined && (!Number.isFinite(Number(pricing.taxAmount)) || Math.abs(Number(pricing.taxAmount) - authoritativeTaxAmount) > 0.01)) {
        return res.status(400).json({ error: 'Tax amount mismatch against authoritative product GST calculation. Please refresh checkout and try again.' });
      }
      if (pricing?.totalAmount !== undefined && (!Number.isFinite(Number(pricing.totalAmount)) || Math.abs(Number(pricing.totalAmount) - authoritativeTotalAmount) > 0.01)) {
        return res.status(400).json({ error: 'Order total mismatch against authoritative pricing. Please refresh checkout and try again.' });
      }

      let finalScreenshotUrl = '';
      let screenshotBytesBase64 = '';
      let screenshotMimeType = 'image/jpeg';

      if (typeof providedScreenshotUrl === 'string' && providedScreenshotUrl.trim().startsWith('/uploads/screenshots/')) {
        const safeBasename = path.basename(providedScreenshotUrl.trim());
        if (safeBasename && safeBasename !== '.' && safeBasename !== '..') {
          finalScreenshotUrl = `/uploads/screenshots/${safeBasename}`;
          const existingDiskPath = path.join(UPLOADS_DIR, safeBasename);
          if (canWriteLocalDisk() && fs.existsSync(existingDiskPath)) {
            try {
              screenshotBytesBase64 = fs.readFileSync(existingDiskPath).toString('base64');
              screenshotMimeType = safeBasename.toLowerCase().endsWith('.png')
                ? 'image/png'
                : safeBasename.toLowerCase().endsWith('.webp')
                  ? 'image/webp'
                  : 'image/jpeg';
            } catch (readErr) {
              console.warn('Could not read uploaded screenshot for AI evaluation:', readErr);
            }
          }
        }
      }

      if (typeof screenshotBase64 === 'string' && screenshotBase64.trim()) {
        const trimmedRaw = screenshotBase64.trim();
        const dataUriMatch = trimmedRaw.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/i);
        screenshotMimeType = dataUriMatch?.[1]?.toLowerCase() || 'image/png';
        screenshotBytesBase64 = trimmedRaw.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '').trim();

        if (!finalScreenshotUrl && screenshotBytesBase64) {
          const safeOrderSlug = cleanOrderNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
          const ext = screenshotMimeType.includes('png')
            ? 'png'
            : screenshotMimeType.includes('webp')
              ? 'webp'
              : 'jpg';
          const filename = `receipt_${safeOrderSlug}_${Date.now()}.${ext}`;

          if (canWriteLocalDisk()) {
            try {
              const filePath = path.join(UPLOADS_DIR, filename);
              fs.writeFileSync(filePath, Buffer.from(screenshotBytesBase64, 'base64'));
              finalScreenshotUrl = `/uploads/screenshots/${filename}`;
            } catch (saveErr) {
              console.warn('Could not save screenshot image to disk:', saveErr);
            }
          }

          if (!finalScreenshotUrl) {
            try {
              const { data: upData, error: upErr } = await supabaseAdmin.storage
                .from('product-images')
                .upload(`receipts/${filename}`, Buffer.from(screenshotBytesBase64, 'base64'), {
                  contentType: screenshotMimeType,
                  upsert: true,
                });
              if (!upErr && upData?.path) {
                const { data: pub } = supabaseAdmin.storage.from('product-images').getPublicUrl(upData.path);
                if (pub?.publicUrl) finalScreenshotUrl = pub.publicUrl;
              }
            } catch {
              // Storage bucket optional; fallback below preserves receipt evidence
            }
          }

          if (!finalScreenshotUrl && screenshotBytesBase64.length <= 4 * 1024 * 1024) {
            finalScreenshotUrl = `data:${screenshotMimeType};base64,${screenshotBytesBase64}`;
          }
        }
      }

      let trustedAiAnalysis: any = {
        screenshot_status: 'unclear',
        extracted_utr: '',
        extracted_amount: 0,
        extracted_merchant: '',
        extracted_app: 'Unknown',
        extracted_timestamp: '',
        amount_matches: false,
        merchant_matches: false,
        suspicious_indicators: [
          'No receipt screenshot bytes available for server-side screening; manual administrator bank ledger verification required.',
        ],
        confidence_score: 0,
        recommended_action: 'REVIEW_REQUIRED',
        ai_summary: 'No receipt screenshot uploaded for automated screening. Payment remains pending manual administrative verification.',
        source: 'server_default_advisory',
        expected_amount: authoritativeTotalAmount,
        analyzed_at: new Date().toISOString(),
      };

      if (screenshotBytesBase64) {
        try {
          const aiResult = await analyzePaymentScreenshotServer({
            screenshotBase64: screenshotBytesBase64,
            mimeType: screenshotMimeType,
            expectedAmount: authoritativeTotalAmount,
            expectedOrderNumber: cleanOrderNumber,
            expectedMerchantUpi: merchantPaymentSettings.merchant_upi_id,
          });
          trustedAiAnalysis = aiResult.analysis;
        } catch (serverAiErr: any) {
          console.warn('Server AI payment screening warning:', serverAiErr?.message);
        }
      }

      const trackingNumber = `SC-TRK-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const carrier = 'Shop Cart Express';
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + (shippingSpeed === 'express' ? 2 : 4));
      const estimatedDeliveryISO = estDate.toISOString();
      const initialMilestones = createInitialShipmentMilestones(new Date(), false);

      const shippingAddressObj = {
        fullName: cleanCustomerName,
        phone: cleanPhone,
        email: cleanCustomerEmail,
        houseBuilding: cleanHouse,
        streetArea: cleanStreet,
        street: `${cleanHouse}, ${cleanStreet}`,
        apartment: cleanHouse,
        city: cleanCity,
        state: cleanState,
        postalCode: cleanPin,
        pinCode: cleanPin,
        landmark: (landmark || '').trim(),
        deliveryInstructions: (deliveryInstructions || '').trim(),
        country: country || 'India',
        shippingSpeed,
      };

      const verifiedUserId: string | null = verifiedAuthUser?.id || null;
      const resolvedGuestEmail: string | null = verifiedUserId ? null : cleanCustomerEmail;

      const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('create_complete_order', {
        p_order: {
          order_number: cleanOrderNumber,
          user_id: verifiedUserId,
          guest_email: resolvedGuestEmail,
          customer_name: cleanCustomerName,
          customer_email: cleanCustomerEmail,
          customer_phone: cleanPhone,
          status: 'order_placed',
          payment_status: 'pending_admin_verification',
          subtotal: authoritativeSubtotal,
          discount_amount: authoritativeDiscount,
          shipping_fee: authoritativeShippingFee,
          tax_amount: authoritativeTaxAmount,
          total_amount: authoritativeTotalAmount,
          coupon_code: normalizedCoupon,
          shipping_speed: shippingSpeed,
          shipping_address: shippingAddressObj,
          customer_notes: customerNotes || null,
          tracking_number: trackingNumber,
          carrier,
          estimated_delivery_date: estimatedDeliveryISO,
          shipment_updates: initialMilestones,
        },
        p_items: authoritativeItems.map((item) => ({
          product_id: item.productId,
          product_name: item.productName,
          unit_price: item.unitPrice,
          quantity: item.quantity,
          total_price: item.totalPrice,
          selected_color: item.selectedColor,
          selected_size: item.selectedSize,
        })),
        p_payment: {
          payment_method: normalizedPaymentMethod,
          amount: authoritativeTotalAmount,
          payment_status: 'pending_admin_verification',
          transaction_reference: cleanUtr,
          screenshot_url: finalScreenshotUrl || null,
          ai_analysis: trustedAiAnalysis,
          ai_confidence_score: trustedAiAnalysis?.confidence_score ?? null,
          ai_recommendation: trustedAiAnalysis?.recommended_action || null,
          suspicious_indicators: trustedAiAnalysis?.suspicious_indicators || [],
          raw_details: {
            customerName: cleanCustomerName,
            customerEmail: cleanCustomerEmail,
            customerPhone: cleanPhone,
            upiTransactionRef: cleanUtr,
            paymentMethod: normalizedPaymentMethod,
            submittedAt: new Date().toISOString(),
            screenshotUrl: finalScreenshotUrl || null,
            aiAnalysis: trustedAiAnalysis,
            shippingAddress: shippingAddressObj,
            status: 'Awaiting Bank Ledger Verification by Administrator',
          },
        },
      });

      if (rpcErr || !rpcResult?.order_id) {
        const errMsg = rpcErr?.message || 'Atomic order creation failed.';
        const errCode = (rpcErr as any)?.code;
        const isDuplicate =
          errCode === '23505' ||
          /duplicate|already recorded|already exists|unique/i.test(errMsg);

        if (isDuplicate) {
          if (/transaction reference|utr|idx_payment_records_unique_utr/i.test(errMsg)) {
            recordedUtrMemory.add(cleanUtr);
          }
          return res.status(409).json({
            error: /transaction reference|utr|idx_payment_records_unique_utr/i.test(errMsg)
              ? `Duplicate UTR Reference: The 12-character transaction ID "${cleanUtr}" has already been submitted for another order.`
              : `Duplicate Order Number: Order "${cleanOrderNumber}" already exists.`,
          });
        }

        if (
          errCode === '22023' ||
          /insufficient stock|mismatch|invalid|inactive|unsupported|required/i.test(errMsg)
        ) {
          return res.status(400).json({ error: errMsg });
        }

        return res.status(500).json({ error: errMsg });
      }

      const orderId = String(rpcResult.order_id);
      const serverSubtotal = roundCurrency(Number(rpcResult.subtotal ?? authoritativeSubtotal));
      const serverDiscount = roundCurrency(Number(rpcResult.discount_amount ?? authoritativeDiscount));
      const serverShippingFee = roundCurrency(Number(rpcResult.shipping_fee ?? authoritativeShippingFee));
      const serverTaxAmount = roundCurrency(Number(rpcResult.tax_amount ?? authoritativeTaxAmount));
      const serverTotalAmount = roundCurrency(Number(rpcResult.total_amount ?? authoritativeTotalAmount));

      recordedUtrMemory.add(cleanUtr);

      const fullOrderRecord = {
        id: orderId,
        order_number: cleanOrderNumber,
        user_id: verifiedUserId,
        guest_email: resolvedGuestEmail,
        customer_name: cleanCustomerName,
        customer_email: cleanCustomerEmail,
        customer_phone: cleanPhone,
        status: 'order_placed',
        subtotal: serverSubtotal,
        discount_amount: serverDiscount,
        shipping_fee: serverShippingFee,
        tax_amount: serverTaxAmount,
        total_amount: serverTotalAmount,
        coupon_code: normalizedCoupon,
        shipping_address: shippingAddressObj,
        customer_notes: customerNotes || null,
        tracking_number: trackingNumber,
        carrier,
        estimated_delivery_date: estimatedDeliveryISO,
        shipment_updates: initialMilestones,
        paymentMethod: normalizedPaymentMethod,
        paymentStatus: 'pending_admin_verification',
        transactionReference: cleanUtr,
        screenshot_url: finalScreenshotUrl || null,
        ai_analysis: trustedAiAnalysis,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: authoritativeItems.map((item, idx) => ({
          id: `item-${orderId}-${idx + 1}`,
          order_id: orderId,
          product_id: item.productId,
          product_name: item.productName,
          product_image: item.productImage,
          unit_price: item.unitPrice,
          quantity: item.quantity,
          total_price: item.totalPrice,
          line_total: item.totalPrice,
          selected_color: item.selectedColor,
          selected_size: item.selectedSize,
        })),
        payment_records: [
          {
            id: `pay-${orderId}`,
            order_id: orderId,
            payment_method: normalizedPaymentMethod,
            amount: serverTotalAmount,
            currency: 'INR',
            payment_status: 'pending_admin_verification',
            transaction_reference: cleanUtr,
            screenshot_url: finalScreenshotUrl || null,
            ai_analysis: trustedAiAnalysis,
            ai_confidence_score: trustedAiAnalysis?.confidence_score ?? null,
            ai_recommendation: trustedAiAnalysis?.recommended_action || null,
            suspicious_indicators: trustedAiAnalysis?.suspicious_indicators || [],
            created_at: new Date().toISOString(),
          },
        ],
      };

      serverOrdersStore.set(cleanOrderNumber, fullOrderRecord);
      saveOrdersToDisk();

      return res.status(201).json({
        success: true,
        orderId,
        orderNumber: cleanOrderNumber,
        status: 'order_placed',
        trackingNumber,
        carrier,
        estimatedDeliveryDate: estimatedDeliveryISO,
        paymentStatus: 'pending_admin_verification',
        transactionReference: cleanUtr,
        screenshotUrl: finalScreenshotUrl || null,
        aiAnalysis: trustedAiAnalysis,
        pricing: {
          subtotal: serverSubtotal,
          discountAmount: serverDiscount,
          shippingFee: serverShippingFee,
          taxAmount: serverTaxAmount,
          totalAmount: serverTotalAmount,
          couponCode: normalizedCoupon,
          shippingSpeed,
        },
        isStoredInSupabase: true,
        message: 'Order created successfully. Details recorded for administrative bank ledger verification.',
      });
    } catch (err: any) {
      console.error('Exception in /api/orders/create:', err);
      return res.status(500).json({ error: err.message || 'Internal server error creating order' });
    } finally {
      if (acquiredOrderLock) inFlightOrderNumbers.delete(acquiredOrderLock);
      if (acquiredUtrLock) inFlightUtrs.delete(acquiredUtrLock);
    }
  });

  // ---------------------------------------------------------------------------
  // PRODUCT MANAGEMENT APIS (Public & Admin)
  // ---------------------------------------------------------------------------
  app.get('/api/products', async (_req: Request, res: Response) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*, inventory(stock_count)')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return res.json({ products: data, source: 'supabase' });
        }
      }
      return res.json({ products: [], source: 'fallback' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/products', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      if (adminDb) {
        const { data, error } = await adminDb
          .from('products')
          .select('*, inventory(stock_count)')
          .order('created_at', { ascending: false });

        if (!error && data) {
          return res.json({ products: data, source: 'supabase' });
        }
        if (error) {
          return res.status(500).json({ error: error.message });
        }
      }
      return res.status(503).json({ error: 'Database connection unavailable for administrative products query.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/products', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      if (!adminDb) {
        return res.status(503).json({ error: 'Supabase client is not initialized for admin session' });
      }

      const { productRow, stock = 10 } = req.body;
      if (!productRow || !productRow.name) {
        return res.status(400).json({ error: 'Missing required product information' });
      }

      const numericStock = Math.max(0, Math.floor(Number(stock) || 0));
      const prodId = productRow.id || `eko-prod-${Date.now()}`;
      const payload = {
        ...productRow,
        id: prodId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: prodErr } = await adminDb
        .from('products')
        .insert(payload)
        .select('*, inventory(stock_count)')
        .maybeSingle();

      if (prodErr) {
        return res.status(400).json({ error: prodErr.message });
      }

      await adminDb.from('inventory').upsert(
        {
          product_id: prodId,
          stock_count: numericStock,
          low_stock_threshold: 5,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );

      return res.json({ success: true, product: inserted || payload });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/products/:id', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      if (!adminDb) {
        return res.status(503).json({ error: 'Supabase client is not initialized for admin session' });
      }
      const productId = req.params.id;
      const { productRow, stock } = req.body || {};

      if (!productRow && stock === undefined) {
        return res.status(400).json({ error: 'No product fields or stock value provided for update.' });
      }

      let updatedProduct = null;
      if (productRow) {
        const { id: _ignoreId, created_at: _ignoreCreatedAt, ...safeFields } = productRow;
        const { data, error } = await adminDb
          .from('products')
          .update({
            ...safeFields,
            updated_at: new Date().toISOString(),
          })
          .eq('id', productId)
          .select('*, inventory(stock_count)')
          .maybeSingle();

        if (error) {
          return res.status(400).json({ error: error.message });
        }
        updatedProduct = data;
      }

      if (stock !== undefined) {
        const numericStock = Math.floor(Number(stock));
        if (!Number.isFinite(numericStock) || numericStock < 0) {
          return res.status(400).json({ error: 'Stock count must be a non-negative integer.' });
        }
        const { error: invErr } = await adminDb.from('inventory').upsert(
          {
            product_id: productId,
            stock_count: numericStock,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'product_id' }
        );
        if (invErr) {
          return res.status(400).json({ error: invErr.message });
        }
      }

      return res.json({ success: true, product: updatedProduct });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/products/:id', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      if (!adminDb) {
        return res.status(503).json({ error: 'Supabase client is not initialized for admin session' });
      }
      const productId = req.params.id;
      try {
        await adminDb.from('inventory').delete().eq('product_id', productId);
      } catch {
        // ignore
      }
      const { error } = await adminDb.from('products').delete().eq('id', productId);
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/inventory/:productId', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      if (!adminDb) {
        return res.status(503).json({ error: 'Supabase client is not initialized for admin session' });
      }
      const { productId } = req.params;
      const stockCount = Number(req.body?.stock_count);
      if (!Number.isInteger(stockCount) || stockCount < 0) {
        return res.status(400).json({ error: 'stock_count must be a non-negative integer.' });
      }

      const { data, error } = await adminDb
        .from('inventory')
        .upsert(
          {
            product_id: productId,
            stock_count: stockCount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'product_id' }
        )
        .select()
        .maybeSingle();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json({ success: true, inventory: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/inventory/deduct', async (req: Request, res: Response) => {
    try {
      const { productId, quantity, orderNumber } = req.body || {};
      const cleanProductId = typeof productId === 'string' ? productId.trim() : '';
      const cleanOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim() : '';
      const qty = Number(quantity);

      if (!cleanProductId || !Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Valid productId and a positive integer quantity are required.' });
      }

      if (!cleanOrderNumber || cleanOrderNumber.length < 3) {
        return res.status(400).json({
          error: 'A valid orderNumber (minimum 3 characters) is required for idempotent inventory deduction.',
        });
      }

      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin.rpc('deduct_product_inventory', {
          p_product_id: cleanProductId,
          p_quantity: qty,
          p_order_number: cleanOrderNumber,
          p_order_id: null,
        });

        if (error) {
          return res.status(400).json({ error: error.message });
        }
        if (data === false) {
          return res.status(409).json({ error: 'Insufficient stock or duplicate order deduction.' });
        }
        return res.json({ success: true, deducted: true });
      }

      const adminDb = (req as any).adminSupabase;
      if (!adminDb) {
        return res.status(503).json({ error: 'Admin database client unavailable.' });
      }

      const { data: currentInv, error: fetchErr } = await adminDb
        .from('inventory')
        .select('stock_count')
        .eq('product_id', cleanProductId)
        .maybeSingle();

      if (fetchErr || !currentInv) {
        return res.status(404).json({ error: `Inventory record not found for product ${cleanProductId}` });
      }
      if (currentInv.stock_count < qty) {
        return res.status(409).json({ error: 'Insufficient stock to deduct requested quantity.' });
      }

      const { error: updErr } = await adminDb
        .from('inventory')
        .update({
          stock_count: currentInv.stock_count - qty,
          updated_at: new Date().toISOString(),
        })
        .eq('product_id', cleanProductId)
        .gte('stock_count', qty);

      if (updErr) {
        return res.status(400).json({ error: updErr.message });
      }

      return res.json({ success: true, deducted: true, remainingStock: currentInv.stock_count - qty });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // CUSTOMER SUPPORT & CONTACT INQUIRIES API
  // ---------------------------------------------------------------------------
  app.post('/api/contact', async (req: Request, res: Response) => {
    try {
      const { fullName, email, phone, subject, message, hp_field } = req.body || {};

      if (hp_field) {
        return res.status(200).json({ success: true, message: 'Message received.' });
      }

      if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
        return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }

      if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
        return res.status(400).json({ error: 'Please provide a valid contact phone number.' });
      }

      if (!subject || typeof subject !== 'string' || subject.trim().length < 2) {
        return res.status(400).json({ error: 'Please specify an inquiry subject.' });
      }

      if (!message || typeof message !== 'string' || message.trim().length < 5) {
        return res.status(400).json({ error: 'Please enter a message of at least 5 characters.' });
      }

      const ticketId = `TKT-${Date.now().toString().slice(-6)}`;
      const timestamp = new Date().toISOString();

      const contactRecord = {
        ticketId,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        subject: subject.trim(),
        message: message.trim(),
        targetRecipient: SUPPORT_EMAIL,
        createdAt: timestamp,
        status: 'received',
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      };

      saveContactMessage(contactRecord);

      if (supabase) {
        try {
          await supabase.from('contact_messages').insert({
            ticket_id: ticketId,
            full_name: contactRecord.fullName,
            email: contactRecord.email,
            phone: contactRecord.phone,
            subject: contactRecord.subject,
            message: contactRecord.message,
            created_at: timestamp,
          });
        } catch {
          // Table might not exist yet, non-fatal
        }
      }

      let emailDelivered = false;
      let emailNotice = '';

      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpPort = Number(process.env.SMTP_PORT) || 587;

      if (smtpHost && smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          await transporter.sendMail({
            from: `"Shopcart Customer Support" <${smtpUser}>`,
            to: SUPPORT_EMAIL,
            replyTo: contactRecord.email,
            subject: `[${ticketId}] ${contactRecord.subject} - from ${contactRecord.fullName}`,
            text: `New Shopcart Customer Inquiry\n\nTicket: ${ticketId}\nDate: ${timestamp}\nFrom: ${contactRecord.fullName}\nEmail: ${contactRecord.email}\nPhone: ${contactRecord.phone}\nSubject: ${contactRecord.subject}\n\nMessage:\n${contactRecord.message}\n`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #0b5c37; margin-bottom: 4px;">Shopcart Support Notification</h2>
                <p style="color: #64748b; font-size: 13px; margin-top: 0;">Ticket <strong>#${ticketId}</strong> &bull; Received ${new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                <div style="background-color: #f8fafc; padding: 14px; border-radius: 8px; margin: 16px 0; font-size: 14px;">
                  <p style="margin: 4px 0;"><strong>Customer Name:</strong> ${contactRecord.fullName}</p>
                  <p style="margin: 4px 0;"><strong>Email:</strong> <a href="mailto:${contactRecord.email}">${contactRecord.email}</a></p>
                  <p style="margin: 4px 0;"><strong>Phone:</strong> <a href="tel:${contactRecord.phone}">${contactRecord.phone}</a></p>
                  <p style="margin: 4px 0;"><strong>Subject:</strong> ${contactRecord.subject}</p>
                </div>
                <div style="padding: 14px; border-left: 4px solid #0b5c37; background-color: #f0fdf4; margin: 16px 0;">
                  <h4 style="margin: 0 0 8px 0; color: #166534;">Message:</h4>
                  <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${contactRecord.message}</p>
                </div>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Shopcart Distribution Centre: Kondotty, Malappuram, Kerala, India &bull; Support: ${SUPPORT_PHONE}</p>
              </div>
            `,
          });
          emailDelivered = true;
          emailNotice = `Direct email successfully delivered to ${SUPPORT_EMAIL}.`;
        } catch (smtpErr: any) {
          console.warn('Nodemailer SMTP dispatch warning:', smtpErr?.message);
          emailNotice = `Ticket logged. Target recipient: ${SUPPORT_EMAIL}`;
        }
      } else {
        emailNotice = `Ticket recorded and routed to ${SUPPORT_EMAIL}.`;
      }

      return res.json({
        success: true,
        ticketId,
        timestamp,
        recipient: SUPPORT_EMAIL,
        phone: SUPPORT_PHONE,
        emailDelivered,
        message: `Your message has been received! Ticket #${ticketId} dispatched to ${SUPPORT_EMAIL}. Our support concierge will respond promptly.`,
        emailNotice,
      });
    } catch (err: any) {
      console.error('Error handling contact message:', err);
      return res.status(500).json({ error: err.message || 'Failed to submit contact message' });
    }
  });

  // ---------------------------------------------------------------------------
  // ADMIN ORDERS MANAGEMENT APIS
  // ---------------------------------------------------------------------------
  app.get('/api/admin/orders', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const ordersMap = new Map<string, any>();

      serverOrdersStore.forEach((ord, num) => {
        ordersMap.set(num, ord);
      });

      if (adminDb) {
        try {
          let dbOrders: any[] | null = null;

          const { data: joinedOrders, error: ordErr } = await adminDb
            .from('orders')
            .select('*, order_items(*, product:products(id, name, price, image_url, images, category_name)), payment_records(*)')
            .order('created_at', { ascending: false });

          if (!ordErr && joinedOrders) {
            dbOrders = joinedOrders;
          } else {
            const { data: baseOrders, error: baseErr } = await adminDb
              .from('orders')
              .select('*, order_items(*), payment_records(*)')
              .order('created_at', { ascending: false });
            if (!baseErr && baseOrders) {
              dbOrders = baseOrders;
            } else {
              console.warn('Error querying orders in /api/admin/orders:', ordErr?.message || baseErr?.message);
            }
          }

          if (dbOrders && dbOrders.length > 0) {
            const userIds = Array.from(new Set(dbOrders.map((o: any) => o.user_id).filter(Boolean)));
            const profileMap = new Map<string, any>();
            if (userIds.length > 0) {
              try {
                const { data: profs } = await adminDb
                  .from('profiles')
                  .select('id, full_name, email, phone, role, avatar_url, shipping_address')
                  .in('id', userIds);
                if (profs) {
                  profs.forEach((p: any) => profileMap.set(p.id, p));
                }
              } catch (pErr) {
                console.warn('Profiles query warning in /api/admin/orders:', pErr);
              }
            }

            const missingProductIds = new Set<string>();
            dbOrders.forEach((o: any) => {
              (o.order_items || []).forEach((it: any) => {
                if (it.product_id && (!it.product || !it.product.image_url)) {
                  missingProductIds.add(it.product_id);
                }
              });
            });

            const productLookup = new Map<string, any>();
            if (missingProductIds.size > 0) {
              try {
                const { data: prods } = await adminDb
                  .from('products')
                  .select('id, name, price, image_url, images, category_name')
                  .in('id', Array.from(missingProductIds));
                if (prods) {
                  prods.forEach((p: any) => productLookup.set(p.id, p));
                }
              } catch (prodErr) {
                console.warn('Products lookup warning in /api/admin/orders:', prodErr);
              }
            }

            dbOrders.forEach((row: any) => {
              const pay = row.payment_records?.[0] || {};
              const shipAddr = row.shipping_address || {};
              const custProfile = row.user_id ? profileMap.get(row.user_id) : null;

              const normalizedItems = (row.order_items || []).map((it: any) => {
                const prod = it.product || productLookup.get(it.product_id) || {};
                const firstImg =
                  it.product_image ||
                  prod.image_url ||
                  (Array.isArray(prod.images) ? prod.images[0] : null) ||
                  '/placeholder-product.png';

                return {
                  ...it,
                  product_id: it.product_id || prod.id,
                  product_name: it.product_name || prod.name || 'Shopcart Product',
                  product_image: firstImg,
                  unit_price: Number(it.unit_price || prod.price || 0),
                  quantity: Number(it.quantity || 1),
                  total_price: Number(it.total_price || (it.unit_price * it.quantity) || 0),
                  subtotal: Number(it.total_price || (it.unit_price * it.quantity) || 0),
                  product: prod,
                };
              });

              const normalizedOrder = {
                ...row,
                customer_name: row.customer_name || shipAddr.fullName || custProfile?.full_name || row.guest_email || 'Customer',
                customer_email: row.customer_email || shipAddr.email || custProfile?.email || row.guest_email || '',
                customer_phone: row.customer_phone || shipAddr.phone || custProfile?.phone || '',
                customer_profile: custProfile,
                order_items: normalizedItems,
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

      const includeArchived = req.query.includeArchived === 'true';

      const allOrders = Array.from(ordersMap.values())
        .filter((o) => (includeArchived ? true : !o.is_archived_by_admin))
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      return res.json({
        success: true,
        count: allOrders.length,
        orders: allOrders,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch admin orders' });
    }
  });

  app.patch('/api/admin/orders/:orderId/status', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const {
        status,
        note,
        location = 'Shopcart Fulfillment Center',
        cancellationReason,
        adminNotes,
      } = req.body || {};

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

      if (status === 'cancelled' && !cancellationReason && !note) {
        return res.status(400).json({ error: 'A cancellation reason is required when cancelling an order.' });
      }

      const timestamp = new Date().toISOString();
      const milestone = {
        id: `milestone-${Date.now()}`,
        status,
        title: `Status: ${status.replace(/_/g, ' ').toUpperCase()}`,
        description: note || cancellationReason || `Order status updated to ${status.replace(/_/g, ' ')}`,
        location,
        timestamp,
      };

      const historyItem = {
        status,
        changedAt: timestamp,
        changedBy: (req as any).adminUser?.email || 'Administrator',
        note: note || cancellationReason || adminNotes || undefined,
      };

      serverOrdersStore.forEach((ord) => {
        if (ord.id === orderId || ord.order_number === orderId) {
          ord.status = status;
          ord.updated_at = timestamp;
          if (adminNotes !== undefined) ord.admin_notes = adminNotes;
          if (status === 'cancelled') {
            ord.cancellation_reason = cancellationReason || note || 'Cancelled by Administrator';
            ord.cancelled_at = timestamp;
            ord.cancelled_by = 'admin';
          }
          if (status === 'refunded') {
            ord.paymentStatus = 'refunded';
            ord.payment_status = 'refunded';
          }
          if (!Array.isArray(ord.shipment_updates)) ord.shipment_updates = [];
          ord.shipment_updates.unshift(milestone);
          if (!Array.isArray(ord.status_history)) ord.status_history = [];
          ord.status_history.unshift(historyItem);
        }
      });
      saveOrdersToDisk();

      const adminDb = (req as any).adminSupabase;

      if (adminDb) {
        try {
          const { row: existingOrder, error: lookupErr } = await resolveTargetOrderRow(adminDb, {
            orderId,
            selectColumns: 'id, order_number, status, payment_status, shipment_updates, status_history',
          });

          if (lookupErr) {
            const mapped = mapAdminDbError(lookupErr, 'Database error looking up order');
            return res.status(mapped.status).json({ error: mapped.message });
          }

          if (!existingOrder) {
            return res.status(404).json({ error: `Order "${orderId}" not found.` });
          }

          const nextMilestones = [
            milestone,
            ...(Array.isArray(existingOrder?.shipment_updates) ? existingOrder.shipment_updates : []),
          ];
          const nextHistory = [
            historyItem,
            ...(Array.isArray(existingOrder?.status_history) ? existingOrder.status_history : []),
          ];

          const updatePayload: any = {
            status,
            updated_at: timestamp,
            shipment_updates: nextMilestones,
            status_history: nextHistory,
          };
          if (adminNotes !== undefined) updatePayload.admin_notes = adminNotes;
          if (status === 'cancelled') {
            updatePayload.cancellation_reason = cancellationReason || note || 'Cancelled by Administrator';
            updatePayload.cancelled_at = timestamp;
            updatePayload.cancelled_by = 'admin';
          }
          if (status === 'refunded') {
            updatePayload.payment_status = 'refunded';
          }

          const { error: updateErr } = await adminDb
            .from('orders')
            .update(updatePayload)
            .eq('id', existingOrder.id);

          if (updateErr) {
            if (!supabaseAdmin && (updateErr.code === '42501' || /permission denied/i.test(updateErr.message || ''))) {
              const mapped = mapAdminDbError(updateErr, 'Failed to update order status');
              return res.status(mapped.status).json({ error: mapped.message });
            }

            const minimalPayload: Record<string, any> = {
              status,
              updated_at: timestamp,
            };
            if (adminNotes !== undefined) minimalPayload.admin_notes = adminNotes;
            if (status === 'cancelled') {
              minimalPayload.cancellation_reason = updatePayload.cancellation_reason;
              minimalPayload.cancelled_at = timestamp;
              minimalPayload.cancelled_by = 'admin';
            }
            if (status === 'refunded') {
              minimalPayload.payment_status = 'refunded';
            }
            const { error: minErr } = await adminDb
              .from('orders')
              .update(minimalPayload)
              .eq('id', existingOrder.id);
            if (minErr) {
              const mapped = mapAdminDbError(minErr, 'Database error updating order status');
              return res.status(mapped.status).json({ error: mapped.message });
            }
          }

          try {
            await adminDb.from('order_shipment_updates').insert({
              order_id: existingOrder.id,
              status,
              title: milestone.title,
              description: milestone.description,
              location,
              created_at: timestamp,
            });
          } catch {
            // Optional relational milestone table
          }

          if (status === 'refunded') {
            const { error: refundPayErr } = await adminDb
              .from('payment_records')
              .update({
                payment_status: 'refunded',
                rejection_reason: note || 'Refunded by administrator',
              })
              .eq('order_id', existingOrder.id);

            if (refundPayErr) {
              const mapped = mapAdminDbError(refundPayErr, 'Failed to update payment refund status');
              return res.status(mapped.status).json({ error: mapped.message });
            }
          }
        } catch (dbErr: any) {
          console.warn('DB update order status error:', dbErr);
          return res.status(500).json({ error: dbErr?.message || 'Database error updating order status' });
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

  app.post('/api/admin/orders/:orderId/shipment-updates', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const { orderId } = req.params;
      const { status, title, location = 'In Transit', description = '', timestamp } = req.body || {};

      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Milestone title is required.' });
      }

      const eventTime = timestamp || new Date().toISOString();
      const newEvt = {
        id: `evt-${Date.now()}`,
        status: status || 'processing',
        title: title.trim(),
        location: String(location || 'In Transit').trim(),
        description: String(description || '').trim(),
        timestamp: eventTime,
      };

      serverOrdersStore.forEach((ord) => {
        if (ord.id === orderId || ord.order_number === orderId) {
          if (status) ord.status = status;
          ord.shipment_updates = [...(ord.shipment_updates || []), newEvt];
          ord.updated_at = new Date().toISOString();
        }
      });
      saveOrdersToDisk();

      if (adminDb) {
        const { row: currentOrder, error: fetchErr } = await resolveTargetOrderRow(adminDb, {
          orderId,
          selectColumns: 'id, status, shipment_updates',
        });

        if (fetchErr) {
          return res.status(500).json({ error: fetchErr.message });
        }
        if (!currentOrder) {
          return res.status(404).json({ error: `Order "${orderId}" not found.` });
        }

        const existingUpdates = Array.isArray(currentOrder.shipment_updates) ? currentOrder.shipment_updates : [];
        const merged = [...existingUpdates, newEvt];

        const { error: updErr } = await adminDb
          .from('orders')
          .update({
            status: status || currentOrder.status,
            shipment_updates: merged,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentOrder.id);

        if (updErr) {
          const mapped = mapAdminDbError(updErr, 'Failed to publish shipment update');
          return res.status(mapped.status).json({ error: mapped.message });
        }

        try {
          await adminDb.from('order_shipment_updates').insert({
            order_id: currentOrder.id,
            status: newEvt.status,
            title: newEvt.title,
            description: newEvt.description,
            location: newEvt.location,
            created_at: newEvt.timestamp,
          });
        } catch {
          // Optional relational milestone table
        }
      }

      return res.json({
        success: true,
        update: newEvt,
        message: 'Shipment update published.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to publish shipment update' });
    }
  });

  app.patch('/api/admin/orders/:orderId/archive', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const { orderId } = req.params;
      const { archive = true } = req.body || {};
      const timestamp = new Date().toISOString();

      serverOrdersStore.forEach((ord) => {
        if (ord.id === orderId || ord.order_number === orderId) {
          ord.is_archived_by_admin = Boolean(archive);
          ord.updated_at = timestamp;
        }
      });
      saveOrdersToDisk();

      if (adminDb) {
        const isUuid = UUID_REGEX.test(orderId);
        let query = adminDb.from('orders').update({
          is_archived_by_admin: Boolean(archive),
          updated_at: timestamp,
        });
        query = isUuid ? query.eq('id', orderId) : query.eq('order_number', orderId);
        const { data: updatedRows, error: dbErr } = await query.select('id');
        if (dbErr) {
          const mapped = mapAdminDbError(dbErr, 'Failed to update archive flag');
          return res.status(mapped.status).json({ error: mapped.message });
        }
        if (!updatedRows || updatedRows.length === 0) {
          return res.status(404).json({ error: `Order "${orderId}" not found.` });
        }
      }

      return res.json({
        success: true,
        isArchived: Boolean(archive),
        message: archive ? 'Order archived successfully.' : 'Order restored to active view.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to archive order' });
    }
  });

  app.post('/api/orders/:orderId/cancel', async (req: Request, res: Response) => {
    try {
      const verification = await verifySupabaseBearerToken(req);
      if (verification.errorStatus || !verification.user) {
        return res.status(verification.errorStatus || 401).json({
          error: verification.errorMessage || 'Unauthorized: Sign in required to cancel an order.',
        });
      }

      const { orderId } = req.params;
      const { cancellationReason } = req.body || {};
      const callerId = verification.user.id;
      const isAdmin = String(verification.profile?.role || '').trim().toLowerCase() === 'admin';

      if (!cancellationReason || !cancellationReason.trim()) {
        return res.status(400).json({ error: 'Please provide a reason for cancelling your order.' });
      }

      const timestamp = new Date().toISOString();

      for (const ord of serverOrdersStore.values()) {
        if (ord.id === orderId || ord.order_number === orderId) {
          if (!isAdmin && ord.user_id !== callerId) {
            return res.status(403).json({ error: 'Forbidden: You can only cancel your own orders.' });
          }

          const eligibleStatuses = ['order_placed', 'confirmed', 'processing'];
          if (!eligibleStatuses.includes(ord.status)) {
            return res.status(400).json({
              error: `Order cannot be cancelled in status "${ord.status}". Contact support if shipped.`,
            });
          }

          ord.status = 'cancelled';
          ord.cancellation_reason = cancellationReason.trim();
          ord.cancelled_at = timestamp;
          ord.cancelled_by = isAdmin ? 'admin' : 'customer';
          ord.updated_at = timestamp;

          const milestone = {
            id: `milestone-${Date.now()}`,
            status: 'cancelled',
            title: isAdmin ? 'Order Cancelled by Administrator' : 'Order Cancelled by Customer',
            description: `Cancellation requested: "${cancellationReason.trim()}"`,
            location: 'Shopcart Customer Care',
            timestamp,
          };
          if (!Array.isArray(ord.shipment_updates)) ord.shipment_updates = [];
          ord.shipment_updates.unshift(milestone);

          const historyItem = {
            status: 'cancelled',
            changedAt: timestamp,
            changedBy: isAdmin ? (verification.profile?.email || 'Administrator') : 'Customer',
            note: cancellationReason.trim(),
          };
          if (!Array.isArray(ord.status_history)) ord.status_history = [];
          ord.status_history.unshift(historyItem);
        }
      }
      saveOrdersToDisk();

      const dbClient = supabaseAdmin || verification.userClient;
      if (dbClient) {
        const isUuid = UUID_REGEX.test(orderId);
        let existingQuery = dbClient.from('orders').select('id, user_id, status');
        existingQuery = isUuid ? existingQuery.eq('id', orderId) : existingQuery.eq('order_number', orderId);
        const { data: existingDbOrder } = await existingQuery.maybeSingle();

        if (existingDbOrder) {
          if (!isAdmin && existingDbOrder.user_id !== callerId) {
            return res.status(403).json({ error: 'Forbidden: You can only cancel your own orders.' });
          }
          const eligibleStatuses = ['order_placed', 'confirmed', 'processing'];
          if (!eligibleStatuses.includes(existingDbOrder.status)) {
            return res.status(400).json({
              error: `Order cannot be cancelled in status "${existingDbOrder.status}". Contact support if shipped.`,
            });
          }

          const updatePayload: any = {
            status: 'cancelled',
            cancellation_reason: cancellationReason.trim(),
            cancelled_at: timestamp,
            cancelled_by: isAdmin ? 'admin' : 'customer',
            updated_at: timestamp,
          };
          let updQuery = dbClient.from('orders').update(updatePayload).eq('id', existingDbOrder.id);
          if (!isAdmin) updQuery = updQuery.eq('user_id', callerId);
          const { error: updErr } = await updQuery;
          if (updErr) {
            const mapped = mapAdminDbError(updErr, 'Failed to cancel order');
            return res.status(mapped.status).json({ error: mapped.message });
          }
        }
      }

      return res.json({
        success: true,
        message: 'Your order has been cancelled successfully.',
        status: 'cancelled',
        cancellationReason: cancellationReason.trim(),
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to cancel order' });
    }
  });

  app.post('/api/orders/:orderId/hide', async (req: Request, res: Response) => {
    try {
      const verification = await verifySupabaseBearerToken(req);
      if (verification.errorStatus || !verification.user) {
        return res.status(verification.errorStatus || 401).json({
          error: verification.errorMessage || 'Unauthorized: Sign in required to manage order history.',
        });
      }

      const { orderId } = req.params;
      const callerId = verification.user.id;
      const isAdmin = String(verification.profile?.role || '').trim().toLowerCase() === 'admin';
      const timestamp = new Date().toISOString();

      for (const ord of serverOrdersStore.values()) {
        if (ord.id === orderId || ord.order_number === orderId) {
          if (!isAdmin && ord.user_id !== callerId) {
            return res.status(403).json({ error: 'Forbidden: You can only hide your own orders.' });
          }
          ord.is_hidden_by_customer = true;
          ord.updated_at = timestamp;
        }
      }
      saveOrdersToDisk();

      const dbClient = supabaseAdmin || verification.userClient;
      if (dbClient) {
        const isUuid = UUID_REGEX.test(orderId);
        let existingQuery = dbClient.from('orders').select('id, user_id');
        existingQuery = isUuid ? existingQuery.eq('id', orderId) : existingQuery.eq('order_number', orderId);
        const { data: existingDbOrder } = await existingQuery.maybeSingle();

        if (existingDbOrder) {
          if (!isAdmin && existingDbOrder.user_id !== callerId) {
            return res.status(403).json({ error: 'Forbidden: You can only hide your own orders.' });
          }
          let updQuery = dbClient
            .from('orders')
            .update({ is_hidden_by_customer: true, updated_at: timestamp })
            .eq('id', existingDbOrder.id);
          if (!isAdmin) updQuery = updQuery.eq('user_id', callerId);
          const { error: updErr } = await updQuery;
          if (updErr) {
            const mapped = mapAdminDbError(updErr, 'Failed to hide order');
            return res.status(mapped.status).json({ error: mapped.message });
          }
        }
      }

      return res.json({
        success: true,
        message: 'Order hidden from your order history.',
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to hide order' });
    }
  });

  app.get('/api/orders/customer/:userId', async (req: Request, res: Response) => {
    try {
      const verification = await verifySupabaseBearerToken(req);
      if (verification.errorStatus || !verification.user) {
        return res.status(verification.errorStatus || 401).json({
          error: verification.errorMessage || 'Unauthorized: Sign in required to view customer orders.',
        });
      }

      const { userId } = req.params;
      const callerId = verification.user.id;
      const isAdmin = String(verification.profile?.role || '').trim().toLowerCase() === 'admin';

      if (!isAdmin && callerId !== userId) {
        return res.status(403).json({
          error: 'Forbidden: Customers may only access their own order history.',
        });
      }

      const includeHidden = req.query.includeHidden === 'true';

      const customerOrders: any[] = [];
      serverOrdersStore.forEach((ord) => {
        if (ord.user_id === userId) {
          if (includeHidden || !ord.is_hidden_by_customer) {
            customerOrders.push(ord);
          }
        }
      });

      const dbClient = supabaseAdmin || verification.userClient;
      if (dbClient && userId) {
        try {
          let query = dbClient
            .from('orders')
            .select('*, order_items(*), payment_records(*)')
            .eq('user_id', userId);

          if (!includeHidden) {
            query = query.eq('is_hidden_by_customer', false);
          }

          const { data, error } = await query.order('created_at', { ascending: false });
          if (!error && data) {
            const map = new Map<string, any>();
            customerOrders.forEach((o) => map.set(o.order_number, o));
            data.forEach((o: any) => map.set(o.order_number, o));
            const merged = Array.from(map.values()).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            return res.json({ success: true, count: merged.length, orders: merged });
          }
        } catch (dbErr) {
          console.warn('DB customer orders error:', dbErr);
        }
      }

      customerOrders.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return res.json({ success: true, count: customerOrders.length, orders: customerOrders });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch customer orders' });
    }
  });

  app.patch('/api/admin/orders/:orderId/shipping', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const { orderId } = req.params;
      const { carrier, trackingNumber, estimatedDeliveryDate } = req.body || {};

      const timestamp = new Date().toISOString();

      serverOrdersStore.forEach((ord) => {
        if (ord.id === orderId || ord.order_number === orderId) {
          if (carrier) ord.carrier = carrier;
          if (trackingNumber) ord.tracking_number = trackingNumber;
          if (estimatedDeliveryDate) ord.estimated_delivery_date = estimatedDeliveryDate;
          ord.updated_at = timestamp;
        }
      });
      saveOrdersToDisk();

      if (adminDb) {
        const isUuid = UUID_REGEX.test(orderId);
        const updatePayload: any = { updated_at: timestamp };
        if (carrier) updatePayload.carrier = carrier;
        if (trackingNumber) updatePayload.tracking_number = trackingNumber;
        if (estimatedDeliveryDate) updatePayload.estimated_delivery_date = estimatedDeliveryDate;

        let query = adminDb.from('orders').update(updatePayload);
        query = isUuid ? query.eq('id', orderId) : query.eq('order_number', orderId);
        const { data: updatedRows, error: dbErr } = await query.select('id');
        if (dbErr) {
          const mapped = mapAdminDbError(dbErr, 'Failed to update shipping details');
          return res.status(mapped.status).json({ error: mapped.message });
        }
        if (!updatedRows || updatedRows.length === 0) {
          return res.status(404).json({ error: `Order "${orderId}" not found.` });
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

  app.get('/api/orders/:orderNumber', async (req: Request, res: Response) => {
    try {
      const { orderNumber } = req.params;
      const authVerification = req.headers.authorization ? await verifySupabaseBearerToken(req) : null;
      if (authVerification && authVerification.errorStatus) {
        return res.status(authVerification.errorStatus).json({ error: authVerification.errorMessage });
      }

      const callerId = authVerification?.user?.id || null;
      const isAdmin = String(authVerification?.profile?.role || '').trim().toLowerCase() === 'admin';

      let foundOrder: any = serverOrdersStore.get(orderNumber) || null;
      if (!foundOrder) {
        const dbClient = supabaseAdmin || authVerification?.userClient || null;
        if (dbClient) {
          const { data, error } = await dbClient
            .from('orders')
            .select('*, order_items(*), payment_records(*)')
            .eq('order_number', orderNumber)
            .maybeSingle();
          if (!error && data) foundOrder = data;
        }
      }

      if (!foundOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (isAdmin || (callerId && foundOrder.user_id === callerId)) {
        return res.json({ success: true, order: foundOrder });
      }

      return res.json({
        success: true,
        order: {
          order_number: foundOrder.order_number,
          status: foundOrder.status,
          tracking_number: foundOrder.tracking_number,
          carrier: foundOrder.carrier,
          estimated_delivery_date: foundOrder.estimated_delivery_date,
          shipment_updates: foundOrder.shipment_updates || [],
          created_at: foundOrder.created_at,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to track order' });
    }
  });

  // ---------------------------------------------------------------------------
  // MERCHANT PAYMENT SETTINGS & ADMIN CLEARANCE
  // ---------------------------------------------------------------------------
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

  app.get('/api/admin/verify-clearance', async (req: Request, res: Response) => {
    const adminUser = (req as any).adminUser;
    const adminProfile = (req as any).adminProfile;
    return res.json({
      authorized: true,
      role: 'admin',
      userId: adminUser.id,
      email: adminUser.email,
      name: adminProfile?.full_name || null,
      verifiedAt: new Date().toISOString(),
    });
  });

  app.post('/api/admin/merchant-settings', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const {
        merchant_upi_id,
        merchant_name,
        merchant_upi_number,
        qr_image_url,
        enable_dynamic_qr,
        instructions,
      } = req.body || {};

      merchantPaymentSettings = {
        merchant_upi_id: merchant_upi_id || merchantPaymentSettings.merchant_upi_id,
        merchant_name: merchant_name || merchantPaymentSettings.merchant_name,
        merchant_upi_number: merchant_upi_number !== undefined ? merchant_upi_number : merchantPaymentSettings.merchant_upi_number,
        qr_image_url: qr_image_url || merchantPaymentSettings.qr_image_url,
        enable_dynamic_qr: enable_dynamic_qr !== undefined ? Boolean(enable_dynamic_qr) : merchantPaymentSettings.enable_dynamic_qr,
        instructions: instructions || merchantPaymentSettings.instructions,
        updated_at: new Date().toISOString(),
      };

      if (adminDb) {
        const { error } = await adminDb.from('merchant_payment_settings').upsert({
          id: 'default',
          ...merchantPaymentSettings,
        });
        if (error) {
          const mapped = mapAdminDbError(error, 'Could not upsert merchant_payment_settings');
          return res.status(mapped.status).json({ error: mapped.message });
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

  // ---------------------------------------------------------------------------
  // AI SCREENSHOT ANALYSIS (ADVISORY ONLY - NEVER AUTO-VERIFIES PAYMENT)
  // ---------------------------------------------------------------------------
  app.post('/api/payments/analyze-screenshot', async (req: Request, res: Response) => {
    try {
      const {
        screenshotBase64,
        mimeType = 'image/jpeg',
        expectedAmount,
        expectedOrderNumber,
        expectedMerchantUpi,
      } = req.body || {};

      if (!screenshotBase64 || typeof screenshotBase64 !== 'string') {
        return res.status(400).json({ error: 'Missing screenshotBase64 image payload.' });
      }

      const { provider, analysis } = await analyzePaymentScreenshotServer({
        screenshotBase64,
        mimeType,
        expectedAmount: Number(expectedAmount) || 0,
        expectedOrderNumber: typeof expectedOrderNumber === 'string' ? expectedOrderNumber : '',
        expectedMerchantUpi: typeof expectedMerchantUpi === 'string' ? expectedMerchantUpi : '',
      });

      return res.json({
        success: true,
        provider,
        analysis,
        disclaimer: 'Preliminary AI fraud risk assessment only. Actual bank ledger reconciliation by an administrator is required before order dispatch.',
      });
    } catch (err: any) {
      console.error('Exception in analyze-screenshot:', err);
      return res.status(500).json({ error: err.message || 'Failed to analyze payment screenshot' });
    }
  });

  function handleRetiredStandalonePaymentRoute(_req: Request, res: Response) {
    return res.status(410).json({
      error: 'Standalone payment recording endpoints have been retired. Orders and UPI payment records are created atomically in one transaction via POST /api/orders/create.',
      authoritativeEndpoint: '/api/orders/create',
    });
  }

  app.post('/api/payments/record-upi', handleRetiredStandalonePaymentRoute);
  app.post('/api/payments/record-gpay', handleRetiredStandalonePaymentRoute);

  // ---------------------------------------------------------------------------
  // ADMIN MANUAL UPI PAYMENT VERIFICATION (/api/admin/verify-payment)
  // Requires authenticated admin JWT + public.profiles.role = 'admin' + valid 12-char UTR
  // ---------------------------------------------------------------------------
  app.post('/api/admin/verify-payment', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const adminUser = (req as any).adminUser;
      const adminProfile = (req as any).adminProfile;
      const { paymentRecordId, orderId, orderNumber, notes } = req.body || {};

      if (!paymentRecordId && !orderId && !orderNumber) {
        return res.status(400).json({ error: 'Missing paymentRecordId, orderId, or orderNumber.' });
      }

      if (!adminDb) {
        return res.status(503).json({
          error: 'Database service unavailable: SUPABASE_SERVICE_ROLE_KEY or authenticated admin client is required.',
        });
      }

      const { row: resolvedOrder, error: orderLookupErr } = await resolveTargetOrderRow(adminDb, {
        orderId,
        orderNumber,
        selectColumns: 'id, order_number, status, payment_status, shipment_updates, status_history',
      });

      if (orderLookupErr) {
        const mapped = mapAdminDbError(orderLookupErr, 'Failed to resolve target order');
        return res.status(mapped.status).json({ error: mapped.message });
      }

      let payLookup = adminDb
        .from('payment_records')
        .select('id, order_id, payment_status, transaction_reference, raw_details, verified_at, verified_by');

      if (paymentRecordId && UUID_REGEX.test(String(paymentRecordId).trim())) {
        payLookup = payLookup.eq('id', String(paymentRecordId).trim());
      } else if (resolvedOrder?.id) {
        payLookup = payLookup.eq('order_id', resolvedOrder.id);
      } else {
        return res.status(404).json({ error: 'Matching order or payment record not found to verify.' });
      }

      const { data: existingPayRow, error: payLookupErr } = await payLookup.maybeSingle();
      if (payLookupErr) {
        const mapped = mapAdminDbError(payLookupErr, 'Failed to query payment record');
        return res.status(mapped.status).json({ error: mapped.message });
      }

      if (!existingPayRow) {
        return res.status(404).json({ error: 'No matching payment record found to verify.' });
      }

      if (resolvedOrder?.id && existingPayRow.order_id && existingPayRow.order_id !== resolvedOrder.id) {
        return res.status(400).json({ error: 'Payment record does not belong to the specified order.' });
      }

      const normalizedUtr = normalizeUtrValue(existingPayRow.transaction_reference);
      if (!normalizedUtr || !/^[0-9A-Z]{12}$/.test(normalizedUtr)) {
        return res.status(400).json({
          error: 'Manual UPI verification requires a valid 12-character alphanumeric UTR reference on the payment record.',
        });
      }

      const currentPayStatus = String(existingPayRow.payment_status || '').trim().toLowerCase();
      if (currentPayStatus === 'rejected' || currentPayStatus === 'refunded') {
        return res.status(409).json({
          error: `Cannot mark a ${currentPayStatus} payment record as verified.`,
        });
      }

      const verifiedAt = new Date().toISOString();
      const verifiedBy = adminProfile?.email || adminUser?.email || 'Store Administrator';
      const auditNotes = typeof notes === 'string' && notes.trim()
        ? notes.trim()
        : 'Verified against merchant bank statement / ledger.';

      const existingRaw = (existingPayRow.raw_details && typeof existingPayRow.raw_details === 'object')
        ? existingPayRow.raw_details
        : {};

      const mergedRawDetails = {
        ...existingRaw,
        verifiedAt,
        verifiedBy,
        verifiedByUserId: adminUser?.id || null,
        adminNotes: auditNotes,
        verifiedUtr: normalizedUtr,
        manualBankLedgerConfirmed: true,
      };

      const { data: updatedPayRows, error: payErr } = await adminDb
        .from('payment_records')
        .update({
          payment_status: 'verified',
          verified_at: verifiedAt,
          verified_by: verifiedBy,
          raw_details: mergedRawDetails,
        })
        .eq('id', existingPayRow.id)
        .select('id, order_id');

      if (payErr) {
        const mapped = mapAdminDbError(payErr, 'Failed to verify payment record');
        return res.status(mapped.status).json({ error: mapped.message });
      }
      if (!updatedPayRows || updatedPayRows.length === 0) {
        return res.status(404).json({ error: 'No matching payment record found to verify.' });
      }

      const targetOrderId = resolvedOrder?.id || updatedPayRows[0]?.order_id || existingPayRow.order_id;
      let orderRow = resolvedOrder;
      if (!orderRow && targetOrderId) {
        const { data: fetchedOrd } = await adminDb
          .from('orders')
          .select('id, order_number, status, payment_status, shipment_updates, status_history')
          .eq('id', targetOrderId)
          .maybeSingle();
        orderRow = fetchedOrd || null;
      }

      const currentOrderStatus = String(orderRow?.status || 'order_placed').trim().toLowerCase();
      const nextOrderStatus = currentOrderStatus === 'order_placed' || currentOrderStatus === 'pending'
        ? 'confirmed'
        : currentOrderStatus;

      if (targetOrderId) {
        const milestone = {
          id: `milestone-verified-${Date.now()}`,
          status: nextOrderStatus,
          title: 'Payment Confirmed',
          description: `Manual UPI UTR (${normalizedUtr}) verified by ${verifiedBy}. ${auditNotes}`,
          location: 'Shopcart Accounts & Audit',
          timestamp: verifiedAt,
        };
        const historyEntry = {
          status: nextOrderStatus,
          changedAt: verifiedAt,
          changedBy: verifiedBy,
          note: `UPI payment verified (UTR ${normalizedUtr}): ${auditNotes}`,
        };

        const fullOrderPayload: Record<string, any> = {
          status: nextOrderStatus,
          payment_status: 'verified',
          updated_at: verifiedAt,
          shipment_updates: [
            milestone,
            ...(Array.isArray(orderRow?.shipment_updates) ? orderRow.shipment_updates : []),
          ],
          status_history: [
            historyEntry,
            ...(Array.isArray(orderRow?.status_history) ? orderRow.status_history : []),
          ],
        };

        const { data: updatedOrdRows, error: ordErr } = await adminDb
          .from('orders')
          .update(fullOrderPayload)
          .eq('id', targetOrderId)
          .select('id, status');

        if (ordErr) {
          if (!supabaseAdmin && (ordErr.code === '42501' || /permission denied/i.test(ordErr.message || ''))) {
            const mapped = mapAdminDbError(ordErr, 'Failed to update order verification status');
            return res.status(mapped.status).json({ error: mapped.message });
          }

          const { data: minOrdRows, error: minOrdErr } = await adminDb
            .from('orders')
            .update({
              status: nextOrderStatus,
              payment_status: 'verified',
              updated_at: verifiedAt,
            })
            .eq('id', targetOrderId)
            .select('id, status');

          if (minOrdErr) {
            const mapped = mapAdminDbError(minOrdErr, 'Failed to update order verification status');
            return res.status(mapped.status).json({ error: mapped.message });
          }
          if (!minOrdRows || minOrdRows.length === 0) {
            return res.status(404).json({ error: 'Associated order record not found during verification.' });
          }
        } else if (!updatedOrdRows || updatedOrdRows.length === 0) {
          return res.status(404).json({ error: 'Associated order record not found during verification.' });
        }

        try {
          await adminDb.from('order_shipment_updates').insert({
            order_id: targetOrderId,
            status: nextOrderStatus,
            title: milestone.title,
            description: milestone.description,
            location: milestone.location,
            created_at: verifiedAt,
          });
        } catch {
          // Optional relational milestone table
        }
      }

      serverOrdersStore.forEach((ord) => {
        if (ord.id === targetOrderId || (orderRow?.order_number && ord.order_number === orderRow.order_number)) {
          ord.status = nextOrderStatus;
          ord.paymentStatus = 'verified';
          ord.payment_status = 'verified';
          ord.verified_at = verifiedAt;
          ord.verified_by = verifiedBy;
          ord.updated_at = verifiedAt;
          if (Array.isArray(ord.payment_records)) {
            ord.payment_records = ord.payment_records.map((p: any) => ({
              ...p,
              payment_status: 'verified',
              verified_at: verifiedAt,
              verified_by: verifiedBy,
              raw_details: mergedRawDetails,
            }));
          }
        }
      });
      saveOrdersToDisk();

      return res.json({
        success: true,
        orderId: targetOrderId,
        orderStatus: nextOrderStatus,
        paymentStatus: 'verified',
        verifiedAt,
        verifiedBy,
        utr: normalizedUtr,
        message: 'Payment successfully verified against merchant bank ledger.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to verify payment' });
    }
  });

  // ---------------------------------------------------------------------------
  // ADMIN REJECT PAYMENT (/api/admin/reject-payment)
  // ---------------------------------------------------------------------------
  app.post('/api/admin/reject-payment', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const adminUser = (req as any).adminUser;
      const adminProfile = (req as any).adminProfile;
      const { paymentRecordId, orderId, orderNumber, reason } = req.body || {};

      if (!paymentRecordId && !orderId && !orderNumber) {
        return res.status(400).json({ error: 'Missing paymentRecordId, orderId, or orderNumber' });
      }

      if (!adminDb) {
        return res.status(503).json({
          error: 'Database service unavailable: SUPABASE_SERVICE_ROLE_KEY or authenticated admin client is required.',
        });
      }

      const { row: resolvedOrder, error: orderLookupErr } = await resolveTargetOrderRow(adminDb, {
        orderId,
        orderNumber,
        selectColumns: 'id, order_number, status, payment_status, shipment_updates, status_history',
      });

      if (orderLookupErr) {
        const mapped = mapAdminDbError(orderLookupErr, 'Failed to lookup target order');
        return res.status(mapped.status).json({ error: mapped.message });
      }

      let payLookup = adminDb
        .from('payment_records')
        .select('id, order_id, payment_status, transaction_reference, raw_details');

      if (paymentRecordId && UUID_REGEX.test(String(paymentRecordId).trim())) {
        payLookup = payLookup.eq('id', String(paymentRecordId).trim());
      } else if (resolvedOrder?.id) {
        payLookup = payLookup.eq('order_id', resolvedOrder.id);
      } else {
        return res.status(404).json({ error: 'Matching order or payment record not found to reject.' });
      }

      const { data: existingPayRow, error: payLookupErr } = await payLookup.maybeSingle();
      if (payLookupErr) {
        const mapped = mapAdminDbError(payLookupErr, 'Failed to query payment record');
        return res.status(mapped.status).json({ error: mapped.message });
      }
      if (!existingPayRow) {
        return res.status(404).json({ error: 'No matching payment record found to reject.' });
      }

      const rejectionReason = (reason || 'Payment could not be verified in merchant bank ledger').trim();
      const rejectedAt = new Date().toISOString();
      const rejectedBy = adminProfile?.email || adminUser?.email || 'Store Administrator';

      const existingRaw = (existingPayRow.raw_details && typeof existingPayRow.raw_details === 'object')
        ? existingPayRow.raw_details
        : {};

      const mergedRawDetails = {
        ...existingRaw,
        rejectedAt,
        rejectedBy,
        rejectedByUserId: adminUser?.id || null,
        rejectionReason,
      };

      const { data: updatedPayRows, error: payErr } = await adminDb
        .from('payment_records')
        .update({
          payment_status: 'rejected',
          rejection_reason: rejectionReason,
          raw_details: mergedRawDetails,
        })
        .eq('id', existingPayRow.id)
        .select('id, order_id');

      if (payErr) {
        const mapped = mapAdminDbError(payErr, 'Failed to reject payment record');
        return res.status(mapped.status).json({ error: mapped.message });
      }
      if (!updatedPayRows || updatedPayRows.length === 0) {
        return res.status(404).json({ error: 'No matching payment record found to reject.' });
      }

      const targetOrderId = resolvedOrder?.id || updatedPayRows[0]?.order_id || existingPayRow.order_id;
      if (targetOrderId) {
        const milestone = {
          id: `milestone-rejected-${Date.now()}`,
          status: 'cancelled',
          title: 'Payment Rejected & Order Cancelled',
          description: rejectionReason,
          location: 'Shopcart Accounts & Audit',
          timestamp: rejectedAt,
        };
        const historyEntry = {
          status: 'cancelled',
          changedAt: rejectedAt,
          changedBy: rejectedBy,
          note: `Payment rejected: ${rejectionReason}`,
        };

        const { data: updatedOrdRows, error: ordErr } = await adminDb
          .from('orders')
          .update({
            status: 'cancelled',
            payment_status: 'rejected',
            cancellation_reason: rejectionReason,
            cancelled_at: rejectedAt,
            cancelled_by: 'admin',
            updated_at: rejectedAt,
            shipment_updates: [
              milestone,
              ...(Array.isArray(resolvedOrder?.shipment_updates) ? resolvedOrder.shipment_updates : []),
            ],
            status_history: [
              historyEntry,
              ...(Array.isArray(resolvedOrder?.status_history) ? resolvedOrder.status_history : []),
            ],
          })
          .eq('id', targetOrderId)
          .select('id');

        if (ordErr) {
          if (!supabaseAdmin && (ordErr.code === '42501' || /permission denied/i.test(ordErr.message || ''))) {
            const mapped = mapAdminDbError(ordErr, 'Failed to update order rejection status');
            return res.status(mapped.status).json({ error: mapped.message });
          }

          const { data: minOrdRows, error: minOrdErr } = await adminDb
            .from('orders')
            .update({
              status: 'cancelled',
              payment_status: 'rejected',
              updated_at: rejectedAt,
            })
            .eq('id', targetOrderId)
            .select('id');
          if (minOrdErr) {
            const mapped = mapAdminDbError(minOrdErr, 'Failed to update order rejection status');
            return res.status(mapped.status).json({ error: mapped.message });
          }
          if (!minOrdRows || minOrdRows.length === 0) {
            return res.status(404).json({ error: 'Associated order record not found during rejection.' });
          }
        } else if (!updatedOrdRows || updatedOrdRows.length === 0) {
          return res.status(404).json({ error: 'Associated order record not found during rejection.' });
        }

        try {
          await adminDb.from('order_shipment_updates').insert({
            order_id: targetOrderId,
            status: 'cancelled',
            title: milestone.title,
            description: milestone.description,
            location: milestone.location,
            created_at: rejectedAt,
          });
        } catch {
          // Optional
        }
      }

      serverOrdersStore.forEach((ord) => {
        if (ord.id === targetOrderId || (resolvedOrder?.order_number && ord.order_number === resolvedOrder.order_number)) {
          ord.status = 'cancelled';
          ord.paymentStatus = 'rejected';
          ord.payment_status = 'rejected';
          ord.rejection_reason = rejectionReason;
          ord.cancellation_reason = rejectionReason;
          ord.cancelled_at = rejectedAt;
          ord.cancelled_by = 'admin';
          ord.updated_at = rejectedAt;
        }
      });
      saveOrdersToDisk();

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

  // ---------------------------------------------------------------------------
  // ADMIN REQUEST REPLACEMENT SCREENSHOT (/api/admin/request-new-screenshot)
  // ---------------------------------------------------------------------------
  app.post('/api/admin/request-new-screenshot', async (req: Request, res: Response) => {
    try {
      const adminDb = (req as any).adminSupabase;
      const adminUser = (req as any).adminUser;
      const adminProfile = (req as any).adminProfile;
      const { paymentRecordId, orderId, orderNumber, reason, message } = req.body || {};

      if (!paymentRecordId && !orderId && !orderNumber) {
        return res.status(400).json({ error: 'Missing paymentRecordId, orderId, or orderNumber' });
      }

      if (!adminDb) {
        return res.status(503).json({
          error: 'Database service unavailable: SUPABASE_SERVICE_ROLE_KEY or authenticated admin client is required.',
        });
      }

      const { row: resolvedOrder, error: orderLookupErr } = await resolveTargetOrderRow(adminDb, {
        orderId,
        orderNumber,
        selectColumns: 'id, order_number',
      });

      if (orderLookupErr) {
        const mapped = mapAdminDbError(orderLookupErr, 'Failed to lookup target order');
        return res.status(mapped.status).json({ error: mapped.message });
      }

      let payLookup = adminDb
        .from('payment_records')
        .select('id, order_id, raw_details');

      if (paymentRecordId && UUID_REGEX.test(String(paymentRecordId).trim())) {
        payLookup = payLookup.eq('id', String(paymentRecordId).trim());
      } else if (resolvedOrder?.id) {
        payLookup = payLookup.eq('order_id', resolvedOrder.id);
      } else {
        return res.status(404).json({ error: 'Matching order or payment record not found.' });
      }

      const { data: existingPayRow, error: payLookupErr } = await payLookup.maybeSingle();
      if (payLookupErr) {
        const mapped = mapAdminDbError(payLookupErr, 'Failed to query payment record');
        return res.status(mapped.status).json({ error: mapped.message });
      }
      if (!existingPayRow) {
        return res.status(404).json({ error: 'No matching payment record found.' });
      }

      const note = (message || reason || 'Uploaded screenshot is blurry or unreadable. Please provide a clear receipt.').trim();
      const requestedAt = new Date().toISOString();
      const requestedBy = adminProfile?.email || adminUser?.email || 'Store Administrator';

      const existingRaw = (existingPayRow.raw_details && typeof existingPayRow.raw_details === 'object')
        ? existingPayRow.raw_details
        : {};

      const { error: payUpdErr } = await adminDb
        .from('payment_records')
        .update({
          payment_status: 'awaiting_payment',
          raw_details: {
            ...existingRaw,
            screenshotRequestedAt: requestedAt,
            requestedBy,
            requestNote: note,
          },
        })
        .eq('id', existingPayRow.id);

      if (payUpdErr) {
        const mapped = mapAdminDbError(payUpdErr, 'Failed to update payment record screenshot request');
        return res.status(mapped.status).json({ error: mapped.message });
      }

      const targetOrderId = resolvedOrder?.id || existingPayRow.order_id;
      if (targetOrderId) {
        await adminDb
          .from('orders')
          .update({
            payment_status: 'awaiting_payment',
            updated_at: requestedAt,
          })
          .eq('id', targetOrderId);
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

  // ---------------------------------------------------------------------------
  // SUPABASE STATUS / VERIFY / SAVE DIAGNOSTIC APIS
  // ---------------------------------------------------------------------------
  app.get('/api/supabase/status', async (_req: Request, res: Response) => {
    const currentUrl = (process.env.VITE_SUPABASE_URL || supabaseUrl || '').trim();
    const currentKey = (process.env.VITE_SUPABASE_ANON_KEY || supabaseAnonKey || '').trim();

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

  app.post('/api/supabase/verify', async (req: Request, res: Response) => {
    try {
      const { url, anonKey } = req.body || {};

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

      const { data: cats, error: catErr } = await client.from('categories').select('id, name').limit(15);
      if (catErr) {
        return res.status(400).json({
          success: false,
          step: 'categories',
          latencyMs: Date.now() - startTime,
          message: `Categories query failed: ${catErr.message}. Ensure supabase/schema.sql has been executed in the Supabase SQL Editor.`,
        });
      }

      const { data: prods, error: prodErr } = await client.from('products').select('id, name, price').limit(15);
      if (prodErr) {
        return res.status(400).json({
          success: false,
          step: 'products',
          latencyMs: Date.now() - startTime,
          message: `Products query failed: ${prodErr.message}`,
        });
      }

      const { data: inv, error: invErr } = await client.from('inventory').select('product_id, stock_count').limit(15);
      if (invErr) {
        return res.status(400).json({
          success: false,
          step: 'inventory',
          latencyMs: Date.now() - startTime,
          message: `Inventory query failed: ${invErr.message}`,
        });
      }

      const { error: orderErr } = await client.from('orders').select('id').limit(1);
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

  app.post('/api/supabase/save', async (req: Request, res: Response) => {
    try {
      const existingUrl = (process.env.VITE_SUPABASE_URL || '').trim();
      const existingAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (existingUrl && existingAnonKey) {
        const verification = await verifySupabaseBearerToken(req);
        if (verification.errorStatus) {
          return res.status(verification.errorStatus).json({
            success: false,
            message: verification.errorMessage,
          });
        }
        const normalizedRole = String(verification.profile?.role || '').trim().toLowerCase();
        if (normalizedRole !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Only administrators can modify server Supabase credentials.',
          });
        }
      }

      if (isServerlessRuntime) {
        return res.status(400).json({
          success: false,
          message: 'Serverless environment is read-only. Manage Supabase environment variables in Vercel Project Settings.',
        });
      }

      const { url, anonKey } = req.body || {};

      if (!url || !anonKey) {
        return res.status(400).json({ success: false, message: 'Missing URL or Anon Key' });
      }

      const trimmedUrl = String(url).trim();
      const trimmedKey = String(anonKey).trim();

      const client = createClient(trimmedUrl, trimmedKey, { auth: { persistSession: false } });
      const { error: testErr } = await client.from('categories').select('id').limit(1);

      if (testErr) {
        return res.status(400).json({
          success: false,
          message: `Connection failed: ${testErr.message}. Please check your Project URL and Anon Key.`,
        });
      }

      process.env.VITE_SUPABASE_URL = trimmedUrl;
      process.env.VITE_SUPABASE_ANON_KEY = trimmedKey;

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

  // Catch-all JSON 404 for unknown /api/* routes (never return HTML on /api/*)
  app.use('/api', (_req: Request, res: Response) => {
    return res.status(404).json({
      error: 'API endpoint not found.',
    });
  });

  // Ensure any Express body-parser or unexpected runtime error on /api/* returns JSON (never HTML)
  app.use('/api', (err: any, _req: Request, res: Response, _next: express.NextFunction) => {
    const status = typeof err?.status === 'number' ? err.status : (typeof err?.statusCode === 'number' ? err.statusCode : 500);
    return res.status(status).json({
      error: err?.message || 'Internal API error.',
    });
  });

  return app;
}

let cachedApiApp: express.Express | null = null;

export function getApiApp(): express.Express {
  if (!cachedApiApp) {
    cachedApiApp = createApiApp();
  }
  return cachedApiApp;
}
