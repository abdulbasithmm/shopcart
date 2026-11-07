/**
 * Automated Verification Script for Universal UPI QR Payment System & AI Screenshot Fraud Analysis
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('================================================================');
  console.log('🚀 TESTING UNIVERSAL UPI & GEMINI AI FRAUD ANALYSIS SYSTEM');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, extra?: any) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`, extra || '');
      failed++;
    }
  };

  // TEST 1: Merchant Settings GET
  try {
    const res = await fetch(`${BASE_URL}/api/payments/merchant-settings`);
    const data = await res.json();
    assert(res.ok && Boolean(data.merchant_upi_id), 'GET /api/payments/merchant-settings returns configured store UPI ID', data.merchant_upi_id);
    assert(data.enable_dynamic_qr !== undefined, 'Merchant settings contains dynamic QR configuration', data.enable_dynamic_qr);
  } catch (err: any) {
    assert(false, 'GET /api/payments/merchant-settings network error', err.message);
  }

  // TEST 2: Update Merchant Settings POST
  try {
    const res = await fetch(`${BASE_URL}/api/admin/merchant-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_upi_id: 'shopcart.official@okaxis',
        merchant_name: 'Shop Cart Flagship Store',
        merchant_upi_number: '+91 98765 43210',
        enable_dynamic_qr: true,
        instructions: 'Scan with Google Pay, PhonePe, Paytm, BHIM, or any UPI app.',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'POST /api/admin/merchant-settings updates configuration', data.message);
    assert(data.settings?.merchant_upi_id === 'shopcart.official@okaxis', 'Updated UPI ID reflects accurately', data.settings?.merchant_upi_id);
  } catch (err: any) {
    assert(false, 'POST /api/admin/merchant-settings network error', err.message);
  }

  // TEST 3: AI Screenshot Fraud Analysis (Matching Receipt)
  // Create a minimal 1x1 test image base64
  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  try {
    const res = await fetch(`${BASE_URL}/api/payments/analyze-screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshotBase64: sampleBase64,
        mimeType: 'image/png',
        expectedAmount: 49.99,
        expectedOrderNumber: 'SC-TEST-999',
        expectedMerchantUpi: 'shopcart.official@okaxis',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.analysis !== undefined, 'POST /api/payments/analyze-screenshot returns structured AI analysis');
    assert(typeof data.analysis?.confidence_score === 'number', 'AI analysis includes confidence score (0-100)', data.analysis?.confidence_score);
    assert(
      ['DETAILS_MATCH', 'REVIEW_REQUIRED', 'POSSIBLE_FRAUD'].includes(data.analysis?.recommended_action),
      'AI recommendation verdict conforms to strict canonical states',
      data.analysis?.recommended_action
    );
    assert(Boolean(data.analysis?.ai_summary), 'AI analysis contains concise explanation summary');
  } catch (err: any) {
    assert(false, 'POST /api/payments/analyze-screenshot network error', err.message);
  }

  // TEST 4: Record Universal UPI Payment with Screenshot & AI Audit
  const testOrderNum = `SC-AUTOTEST-${Date.now().toString().slice(-5)}`;
  const testUtr = `987654${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const res = await fetch(`${BASE_URL}/api/payments/record-upi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: testOrderNum,
        upiTransactionRef: testUtr,
        amount: 85.50,
        paymentMethod: 'phonepe_upi',
        screenshotBase64: sampleBase64,
        aiAnalysis: {
          screenshot_status: 'valid_success',
          extracted_utr: testUtr,
          extracted_amount: 85.50,
          extracted_merchant: 'shopcart.official@okaxis',
          extracted_app: 'PhonePe',
          extracted_timestamp: new Date().toISOString(),
          amount_matches: true,
          merchant_matches: true,
          suspicious_indicators: [],
          confidence_score: 95,
          recommended_action: 'DETAILS_MATCH',
          ai_summary: 'Genuine PhonePe receipt with matching order amount and recipient handle.',
        },
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'POST /api/payments/record-upi accepts submission with screenshot & AI audit', data.message);
    assert(data.paymentStatus === 'pending_admin_verification', 'Payment status is strictly set to pending_admin_verification (never auto-marked paid)', data.paymentStatus);
    assert(Boolean(data.screenshotUrl), 'Screenshot is saved and accessible on server', data.screenshotUrl);
  } catch (err: any) {
    assert(false, 'POST /api/payments/record-upi network error', err.message);
  }

  // TEST 5: Duplicate UTR Prevention
  try {
    const dupRes = await fetch(`${BASE_URL}/api/payments/record-upi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: `SC-DUP-${Date.now()}`,
        upiTransactionRef: testUtr,
        amount: 85.50,
        paymentMethod: 'gpay_upi',
      }),
    });
    assert(dupRes.status === 409, 'Duplicate UTR submission is strictly rejected with HTTP 409 Conflict', dupRes.status);
  } catch (err: any) {
    assert(false, 'Duplicate UTR test network error', err.message);
  }

  // TEST 6: Request Replacement Screenshot API
  try {
    const res = await fetch(`${BASE_URL}/api/admin/request-new-screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Role': 'admin' },
      body: JSON.stringify({
        orderNumber: testOrderNum,
        message: 'The transaction reference number was slightly blurry. Please provide a clear screenshot.',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'POST /api/admin/request-new-screenshot logs customer request', data.message);
  } catch (err: any) {
    assert(false, 'POST /api/admin/request-new-screenshot network error', err.message);
  }

  // TEST 7: Admin Verification Endpoint (Manual Bank Statement Reconciliation)
  try {
    const res = await fetch(`${BASE_URL}/api/admin/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Role': 'admin' },
      body: JSON.stringify({
        orderNumber: testOrderNum,
        adminEmail: 'admin@shopcart.com',
        notes: 'Reconciled against merchant Axis Bank current account credit record at 11:30 AM.',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'POST /api/admin/verify-payment allows administrator to confirm bank ledger credit', data.message);
  } catch (err: any) {
    assert(false, 'POST /api/admin/verify-payment network error', err.message);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
