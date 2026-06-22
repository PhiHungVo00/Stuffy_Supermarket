import mongoose from 'mongoose';
import { io as ClientIO } from 'socket.io-client';
import Order from './models/Order';
import Shop from './models/Shop';
import User from './models/User';
import Voucher from './models/Voucher';
import SellerWallet from './models/SellerWallet';
import Product from './models/Product';

const API_BASE = 'http://localhost:5000';

async function runTests() {
  console.log('=== STARTING MULTI-SELLER EVOLUTION PHASE 5 INTEGRATION TESTS ===');
  let testSuccess = true;
  let socket: any = null;

  try {
    // 1. Connect to DB
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // 2. Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev5_test_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV5 Test' } });
    await mongoose.connection.db?.collection('vouchers').deleteMany({ code: { $regex: 'EV5_' } });
    await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV5TestCOD' });
    await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV5 Test' } });

    const timestamp = Date.now();
    const sellerEmail = `ev5_test_seller_${timestamp}@test.com`;
    const buyerEmail = `ev5_test_buyer_${timestamp}@test.com`;

    // 3. Register Seller and Buyer via API
    console.log('- Registering Seller via API...');
    const sellerRegRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'EV5 Test Seller',
        email: sellerEmail,
        password: 'password123',
        role: 'seller'
      })
    });
    const sellerRegData = await sellerRegRes.json();
    if (!sellerRegRes.ok) throw new Error('Seller registration failed: ' + sellerRegData.error);
    const sellerToken = sellerRegData.token;

    console.log('- Registering Buyer via API...');
    const buyerRegRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'EV5 Test Buyer',
        email: buyerEmail,
        password: 'password123'
      })
    });
    const buyerRegData = await buyerRegRes.json();
    if (!buyerRegRes.ok) throw new Error('Buyer registration failed: ' + buyerRegData.error);
    const buyerToken = buyerRegData.token;

    const dbSeller = await User.findOne({ email: sellerEmail });
    const dbBuyer = await User.findOne({ email: buyerEmail });
    const dbShop = await Shop.findOne({ owner: dbSeller?._id });
    if (!dbShop) throw new Error('Shop was not created automatically for the seller!');

    // Initialize wallet with balance for withdrawal test
    let wallet = await SellerWallet.findOne({ shopId: dbShop._id });
    if (!wallet) {
      wallet = new SellerWallet({
        shopId: dbShop._id,
        balance: 500,
        pendingEscrow: 0,
        currency: 'USD',
        transactions: []
      });
    } else {
      wallet.balance = 500;
    }
    await wallet.save();

    // Create a real product for checkout validation
    const testProduct = new Product({
      name: 'EV5 Test Product',
      price: 50,
      image: '/images/test.jpg',
      category: 'Electronics',
      countInStock: 10,
      shop: dbShop._id,
      tenantId: 'default_store',
      description: 'EV5 Test Product Description'
    });
    await testProduct.save();

    console.log('\n=== TEST 1: Bank Payout Simulation ===');
    console.log('- Requesting withdrawal of $200...');
    const withdrawRes = await fetch(`${API_BASE}/api/shops/mine/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sellerToken}`
      },
      body: JSON.stringify({
        amount: 200,
        bankName: 'Vietcombank',
        accountNumber: '1234567890',
        recipientName: 'Nguyen Van A'
      })
    });
    const withdrawData = await withdrawRes.json();
    if (!withdrawRes.ok) {
      throw new Error('Withdrawal request failed: ' + withdrawData.error);
    }

    console.log(`  Message: ${withdrawData.message}`);
    console.log(`  Updated Balance: ${withdrawData.wallet.balance} (Expected: 300)`);
    const lastTx = withdrawData.wallet.transactions[withdrawData.wallet.transactions.length - 1];
    console.log(`  Transaction Amount: ${lastTx.amount} (Expected: -200)`);
    console.log(`  Transaction Status: ${lastTx.status} (Expected: success)`);
    console.log(`  Transaction ReferenceId: ${lastTx.referenceId} (Expected: starting with STUFFY_WD_)`);
    console.log(`  Transaction BankName: ${lastTx.bankName} (Expected: Vietcombank)`);

    if (withdrawData.wallet.balance !== 300 || lastTx.amount !== -200 || lastTx.status !== 'success' || !lastTx.referenceId.startsWith('STUFFY_WD_')) {
      throw new Error('Withdrawal details were not processed correctly.');
    }
    console.log('✓ TEST 1: Bank Payout Simulation PASSED.');

    console.log('\n=== TEST 2: Livestream-exclusive Voucher Validation ===');
    // Create a livestream exclusive voucher in DB
    const voucherCode = `EV5_LIVE_${timestamp}`;
    const liveVoucher = new Voucher({
      code: voucherCode,
      type: 'discount',
      discountType: 'fixed',
      discountValue: 15,
      description: 'Livestream exclusive voucher',
      minOrderValue: 20,
      usageLimit: 10,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      scope: 'platform',
      isLivestreamExclusive: true,
      tenantId: 'default_store',
      claimedBy: [dbBuyer?._id]
    });
    await liveVoucher.save();

    // Try applying voucher without fromLivestream
    console.log('- Applying livestream voucher WITHOUT fromLivestream flag...');
    const applyFailRes = await fetch(`${API_BASE}/api/vouchers/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({
        code: voucherCode,
        orderTotal: 50,
        items: []
      })
    });
    const applyFailData = await applyFailRes.json();
    console.log(`  Status: ${applyFailRes.status}, Error: ${applyFailData.error}`);
    if (applyFailRes.status !== 400 || !applyFailData.error.includes('only valid for purchases from livestream')) {
      throw new Error('Voucher was applied without fromLivestream flag unexpectedly!');
    }

    // Apply voucher with fromLivestream
    console.log('- Applying livestream voucher WITH fromLivestream: true...');
    const applySuccessRes = await fetch(`${API_BASE}/api/vouchers/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({
        code: voucherCode,
        orderTotal: 50,
        items: [],
        fromLivestream: true
      })
    });
    const applySuccessData = await applySuccessRes.json();
    if (!applySuccessRes.ok) {
      throw new Error('Voucher application failed with fromLivestream: true: ' + applySuccessData.error);
    }
    console.log(`  Applied discount: ${applySuccessData.discountAmount} (Expected: 15)`);
    if (applySuccessData.discountAmount !== 15) {
      throw new Error('Incorrect voucher discount amount.');
    }

    // Try checkout order using this voucher without fromLivestream
    console.log('- Checking out order using livestream voucher WITHOUT fromLivestream flag...');
    const orderFailRes = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({
        orderItems: [{ name: 'Item', qty: 1, image: 'img.jpg', price: 50, product: testProduct._id }],
        shippingAddress: { address: 'A', city: 'B', postalCode: 'C', country: 'D' },
        itemsPrice: 50,
        taxPrice: 0,
        totalPrice: 45,
        paymentMethod: 'EV5TestCOD',
        voucherCode: voucherCode
      })
    });
    const orderFailData = await orderFailRes.json();
    console.log(`  Status: ${orderFailRes.status}, Error: ${orderFailData.error}`);
    if (orderFailRes.status !== 400 || !orderFailData.error.includes('only valid for purchases from livestream')) {
      throw new Error('Order was placed without fromLivestream flag using exclusive voucher!');
    }

    // Checkout order with fromLivestream: true
    console.log('- Checking out order using livestream voucher WITH fromLivestream: true...');
    const orderSuccessRes = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({
        orderItems: [{ name: 'Item', qty: 1, image: 'img.jpg', price: 50, product: testProduct._id }],
        shippingAddress: { address: 'A', city: 'B', postalCode: 'C', country: 'D' },
        itemsPrice: 50,
        taxPrice: 0,
        totalPrice: 45,
        paymentMethod: 'EV5TestCOD',
        voucherCode: voucherCode,
        fromLivestream: true
      })
    });
    const orderSuccessData = await orderSuccessRes.json();
    if (!orderSuccessRes.ok) {
      throw new Error('Order creation failed with exclusive voucher: ' + orderSuccessData.error);
    }
    console.log(`  Created Order IDs count: ${orderSuccessData.length || 1}`);
    console.log('✓ TEST 2: Livestream-exclusive Voucher Validation PASSED.');

    console.log('\n=== TEST 3: AI Analytics Forecast API ===');
    console.log('- Querying forecast API...');
    const forecastRes = await fetch(`${API_BASE}/api/analytics/forecast`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sellerToken}`
      }
    });
    const forecastData = await forecastRes.json();
    if (!forecastRes.ok) {
      throw new Error('Forecast API request failed: ' + forecastData.error);
    }
    console.log(`  Historical points count: ${forecastData.historical.length} (Expected: 30)`);
    console.log(`  Forecast points count: ${forecastData.forecast.length} (Expected: 7)`);
    console.log(`  Regression parameters: slope = ${forecastData.slope}, intercept = ${forecastData.intercept}`);
    if (forecastData.historical.length !== 30 || forecastData.forecast.length !== 7 || forecastData.slope === undefined) {
      throw new Error('AI forecast response format is invalid.');
    }
    console.log('✓ TEST 3: AI Analytics Forecast API PASSED.');

    console.log('\n=== TEST 4: Shop AI Chatbot Auto-Responder ===');
    // Enable AI chatbot for the shop
    console.log('- Configuring Shop Chatbot details...');
    const chatbotConfigRes = await fetch(`${API_BASE}/api/shops/mine/chatbot`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sellerToken}`
      },
      body: JSON.stringify({
        aiChatbotEnabled: true,
        aiChatbotPrompt: 'Bạn là chuyên viên tư vấn bán hàng của shop Stuffy EV5 Test.'
      })
    });
    const chatbotConfig = await chatbotConfigRes.json();
    if (!chatbotConfigRes.ok) throw new Error('Chatbot configuration failed: ' + chatbotConfig.error);
    console.log(`  aiChatbotEnabled status: ${chatbotConfig.aiChatbotEnabled} (Expected: true)`);

    // Connect buyer via socket.io client
    console.log('- Connecting client socket...');
    socket = ClientIO(API_BASE, { transports: ['websocket'] });
    
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        console.log('  Socket connected successfully.');
        socket.emit('JOIN_USER_ROOM', dbBuyer?._id.toString());
        resolve();
      });
      socket.on('connect_error', (err: any) => reject(new Error('Socket connection failed: ' + err.message)));
    });

    // Send chat message to seller and listen for AI auto-response
    console.log('- Sending message to Shop via Socket.io...');
    
    const responsePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for AI response')), 8000);
      
      socket.on('RECEIVE_MESSAGE', (msg: any) => {
        // AI responses are sent from the seller (shop owner) to the buyer
        if (msg.sender.toString() === dbSeller?._id.toString()) {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    socket.emit('SEND_MESSAGE', {
      senderId: dbBuyer?._id.toString(),
      recipientId: dbSeller?._id.toString(),
      message: 'Xin chào, cửa hàng bạn có những sản phẩm nào nổi bật vậy?',
      shopId: dbShop._id.toString()
    });

    console.log('  Waiting for Gemini AI auto-response (simulating thinking)...');
    const aiMsg = await responsePromise;
    console.log(`  AI Chatbot reply received: "${aiMsg.message}"`);
    if (!aiMsg.message || aiMsg.message.length === 0) {
      throw new Error('AI response is empty.');
    }
    console.log('✓ TEST 4: Shop AI Chatbot Auto-Responder PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev5_test_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV5 Test' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('vouchers').deleteMany({ code: { $regex: 'EV5_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV5TestCOD' }); } catch (e) {}
    try { await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV5 Test' } }); } catch (e) {}

    if (socket) {
      socket.disconnect();
      console.log('[Cleanup] Disconnected socket.');
    }
    
    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected database.');

    if (testSuccess) {
      console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
      process.exit(0);
    } else {
      console.log('\n=== TEST RUN FAILED ===\n');
      process.exit(1);
    }
  }
}

runTests();
