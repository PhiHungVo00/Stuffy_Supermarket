const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const API_BASE = 'http://localhost:5000';

async function runShopeeEvolutionV2Tests() {
  console.log('=== STUFFY SUPERMARKET SHOPEE EVOLUTION PHASE 2 E2E TESTS ===');
  
  let socketBuyer, socketSeller;
  
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stuffy_db');
    
    // Cleanup
    try { await mongoose.connection.db.collection('users').deleteMany({ email: { $regex: 'shopee_ev2_' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('shops').deleteMany({ name: { $regex: 'ShopeeEv2' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('products').deleteMany({ name: { $regex: 'ShopeeEv2' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('orders').deleteMany({ paymentMethod: 'ShopeeEv2Test' }); } catch (e) {}
    try { await mongoose.connection.db.collection('promotions').deleteMany({ name: { $regex: 'ShopeeEv2' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('outboxes').deleteMany({}); } catch (e) {}

    const ts = Date.now();
    let passed = 0, failed = 0;

    async function api(method, path, body = null, token = null) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const config = { method, headers };
      if (body) config.body = JSON.stringify(body);
      const res = await fetch(`${API_BASE}${path}`, config);
      const data = await res.json();
      if (!res.ok) throw { status: res.status, error: data.error || data.message || 'API Error' };
      return data;
    }

    function ok(cond, label) {
      if (cond) { console.log(`  ✅ ${label}`); passed++; }
      else { console.log(`  ❌ FAIL: ${label}`); failed++; }
    }

    // 1. Admin login
    console.log('\n[1] Admin login');
    const admin = await api('POST', '/api/auth/login', { email: 'admin@stuffy.com', password: 'adminpassword' });
    ok(!!admin.token, 'Admin logged in');

    // 2. Register seller
    console.log('\n[2] Register seller');
    const seller = await api('POST', '/api/auth/register', {
      name: 'ShopeeEv2 Seller', email: `shopee_ev2_seller_${ts}@test.com`, password: 'password123', role: 'seller'
    });
    ok(seller.role === 'seller', 'Seller role=seller');
    const shops = await api('GET', '/api/shops');
    const shop = shops.find(s => s.name === "ShopeeEv2 Seller's Shop");
    ok(!!shop, `Shop auto-created: ${shop?._id}`);

    // Verify wallet lazy creation
    const wallet0 = await api('GET', '/api/shops/mine/wallet', null, seller.token);
    ok(wallet0.balance === 0 && wallet0.pendingEscrow === 0, 'Wallet initialized 0/0');

    // 3. Register buyer
    console.log('\n[3] Register buyer');
    const buyer = await api('POST', '/api/auth/register', {
      name: 'ShopeeEv2 Buyer', email: `shopee_ev2_buyer_${ts}@test.com`, password: 'password123'
    });
    ok(!!buyer.token, 'Buyer registered');

    // Verify email verification token and execution
    const buyerDb = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
    ok(!!buyerDb.emailVerificationToken, 'Verification token generated');
    ok(buyerDb.isEmailVerified === false, 'isEmailVerified starts as false');

    const verifyRes = await fetch(`${API_BASE}/api/auth/verify/${buyerDb.emailVerificationToken}`);
    ok(verifyRes.status === 200, 'Verification endpoint returns 200');
    const verifyHtml = await verifyRes.text();
    ok(verifyHtml.includes('Email Verified!'), 'Verification response contains success UI text');

    const buyerDbAfter = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
    ok(buyerDbAfter.isEmailVerified === true, 'isEmailVerified is now true');
    ok(!buyerDbAfter.emailVerificationToken, 'Verification token cleared after verification');

    // 4. Create products
    console.log('\n[4] Create products');
    const mainProd = await api('POST', '/api/products', {
      name: 'ShopeeEv2 Main', price: 100, category: 'Electronics', countInStock: 20, shop: shop._id
    }, seller.token);
    const accProd = await api('POST', '/api/products', {
      name: 'ShopeeEv2 Accessory', price: 30, category: 'Accessories', countInStock: 20, shop: shop._id
    }, seller.token);
    ok(!!mainProd._id && !!accProd._id, `Products created: ${mainProd._id}, ${accProd._id}`);

    // Verify Outbox records are generated for Transactional Outbox pattern
    const outboxRecords = await mongoose.connection.db.collection('outboxes').find({
      aggregateId: mainProd._id.toString()
    }).toArray();
    ok(outboxRecords.length === 2, 'Two Outbox records generated for main product (INVENTORY_SYNC & EMAIL_NOTIFICATIONS)');

    // 5. Bundle Deal
    console.log('\n[5] Bundle Deal (buy 2 get 10% off)');
    await api('POST', '/api/promotions', {
      name: 'ShopeeEv2 Bundle', type: 'bundle_deal', minQuantity: 2, discountType: 'percentage', discountValue: 10,
      startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() + 86400000)
    }, seller.token);
    const promos = await api('GET', `/api/promotions/active/${shop._id}`);
    ok(promos.length >= 1, `Active promos: ${promos.length}`);

    const bundleOrder = await api('POST', '/api/orders', {
      orderItems: [{ product: mainProd._id, name: mainProd.name, qty: 2, price: mainProd.price, image: 'test.jpg' }],
      shippingAddress: { address: 'Q2', city: 'HCMC', postalCode: '70000', country: 'Vietnam' },
      paymentMethod: 'ShopeeEv2Test', selectedCarriers: { [shop._id]: 'ghn' }
    }, buyer.token);
    console.log(`  itemsPrice=${bundleOrder.itemsPrice}, totalPrice=${bundleOrder.totalPrice}`);
    // itemsPrice = raw (200). Bundle discount only in totalPrice.
    ok(bundleOrder.itemsPrice === 200, 'itemsPrice=200 (raw)');
    const rawNoDiscount = 200 + (bundleOrder.shippingFee || 0) + (bundleOrder.taxPrice || 0);
    ok(bundleOrder.totalPrice < rawNoDiscount, `totalPrice(${bundleOrder.totalPrice}) < raw(${rawNoDiscount}) — discount applied`);

    // Verify escrow held
    const w1 = await api('GET', '/api/shops/mine/wallet', null, seller.token);
    ok(w1.pendingEscrow > 0, `Escrow held: ${w1.pendingEscrow}`);

    // 6. Add-On Deal
    console.log('\n[6] Add-On Deal (accessory $30->$5)');
    await api('POST', '/api/promotions', {
      name: 'ShopeeEv2 Addon', type: 'addon_deal', primaryProductId: mainProd._id,
      addonProducts: [{ product: accProd._id, addonPrice: 5 }],
      startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() + 86400000)
    }, seller.token);

    const addonOrder = await api('POST', '/api/orders', {
      orderItems: [
        { product: mainProd._id, name: mainProd.name, qty: 1, price: mainProd.price, image: 'test.jpg' },
        { product: accProd._id, name: accProd.name, qty: 1, price: accProd.price, image: 'test.jpg' }
      ],
      shippingAddress: { address: 'Q2', city: 'HCMC', postalCode: '70000', country: 'Vietnam' },
      paymentMethod: 'ShopeeEv2Test', selectedCarriers: { [shop._id]: 'ghn' }
    }, buyer.token);
    console.log(`  itemsPrice=${addonOrder.itemsPrice}`);
    ok(addonOrder.itemsPrice === 105, `itemsPrice=105 (100+5 addon)`);

    // 6b. Flash Sale Campaign
    console.log('\n[6b] Flash Sale Campaign (product 20% off)');
    const flashSale = await api('POST', '/api/promotions', {
      name: 'ShopeeEv2 Flash Sale', type: 'flash_sale', primaryProductId: mainProd._id,
      discountType: 'percentage', discountValue: 20,
      startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() + 86400000)
    }, seller.token);
    ok(!!flashSale._id, 'Flash sale promo created');

    const flashOrder = await api('POST', '/api/orders', {
      orderItems: [{ product: mainProd._id, name: mainProd.name, qty: 1, price: mainProd.price, image: 'test.jpg' }],
      shippingAddress: { address: 'Q2', city: 'HCMC', postalCode: '70000', country: 'Vietnam' },
      paymentMethod: 'ShopeeEv2Test', selectedCarriers: { [shop._id]: 'ghn' }
    }, buyer.token);
    console.log(`  itemsPrice=${flashOrder.itemsPrice}`);
    ok(flashOrder.itemsPrice === 80, `itemsPrice=80 (100 - 20%)`);

    // 7. Logistics + Escrow Release
    console.log('\n[7] Logistics fulfillment + escrow release');
    const ship1 = await api('POST', '/api/shipping/fulfill', { orderId: bundleOrder._id }, seller.token);
    ok(ship1.order.status === 'Processing', 'Status -> Processing');
    ok(!!ship1.order.trackingNumber, `Tracking: ${ship1.order.trackingNumber}`);

    const wh1 = await api('POST', '/api/shipping/webhook', {
      trackingNumber: ship1.order.trackingNumber, carrierStatus: 'PICKED_UP', location: 'Post Office'
    });
    ok(wh1.order.status === 'Shipped', 'PICKED_UP -> Shipped');

    const wh2 = await api('POST', '/api/shipping/webhook', {
      trackingNumber: ship1.order.trackingNumber, carrierStatus: 'IN_TRANSIT', location: 'Sorting Hub'
    });
    ok(wh2.order.shippingHistory.length >= 3, `History entries: ${wh2.order.shippingHistory.length}`);

    const wh3 = await api('POST', '/api/shipping/webhook', {
      trackingNumber: ship1.order.trackingNumber, carrierStatus: 'DELIVERED', location: 'Front Door'
    });
    ok(wh3.order.status === 'Delivered', 'DELIVERED webhook -> Delivered');
    ok(wh3.order.isPaid === true, 'isPaid=true');

    const recv = await api('PUT', `/api/orders/${bundleOrder._id}/receive`, {}, buyer.token);
    ok(recv.order.escrowStatus === 'released', 'Escrow -> released');

    const w2 = await api('GET', '/api/shops/mine/wallet', null, seller.token);
    ok(w2.balance > 0, `Seller balance: ${w2.balance}`);

    // 8. Dispute / Refund
    console.log('\n[8] Dispute / Refund');
    const ship2 = await api('POST', '/api/shipping/fulfill', { orderId: addonOrder._id }, seller.token);
    await api('POST', '/api/shipping/webhook', {
      trackingNumber: ship2.order.trackingNumber, carrierStatus: 'DELIVERED', location: 'Door'
    });
    const dispute = await api('POST', `/api/orders/${addonOrder._id}/refund-request`, { reason: 'Broken' }, buyer.token);
    ok(dispute.order.escrowStatus === 'disputed', 'Escrow -> disputed');
    ok(dispute.order.returnRequestReason === 'Broken', 'Reason saved');

    // Test dispute rejection by seller
    const respReject = await api('PUT', `/api/orders/${addonOrder._id}/dispute/respond`, { action: 'reject' }, seller.token);
    ok(respReject.order.escrowStatus === 'dispute_rejected', 'Seller rejected dispute -> dispute_rejected');

    // Test dispute resolution by admin (refund buyer)
    const respResolve = await api('PUT', `/api/orders/${addonOrder._id}/dispute/resolve`, { decision: 'refund_buyer' }, admin.token);
    ok(respResolve.order.escrowStatus === 'refunded', 'Admin resolved dispute -> refunded');
    ok(respResolve.order.status === 'Canceled', 'Order status -> Canceled');

    // 9. Shipping Label
    console.log('\n[9] Shipping label');
    const labelRes = await fetch(`${API_BASE}/api/shipping/label/${bundleOrder._id}`);
    const labelHtml = await labelRes.text();
    ok(labelRes.status === 200, 'Label endpoint 200');
    ok(labelHtml.includes('STUFFY SHIP'), 'Label has STUFFY SHIP');

    // 10. Virtual Gifting
    console.log('\n[10] Virtual gifting via Socket.IO');
    await mongoose.connection.db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(buyer._id) }, { $set: { coinsBalance: 100 } }
    );
    await mongoose.connection.db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(seller._id) }, { $set: { coinsBalance: 0 } }
    );

    socketBuyer = io(API_BASE);
    socketSeller = io(API_BASE);
    await Promise.all([
      new Promise(r => socketBuyer.on('connect', r)),
      new Promise(r => socketSeller.on('connect', r))
    ]);

    socketBuyer.emit('JOIN_LIVE_STREAM', shop._id.toString());
    socketSeller.emit('JOIN_LIVE_STREAM', shop._id.toString());
    await new Promise(r => setTimeout(r, 500));

    const giftP = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timeout GIFT_RECEIVED')), 8000);
      socketSeller.on('GIFT_RECEIVED', d => { clearTimeout(t); resolve(d); });
    });

    socketBuyer.emit('SEND_VIRTUAL_GIFT', {
      shopId: shop._id.toString(), giftType: 'Rocket', senderId: buyer._id
    });

    const gift = await giftP;
    ok(gift.giftType === 'Rocket', 'Gift type = Rocket');
    ok(gift.userName === 'ShopeeEv2 Buyer', `Sender userName: ${gift.userName}`);

    const bDb = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
    const sDb = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(seller._id) });
    ok(bDb.coinsBalance === 50, `Buyer coins: ${bDb.coinsBalance} (100-50)`);
    ok(sDb.coinsBalance === 45, `Seller coins: ${sDb.coinsBalance} (50*0.9)`);

    const spendTx = await mongoose.connection.db.collection('cointransactions').findOne({
      user: new mongoose.Types.ObjectId(buyer._id), type: 'spend'
    });
    const earnTx = await mongoose.connection.db.collection('cointransactions').findOne({
      user: new mongoose.Types.ObjectId(seller._id), type: 'earn'
    });
    ok(spendTx && spendTx.amount === -50, `Spend ledger: ${spendTx?.amount}`);
    ok(earnTx && earnTx.amount === 45, `Earn ledger: ${earnTx?.amount}`);

    // Results
    console.log('\n' + '='.repeat(50));
    console.log(`  ${passed} passed, ${failed} failed / ${passed + failed} total`);
    console.log('='.repeat(50));
    if (failed > 0) console.log('\n❌ SOME TESTS FAILED');
    else console.log('\n✅ ALL TESTS PASSED');

    socketBuyer.disconnect(); socketSeller.disconnect();
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n=== CRASH ===');
    console.error(error);
    if (socketBuyer) socketBuyer.disconnect();
    if (socketSeller) socketSeller.disconnect();
    try { await mongoose.disconnect(); } catch(e) {}
    process.exit(1);
  }
}

runShopeeEvolutionV2Tests();
