/**
 * Production Separation & Supabase Verification Test Suite
 */

const BASE_URL = 'http://localhost:3000';

async function runSeparationTests() {
  console.log('================================================================');
  console.log('🚀 PRODUCTION VERIFICATION: CUSTOMER STOREFRONT & SECURE ADMIN PORTAL');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, detail?: any) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`, detail || '');
      failed++;
    }
  };

  // 1. Supabase Connection Status
  try {
    const res = await fetch(`${BASE_URL}/api/supabase/status`);
    const data = await res.json();
    assert(res.ok && data.isLive, 'Supabase live PostgreSQL database connected', data.message);
    assert(data.url?.includes('kciglyawyagwtgkwsxau'), 'Connected to verified project kciglyawyagwtgkwsxau', data.url);
    assert(data.categoryCount > 0, `Database contains real category records (${data.categoryCount} categories found)`);
    assert(data.productCount > 0, `Database contains real product records (${data.productCount}+ products found)`);
  } catch (err: any) {
    assert(false, 'Supabase status check failed', err.message);
  }

  // 2. CORS & Subdomain Support
  try {
    const res = await fetch(`${BASE_URL}/api/payments/merchant-settings`, {
      method: 'GET',
      headers: {
        Origin: 'https://admin.shopcart.com',
      },
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    const allowCreds = res.headers.get('access-control-allow-credentials');
    assert(allowOrigin === 'https://admin.shopcart.com', 'CORS allows admin.shopcart.com subdomain', allowOrigin);
    assert(allowCreds === 'true', 'CORS allows credentials for authentication session cookies', allowCreds);
  } catch (err: any) {
    assert(false, 'CORS subdomain check failed', err.message);
  }

  // 3. Security: Customer Role Access Rejection on /api/admin/*
  try {
    const res = await fetch(`${BASE_URL}/api/admin/merchant-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Role': 'customer', // Customer role simulation
      },
      body: JSON.stringify({
        merchant_name: 'Hacked Store',
      }),
    });
    assert(res.status === 403, 'Customer account is strictly rejected from /api/admin endpoints (HTTP 403 Forbidden)', res.status);
  } catch (err: any) {
    assert(false, 'Customer admin rejection test failed', err.message);
  }

  // 4. Admin API Authorization
  try {
    const res = await fetch(`${BASE_URL}/api/admin/merchant-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Role': 'admin',
      },
      body: JSON.stringify({
        merchant_upi_id: 'shopcart.official@okaxis',
        merchant_name: 'Shopcart Official Store',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Authorized administrator can configure merchant payment settings', data.message);
  } catch (err: any) {
    assert(false, 'Admin configuration test failed', err.message);
  }

  // 5. Storefront Customer Order Creation Flow (Pending Admin Verification)
  const customerOrderNum = `SC-CUST-${Date.now().toString().slice(-5)}`;
  const customerUtr = `778899${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const res = await fetch(`${BASE_URL}/api/payments/record-upi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: customerOrderNum,
        upiTransactionRef: customerUtr,
        amount: 149.00,
        paymentMethod: 'all_upi',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Customer order creation and UPI submission accepted', data.message);
    assert(data.paymentStatus === 'pending_admin_verification', 'Customer order starts as pending_admin_verification', data.paymentStatus);
  } catch (err: any) {
    assert(false, 'Customer order creation test failed', err.message);
  }

  // 6. Admin Verification of the Customer Order
  try {
    const res = await fetch(`${BASE_URL}/api/admin/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Role': 'admin',
      },
      body: JSON.stringify({
        orderNumber: customerOrderNum,
        adminEmail: 'admin@shopcart.com',
        notes: 'Verified against bank ledger credit record.',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Store administrator reconciles and verifies customer order', data.message);
    assert(data.paymentStatus === 'verified', 'Payment status upgraded to verified after administrator approval', data.paymentStatus);
  } catch (err: any) {
    assert(false, 'Admin order verification test failed', err.message);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runSeparationTests();
