/// <reference path="./declarations.d.ts" />
import mongoose from 'mongoose';
import User from './models/User';
import Shop from './models/Shop';
import Product from './models/Product';
import Order from './models/Order';
import ChatMessage from './models/ChatMessage';

const API_BASE = 'http://127.0.0.1:5000';

async function runShopeeParityV7Tests() {
  console.log('=== STARTING SHOPEE PARITY INTEGRATION TESTS (V7) ===');
  let testSuccess = true;

  try {
    // 1. Connect to DB
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev7_shopee_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV7' } });
    await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV7 Product' } });
    await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV7ShopeeTest' });
    await mongoose.connection.db?.collection('chatmessages').deleteMany({});

    const timestamp = Date.now();
    const sellerEmail = `ev7_shopee_seller_${timestamp}@test.com`;
    const buyerEmail = `ev7_shopee_buyer_${timestamp}@test.com`;

    // 2. Register Seller and Buyer
    console.log('- Registering Seller via API...');
    const regResA = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV7 Seller', email: sellerEmail, password: 'password123', role: 'seller' })
    });
    const regDataA = await regResA.json();
    const tokenSeller = regDataA.token;

    console.log('- Registering Buyer via API...');
    const regResBuyer = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV7 Buyer', email: buyerEmail, password: 'password123' })
    });
    const regDataBuyer = await regResBuyer.json();
    const tokenBuyer = regDataBuyer.token;

    const dbSeller = await User.findOne({ email: sellerEmail });
    const dbBuyer = await User.findOne({ email: buyerEmail });
    const dbShop = await Shop.findOne({ owner: dbSeller?._id });

    if (!dbShop || !dbSeller || !dbBuyer) throw new Error('Setup failed: entities not found');

    // Create a product
    const prodRes = await fetch(`${API_BASE}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSeller}` },
      body: JSON.stringify({
        name: 'EV7 Product Test',
        price: 150,
        category: 'Electronics',
        countInStock: 10,
        weight: 300,
        description: 'Test product for parity v7'
      })
    });
    const dbProd = await prodRes.json();
    if (!prodRes.ok) throw new Error('Product creation failed: ' + dbProd.error);

    // Create an Order (GHN Webhook test target)
    const orderGhn = await Order.create({
      user: dbBuyer._id,
      shop: dbShop._id,
      orderItems: [{ name: dbProd.name, qty: 1, image: 'img.jpg', price: 150, product: dbProd._id }],
      shippingAddress: { address: 'District 1', city: 'HCMC', postalCode: '70000', country: 'Vietnam' },
      itemsPrice: 150,
      shippingFee: 10,
      totalPrice: 160,
      paymentMethod: 'EV7ShopeeTest',
      trackingNumber: 'GHN-TRACK-777',
      status: 'Pending'
    });

    // Create another Order (GHTK Webhook test target)
    const orderGhtk = await Order.create({
      user: dbBuyer._id,
      shop: dbShop._id,
      orderItems: [{ name: dbProd.name, qty: 1, image: 'img.jpg', price: 150, product: dbProd._id }],
      shippingAddress: { address: 'District 1', city: 'HCMC', postalCode: '70000', country: 'Vietnam' },
      itemsPrice: 150,
      shippingFee: 10,
      totalPrice: 160,
      paymentMethod: 'EV7ShopeeTest',
      trackingNumber: 'GHTK-TRACK-888',
      status: 'Pending'
    });

    // Create another Order (GHTK Cancel Webhook test target)
    const orderGhtkCancel = await Order.create({
      user: dbBuyer._id,
      shop: dbShop._id,
      orderItems: [{ name: dbProd.name, qty: 1, image: 'img.jpg', price: 150, product: dbProd._id }],
      shippingAddress: { address: 'District 1', city: 'HCMC', postalCode: '70000', country: 'Vietnam' },
      itemsPrice: 150,
      shippingFee: 10,
      totalPrice: 160,
      paymentMethod: 'EV7ShopeeTest',
      trackingNumber: 'GHTK-TRACK-999',
      status: 'Pending'
    });

    console.log('\n=== TEST 1: GHN Webhook Payload Parsing ===');
    console.log('- Sending GHN Webhook notification for tracking GHN-TRACK-777...');
    const ghnWebhookRes = await fetch(`${API_BASE}/api/shipping/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        OrderCode: 'GHN-TRACK-777',
        Status: 'delivered',
        Warehouse: 'HCMC Ward 3 Hub'
      })
    });
    const ghnWebhookData = await ghnWebhookRes.json();
    if (!ghnWebhookRes.ok) throw new Error('GHN Webhook failed: ' + ghnWebhookData.error);

    const updatedOrderGhn = await Order.findById(orderGhn._id);
    console.log(`  Order Status: ${updatedOrderGhn?.status} (Expected: Delivered)`);
    console.log(`  Logistics History Log:`, updatedOrderGhn?.shippingHistory?.[updatedOrderGhn.shippingHistory.length - 1]);

    if (updatedOrderGhn?.status !== 'Delivered') {
      throw new Error('GHN Webhook status was not mapped to Delivered!');
    }
    console.log('✓ TEST 1: GHN Webhook Payload Parsing PASSED.');

    console.log('\n=== TEST 2: GHTK Webhook Payload Parsing ===');
    console.log('- Sending GHTK Webhook notification for tracking GHTK-TRACK-888...');
    const ghtkWebhookRes = await fetch(`${API_BASE}/api/shipping/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label_id: 'GHTK-TRACK-888',
        status_id: 5,
        reason: 'Delivered to recipient successfully'
      })
    });
    const ghtkWebhookData = await ghtkWebhookRes.json();
    if (!ghtkWebhookRes.ok) throw new Error('GHTK Webhook failed: ' + ghtkWebhookData.error);

    const updatedOrderGhtk = await Order.findById(orderGhtk._id);
    console.log(`  Order Status: ${updatedOrderGhtk?.status} (Expected: Delivered)`);
    console.log(`  Logistics History Log:`, updatedOrderGhtk?.shippingHistory?.[updatedOrderGhtk.shippingHistory.length - 1]);

    if (updatedOrderGhtk?.status !== 'Delivered') {
      throw new Error('GHTK Webhook status was not mapped to Delivered!');
    }

    console.log('- Sending GHTK Cancel Webhook notification for tracking GHTK-TRACK-999...');
    const ghtkCancelRes = await fetch(`${API_BASE}/api/shipping/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label_id: 'GHTK-TRACK-999',
        status_id: 9,
        reason: 'Customer rejected package'
      })
    });
    if (!ghtkCancelRes.ok) throw new Error('GHTK Cancel Webhook failed');

    const updatedOrderGhtkCancel = await Order.findById(orderGhtkCancel._id);
    console.log(`  Order Status (Cancel): ${updatedOrderGhtkCancel?.status} (Expected: Canceled)`);
    if (updatedOrderGhtkCancel?.status !== 'Canceled') {
      throw new Error('GHTK Webhook cancel status was not mapped to Canceled!');
    }

    console.log('✓ TEST 2: GHTK Webhook Payload Parsing PASSED.');

    console.log('\n=== TEST 3: Chat with Product Attachment ===');
    console.log('- Direct mock ChatMessage with product attachment in database...');
    await ChatMessage.create({
      sender: dbBuyer._id,
      recipient: dbSeller._id,
      shop: dbShop._id,
      message: `[Thẻ sản phẩm] ${dbProd.name}`,
      attachmentType: 'product',
      attachedProduct: dbProd._id
    });

    console.log('- Querying chat history between Buyer and Seller via API...');
    const historyRes = await fetch(`${API_BASE}/api/chat/history/${dbSeller._id}`, {
      headers: { 'Authorization': `Bearer ${tokenBuyer}` }
    });
    const chatHistory = await historyRes.json();
    if (!historyRes.ok) throw new Error('Failed to fetch chat history: ' + chatHistory.error);

    const productMsg = chatHistory.find((m: any) => m.attachmentType === 'product');
    console.log('  Product attachment message found:', productMsg ? 'Yes' : 'No');
    console.log('  Populated product details:', productMsg?.attachedProduct);

    if (!productMsg || !productMsg.attachedProduct || productMsg.attachedProduct.name !== 'EV7 Product Test') {
      throw new Error('Product details were not populated correctly in chat history!');
    }
    console.log('✓ TEST 3: Chat with Product Attachment PASSED.');

    console.log('\n=== TEST 4: Chat with Order Attachment ===');
    console.log('- Direct mock ChatMessage with order attachment in database...');
    await ChatMessage.create({
      sender: dbBuyer._id,
      recipient: dbSeller._id,
      shop: dbShop._id,
      message: `[Thẻ đơn hàng] #${orderGhtk._id.toString().substring(0, 8)}`,
      attachmentType: 'order',
      attachedOrder: orderGhtk._id
    });

    console.log('- Querying chat history again via API...');
    const historyRes2 = await fetch(`${API_BASE}/api/chat/history/${dbSeller._id}`, {
      headers: { 'Authorization': `Bearer ${tokenBuyer}` }
    });
    const chatHistory2 = await historyRes2.json();
    if (!historyRes2.ok) throw new Error('Failed to fetch chat history 2');

    const orderMsg = chatHistory2.find((m: any) => m.attachmentType === 'order');
    console.log('  Order attachment message found:', orderMsg ? 'Yes' : 'No');
    console.log('  Populated order details:', orderMsg?.attachedOrder);

    if (!orderMsg || !orderMsg.attachedOrder || Number(orderMsg.attachedOrder.totalPrice) !== 160) {
      throw new Error('Order details were not populated correctly in chat history!');
    }
    console.log('✓ TEST 4: Chat with Order Attachment PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev7_shopee_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV7' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV7 Product' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV7ShopeeTest' }); } catch (e) {}
    try { await mongoose.connection.db?.collection('chatmessages').deleteMany({}); } catch (e) {}

    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected database.');

    if (testSuccess) {
      console.log('\n=== ALL SHOPEE PARITY INTEGRATION TESTS (V7) PASSED SUCCESSFULLY! ===\n');
      process.exit(0);
    } else {
      console.log('\n=== SHOPEE PARITY INTEGRATION TESTS (V7) FAILED ===\n');
      process.exit(1);
    }
  }
}

runShopeeParityV7Tests();
