import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('   SHOPCART – ADMIN ORDERS MANAGEMENT SYSTEM TEST SUITE');
console.log('================================================================\n');

let allPassed = true;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    allPassed = false;
  }
}

async function runTests() {
  const testOrderNumber = `ORD-TEST-${Date.now()}`;
  const testUtr = '438901234567'; // 12-digit Indian UPI UTR

  // -------------------------------------------------------------
  // 1. Create a Complete Test Order via Order Creation API
  // -------------------------------------------------------------
  console.log('[1/5] Creating Test Order with Complete Delivery & UPI Details:');
  const orderPayload = {
    orderNumber: testOrderNumber,
    customerName: 'Aarav Sharma',
    customerEmail: 'aarav.sharma@example.in',
    customerPhone: '+91 98765 43210',
    houseBuilding: 'Flat 402, Royal Palms Residency',
    streetArea: '12th Main Road, Indiranagar',
    landmark: 'Opposite BDA Complex',
    city: 'Bengaluru',
    state: 'Karnataka',
    pinCode: '560038',
    country: 'India',
    deliveryInstructions: 'Please leave with security if unavailable',
    cartItems: [
      {
        productId: 'eko-prod-1',
        productName: 'Aura Wireless Noise Cancelling Headphones',
        productImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
        quantity: 2,
        unitPrice: 2499,
        totalPrice: 4998,
        selectedColor: 'Matte Black',
      },
      {
        productId: 'eko-prod-2',
        productName: 'Apex Pro GPS Smartwatch',
        productImage: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
        quantity: 1,
        unitPrice: 3999,
        totalPrice: 3999,
        selectedColor: 'Silver Slate',
      },
    ],
    pricing: {
      subtotal: 8997,
      shippingFee: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 8997,
    },
    paymentMethod: 'google_pay_upi',
    transactionReference: testUtr,
    customerNotes: 'Deliver between 10am and 4pm',
  };

  let createdOrderData: any = null;
  try {
    const res = await fetch('http://localhost:3000/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    assert(res.ok, `Order creation API returned HTTP ${res.status}`);
    createdOrderData = await res.json();
    assert(createdOrderData.success === true, 'Order created successfully with success: true');
    assert(createdOrderData.orderNumber === testOrderNumber, `Order Number matches: ${testOrderNumber}`);
    assert(createdOrderData.paymentStatus === 'pending_admin_verification', 'Payment initial status is strictly "pending_admin_verification" (Never automatically marked as paid)');
  } catch (err: any) {
    assert(false, `Order creation failed: ${err.message}`);
  }

  // -------------------------------------------------------------
  // 2. Query /api/admin/orders to Validate Admin Joined View
  // -------------------------------------------------------------
  console.log('\n[2/5] Fetching Orders via Admin Orders API:');
  let retrievedOrder: any = null;
  try {
    const res = await fetch('http://localhost:3000/api/admin/orders');
    assert(res.ok, `Admin orders API returned HTTP ${res.status}`);
    const json = await res.json();
    assert(json.success === true, 'Admin orders endpoint returned success: true');
    assert(Array.isArray(json.orders), `Admin orders returned array of orders (count: ${json.orders?.length})`);

    retrievedOrder = json.orders?.find((o: any) => o.order_number === testOrderNumber);
    assert(!!retrievedOrder, `Test order ${testOrderNumber} found in admin orders list`);
  } catch (err: any) {
    assert(false, `Admin orders fetch failed: ${err.message}`);
  }

  // -------------------------------------------------------------
  // 3. Validate Complete Customer Information & Product Details
  // -------------------------------------------------------------
  if (retrievedOrder) {
    console.log('\n[3/5] Validating Complete Customer Information & Ordered Products:');
    
    // Customer Info Checks
    assert(retrievedOrder.customer_name === 'Aarav Sharma', `Customer Full Name matches: "${retrievedOrder.customer_name}"`);
    assert(retrievedOrder.customer_email === 'aarav.sharma@example.in', `Customer Email matches: "${retrievedOrder.customer_email}"`);
    assert(retrievedOrder.customer_phone?.includes('98765'), `Customer Phone matches: "${retrievedOrder.customer_phone}"`);

    const addr = retrievedOrder.shipping_address;
    assert(!!addr, 'Complete shipping address object present');
    assert(addr?.city === 'Bengaluru', `City: "${addr?.city}"`);
    assert(addr?.state === 'Karnataka', `State: "${addr?.state}"`);
    assert(addr?.pinCode === '560038' || addr?.postalCode === '560038', `PIN Code: "${addr?.pinCode || addr?.postalCode}"`);
    assert(addr?.country === 'India', `Country: "${addr?.country}"`);

    // Ordered Product Details Checks
    const items = retrievedOrder.order_items;
    assert(Array.isArray(items) && items.length === 2, `Ordered items count matches 2 items`);

    const item1 = items?.find((it: any) => it.product_id === 'eko-prod-1');
    assert(!!item1, 'Product 1 (eko-prod-1) present in order items');
    if (item1) {
      assert(!!item1.product_image, `Product 1 image URL resolved: ${item1.product_image?.slice(0, 45)}...`);
      assert(item1.product_name.includes('Aura'), `Product 1 Name: "${item1.product_name}"`);
      assert(item1.quantity === 2, `Product 1 Quantity: ${item1.quantity}`);
      assert(Number(item1.unit_price) === 2499, `Product 1 Unit Price: ₹${item1.unit_price}`);
      assert(Number(item1.total_price || item1.subtotal) === 4998, `Product 1 Subtotal: ₹${item1.total_price || item1.subtotal}`);
    }

    const item2 = items?.find((it: any) => it.product_id === 'eko-prod-2');
    assert(!!item2, 'Product 2 (eko-prod-2) present in order items');
    if (item2) {
      assert(!!item2.product_image, `Product 2 image URL resolved: ${item2.product_image?.slice(0, 45)}...`);
      assert(item2.quantity === 1, `Product 2 Quantity: ${item2.quantity}`);
      assert(Number(item2.unit_price) === 3999, `Product 2 Unit Price: ₹${item2.unit_price}`);
    }

    assert(Number(retrievedOrder.total_amount) === 8997, `Grand Total: ₹${retrievedOrder.total_amount}`);

    // Payment Management Details Checks
    assert(retrievedOrder.paymentMethod === 'google_pay_upi', `Payment Method: "${retrievedOrder.paymentMethod}"`);
    assert(
      retrievedOrder.transactionReference === testUtr ||
      retrievedOrder.payment_records?.[0]?.transaction_reference === testUtr,
      `UPI 12-digit UTR reference: "${testUtr}"`
    );
    assert(
      retrievedOrder.paymentStatus === 'pending_admin_verification',
      'Payment Status is Pending (Never auto-marked paid without manual verification)'
    );
  }

  // -------------------------------------------------------------
  // 4. Test Order Status Progression Pipeline
  // Order Placed -> Confirmed -> Processing -> Shipped -> Out for Delivery -> Delivered
  // -------------------------------------------------------------
  console.log('\n[4/5] Testing Order Status Transitions:');
  const targetId = retrievedOrder?.id || retrievedOrder?.order_number;
  if (targetId) {
    const statusesToTest = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
    for (const st of statusesToTest) {
      try {
        const patchRes = await fetch(`http://localhost:3000/api/admin/orders/${targetId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: st,
            note: `Automated test progression to ${st}`,
            location: 'Shopcart Bengaluru Hub',
          }),
        });
        const patchJson = await patchRes.json();
        assert(patchJson.success === true && patchJson.status === st, `Status updated to: "${st}"`);
      } catch (err: any) {
        assert(false, `Failed updating status to ${st}: ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------
  // 5. Test Server-Authoritative Payment Verification
  // -------------------------------------------------------------
  console.log('\n[5/5] Testing Authoritative Payment Verification against Bank Ledger:');
  if (targetId) {
    try {
      const verifyRes = await fetch('http://localhost:3000/api/admin/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetId,
          orderNumber: testOrderNumber,
          adminEmail: 'admin@shopcart.com',
          notes: 'Bank ledger entry verified for 12-digit UTR credit',
        }),
      });

      assert(verifyRes.ok, `Verify payment API returned HTTP ${verifyRes.status}`);
      const verifyJson = await verifyRes.json();
      assert(verifyJson.success === true, 'Payment verification returned success: true');
      assert(verifyJson.paymentStatus === 'verified', 'Payment status updated to "verified"');
      assert(!!verifyJson.verifiedAt, `Verified timestamp recorded: ${verifyJson.verifiedAt}`);
      assert(verifyJson.verifiedBy === 'admin@shopcart.com', `Verified by: ${verifyJson.verifiedBy}`);
    } catch (err: any) {
      assert(false, `Payment verification failed: ${err.message}`);
    }
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('   ALL ADMIN ORDER MANAGEMENT SYSTEM TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
    process.exit(0);
  } else {
    console.error('   SOME CHECKS FAILED. PLEASE REVIEW LOGS ABOVE.');
    console.log('================================================================\n');
    process.exit(1);
  }
}

runTests();
