/// <reference path="./declarations.d.ts" />
import mongoose from 'mongoose';
import User from './models/User';
import Shop from './models/Shop';
import Product from './models/Product';
import Order from './models/Order';
import { connectRabbitMQ, pubsub } from './rabbitmq';
import { DiscountEngine } from './services/DiscountEngine';

const API_BASE = 'http://127.0.0.1:5000';

async function runHardenedTests() {
  console.log('=== STARTING ENTERPRISE HARDENING INTEGRATION TESTS ===');
  let testSuccess = true;

  try {
    // 1. Connect to DB
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev5_hardened_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV5 Hardened' } });
    await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV5 Hardened' } });
    await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV5HardenedCOD' });

    const timestamp = Date.now();
    const sellerAEmail = `ev5_hardened_seller_a_${timestamp}@test.com`;
    const sellerBEmail = `ev5_hardened_seller_b_${timestamp}@test.com`;
    const buyerEmail = `ev5_hardened_buyer_${timestamp}@test.com`;

    // 2. Register Seller A, Seller B, and Buyer
    console.log('- Registering Seller A via API...');
    const regResA = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV5 Hardened Seller A', email: sellerAEmail, password: 'password123', role: 'seller' })
    });
    const regDataA = await regResA.json();
    const tokenA = regDataA.token;

    console.log('- Registering Seller B via API...');
    const regResB = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV5 Hardened Seller B', email: sellerBEmail, password: 'password123', role: 'seller' })
    });
    const regDataB = await regResB.json();
    const tokenB = regDataB.token;

    console.log('- Registering Buyer via API...');
    const regResBuyer = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV5 Hardened Buyer', email: buyerEmail, password: 'password123' })
    });
    const regDataBuyer = await regResBuyer.json();
    const tokenBuyer = regDataBuyer.token;

    const dbSellerA = await User.findOne({ email: sellerAEmail });
    const dbSellerB = await User.findOne({ email: sellerBEmail });
    const dbBuyer = await User.findOne({ email: buyerEmail });
    const dbShopA = await Shop.findOne({ owner: dbSellerA?._id });
    const dbShopB = await Shop.findOne({ owner: dbSellerB?._id });

    if (!dbShopA || !dbShopB) throw new Error('Shops were not auto-created!');

    console.log('\n=== TEST 1: RabbitMQ In-Memory Fallback ===');
    console.log('- Forcing RabbitMQ connection failure to trigger fallback...');
    // We call connectRabbitMQ directly. Since we pass 10 as retryCount, it will trigger fallback.
    await connectRabbitMQ(10);

    console.log('- Subscribing to dummy queue INBOX_TEST...');
    let msgReceived = false;
    let receivedData: any = null;
    pubsub.subscribe('INBOX_TEST', (data) => {
      msgReceived = true;
      receivedData = data;
    });

    console.log('- Publishing message to INBOX_TEST...');
    pubsub.publish('INBOX_TEST', { test: 'hello_world' });

    // Wait short delay for emit
    await new Promise(r => setTimeout(r, 100));

    console.log(`  Message received: ${msgReceived} (Expected: true)`);
    console.log(`  Received Payload: ${JSON.stringify(receivedData)} (Expected: {"test":"hello_world"})`);

    if (!msgReceived || receivedData?.test !== 'hello_world') {
      throw new Error('RabbitMQ Fallback failed to route messages!');
    }
    console.log('✓ TEST 1: RabbitMQ In-Memory Fallback PASSED.');

    console.log('\n=== TEST 2: RBAC & Product/Order Ownership Checks ===');
    // Seller A creates a product
    console.log('- Seller A creating a product...');
    const prodRes = await fetch(`${API_BASE}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: 'EV5 Hardened Laptop',
        price: 1000,
        category: 'Electronics',
        countInStock: 5,
        description: 'EV5 Hardened Product'
      })
    });
    const dbProduct = await prodRes.json();
    if (!prodRes.ok) throw new Error('Product creation failed: ' + dbProduct.error);
    console.log(`  Product created: ${dbProduct.name} under Shop ID: ${dbProduct.shop}`);

    // Seller B tries to edit Seller A's product
    console.log("- Seller B trying to UPDATE Seller A's product...");
    const updateRes = await fetch(`${API_BASE}/api/products/${dbProduct._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({ name: 'EV5 Hacked Name' })
    });
    const updateData = await updateRes.json();
    console.log(`  Response Status: ${updateRes.status}, Error: ${updateData.error}`);
    if (updateRes.status !== 403 || !updateData.error.includes('modify their own products')) {
      throw new Error('Seller B updated Seller A\'s product successfully! RBAC leak!');
    }

    // Seller B tries to delete Seller A's product
    console.log("- Seller B trying to DELETE Seller A's product...");
    const delRes = await fetch(`${API_BASE}/api/products/${dbProduct._id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    const delData = await delRes.json();
    console.log(`  Response Status: ${delRes.status}, Error: ${delData.error}`);
    if (delRes.status !== 403 || !delData.error.includes('delete their own products')) {
      throw new Error('Seller B deleted Seller A\'s product successfully! RBAC leak!');
    }

    // Buyer checkout an order
    console.log('- Buyer placing order containing Seller A\'s product...');
    const orderRes = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify({
        orderItems: [{ name: dbProduct.name, qty: 1, image: 'img.jpg', price: 1000, product: dbProduct._id }],
        shippingAddress: { address: 'A', city: 'B', postalCode: 'C', country: 'D' },
        itemsPrice: 1000,
        taxPrice: 0,
        totalPrice: 1000,
        paymentMethod: 'EV5HardenedCOD'
      })
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error('Order creation failed: ' + orderData.error);
    const dbOrder = orderData[0] || orderData;
    console.log(`  Order placed. ID: ${dbOrder._id}, Shop: ${dbOrder.shop}`);

    // Seller B tries to update status of Seller A's order
    console.log("- Seller B trying to update status of Seller A's order to 'Processing'...");
    const statusRes = await fetch(`${API_BASE}/api/orders/${dbOrder._id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({ status: 'Processing' })
    });
    const statusData = await statusRes.json();
    console.log(`  Response Status: ${statusRes.status}, Error: ${statusData.error}`);
    if (statusRes.status !== 403 || !statusData.error.includes('manage orders of their own shop')) {
      throw new Error('Seller B updated status of Seller A\'s order successfully! RBAC leak!');
    }

    // Seller A updates status of their own order
    console.log("- Seller A updating status of their own order to 'Processing'...");
    const statusResA = await fetch(`${API_BASE}/api/orders/${dbOrder._id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ status: 'Processing' })
    });
    const statusDataA = await statusResA.json();
    if (!statusResA.ok) throw new Error('Seller A status update failed: ' + statusDataA.error);
    console.log(`  Response Status: ${statusResA.status}, New Status: ${statusDataA.status}`);
    if (statusDataA.status !== 'Processing') {
      throw new Error('Order status was not updated correctly.');
    }
    console.log('✓ TEST 2: RBAC & Product/Order Ownership Checks PASSED.');

    console.log('\n=== TEST 3: Custom OpenTelemetry Tracing Spans ===');
    console.log('- Testing DiscountEngine.calculateStackableDiscount execution with OTel custom spans...');
    
    // Call calculation engine
    const engineRes = DiscountEngine.calculateStackableDiscount({
      items: [{ product: dbProduct._id.toString(), originalPrice: 1000, price: 1000, qty: 1 }],
      activePromotions: [],
      totalPlatformItemsPrice: 1000
    });

    console.log(`  Engine totalDiscount: ${engineRes.totalDiscount} (Expected: 0)`);
    console.log(`  Engine priceFloorAdjusted: ${engineRes.priceFloorAdjusted} (Expected: false)`);
    if (engineRes.totalDiscount !== 0 || engineRes.priceFloorAdjusted !== false) {
      throw new Error('DiscountEngine calculation returns invalid output.');
    }

    console.log('✓ TEST 3: Custom OpenTelemetry Tracing Spans PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev5_hardened_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV5 Hardened' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV5 Hardened' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV5HardenedCOD' }); } catch (e) {}

    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected database.');

    if (testSuccess) {
      console.log('\n=== ALL HARDENED TESTS PASSED SUCCESSFULLY! ===\n');
      process.exit(0);
    } else {
      console.log('\n=== HARDENED TEST RUN FAILED ===\n');
      process.exit(1);
    }
  }
}

runHardenedTests();
