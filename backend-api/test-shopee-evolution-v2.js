const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const API_BASE = 'http://localhost:5000';

async function runShopeeEvolutionV2Tests() {
  console.log('=== STARTING STUFFY SUPERMARKET SHOPEE EVOLUTION PHASE 2 E2E INTEGRATION TESTS ===');
  
  let socketBuyer, socketSeller;
  
  try {
    console.log('Connecting to database...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    
    // Clean up test collections
    try { await mongoose.connection.db.collection('users').deleteMany({ email: { $regex: 'shopee_ev_' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('shops').deleteMany({ name: { $regex: 'Shopee Ev' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('products').deleteMany({ name: { $regex: 'Shopee Ev' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('orders').deleteMany({ paymentMethod: 'ShopeeEvTest' }); } catch (e) {}
    try { await mongoose.connection.db.collection('promotions').deleteMany({}); } catch (e) {}
    try { await mongoose.connection.db.collection('sellerwallets').deleteMany({}); } catch (e) {}
    try { await mongoose.connection.db.collection('cointransactions').deleteMany({}); } catch (e) {}

    const timestamp = Date.now();

    // Helper for API calls
    async function apiCall(method, path, body = null, token = null) {
      const url = `${API_BASE}${path}`;
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const config = { method, headers };
      if (body) {
        config.body = JSON.stringify(body);
      }
      
      const res = await fetch(url, config);
      const data = await res.json();
      if (!res.ok) {
        throw { status: res.status, error: data.error || data.message || 'API Error' };
      }
      return data;
    }

    // 1. Setup Admin
    console.log('\n[Step 1] Logging in Admin...');
    const admin = await apiCall('POST', '/api/auth/login', {
      email: 'admin@stuffy.com',
      password: 'adminpassword',
    });
    console.log('Admin logged in.');

    // 2. Register Seller (verifying SellerWallet auto-creation)
    console.log('\n[Step 2] Registering Seller (should trigger SellerWallet creation)...');
    const sellerEmail = `shopee_ev_seller_${timestamp}@test.com`;
    const seller = await apiCall('POST', '/api/auth/register', {
      name: 'Shopee Ev Seller',
      email: sellerEmail,
      password: 'password123',
      role: 'seller'
    });
    console.log('Seller registered.');

    const shops = await apiCall('GET', '/api/shops');
    const shop = shops.find(s => s.name === "Shopee Ev Seller's Shop");
    if (!shop) throw new Error('Seller shop was not created automatically.');
    console.log(`Auto-created Shop verified: ID=${shop._id}`);

    // Verify SellerWallet lazy-creation via the shop's mine/wallet route
    console.log('Fetching SellerWallet via API (which triggers lazy creation)...');
    const myWallet = await apiCall('GET', '/api/shops/mine/wallet', null, seller.token);
    console.log(`SellerWallet verified: Balance=${myWallet.balance}, PendingEscrow=${myWallet.pendingEscrow}`);

    // 3. Register Buyer
    console.log('\n[Step 3] Registering Buyer...');
    const buyerEmail = `shopee_ev_buyer_${timestamp}@test.com`;
    const buyer = await apiCall('POST', '/api/auth/register', {
      name: 'Shopee Ev Buyer',
      email: buyerEmail,
      password: 'password123',
    });
    console.log('Buyer registered.');

    // 4. Create primary product and accessory product for marketing deals
    console.log('\n[Step 4] Creating primary and accessory products for Promotions testing...');
    const mainProduct = await apiCall('POST', '/api/products', {
      name: 'Shopee Ev Main Product',
      price: 100,
      category: 'Electronics',
      countInStock: 20,
      shop: shop._id
    }, seller.token);
    
    const accessoryProduct = await apiCall('POST', '/api/products', {
      name: 'Shopee Ev Accessory Product',
      price: 30,
      category: 'Accessories',
      countInStock: 20,
      shop: shop._id
    }, seller.token);
    console.log(`Products created: Main ID=${mainProduct._id}, Accessory ID=${accessoryProduct._id}`);

    // 5. Test Bundle Deals: Buy 2 get 10% off
    console.log('\n[Step 5] Creating and verifying a Bundle Deal promotion...');
    const bundlePromo = await apiCall('POST', '/api/promotions', {
      name: 'Shopee Ev Bundle Deal',
      type: 'bundle_deal',
      minQuantity: 2,
      discountType: 'percentage',
      discountValue: 10,
      startsAt: new Date(Date.now() - 3600000), // 1 hour ago
      endsAt: new Date(Date.now() + 86400000) // 1 day future
    }, seller.token);
    console.log(`Bundle promotion created: ${bundlePromo.name}`);

    // Fetch active promotions
    const activePromos = await apiCall('GET', `/api/promotions/active/${shop._id}`);
    console.log(`Active promotions for shop: count=${activePromos.length}`);
    if (activePromos.length === 0) throw new Error('Expected active promotions list, got empty.');

    // Verify bundle discount checkout pricing calculations
    console.log('Testing checkout price calculation with Bundle Deal (Buy 2 Main Products)...');
    const orderItemsBundle = [
      { product: mainProduct._id, name: mainProduct.name, qty: 2, price: mainProduct.price, image: 'test.jpg' }
    ];
    // Calculate expected discount: (100 * 2) * 10% = 20. Total itemsPrice = 180.
    const checkoutBundle = await apiCall('POST', '/api/orders', {
      orderItems: orderItemsBundle,
      shippingAddress: { address: 'Quận 2', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
      paymentMethod: 'ShopeeEvTest',
      selectedCarriers: { [shop._id]: 'ghn' }
    }, buyer.token);

    console.log(`Checkout success. Split Order ID: ${checkoutBundle._id}, Subtotal: ${checkoutBundle.itemsPrice}, Total: ${checkoutBundle.totalPrice}`);
    if (checkoutBundle.itemsPrice !== 180) {
      throw new Error(`Bundle promotion pricing error. Expected itemsPrice=180, got ${checkoutBundle.itemsPrice}`);
    }

    // Verify Pending Escrow holds correct amount (order.totalPrice)
    const walletAfterBundleCheckout = await mongoose.connection.db.collection('sellerwallets').findOne({ shopId: new mongoose.Types.ObjectId(shop._id) });
    console.log(`Seller Wallet pendingEscrow after bundle checkout: ${walletAfterBundleCheckout.pendingEscrow} (Expected: ${checkoutBundle.totalPrice})`);
    if (Math.abs(walletAfterBundleCheckout.pendingEscrow - checkoutBundle.totalPrice) > 0.01) {
      throw new Error(`Escrow hold balance wrong. Expected ${checkoutBundle.totalPrice}, got ${walletAfterBundleCheckout.pendingEscrow}`);
    }

    // Clean up bundle deal from previous step so it doesn't conflict
    await mongoose.connection.db.collection('promotions').deleteMany({});

    // 6. Test Add-On Deals: Add accessory for $5 instead of $30 when buying primary product
    console.log('\n[Step 6] Creating and verifying an Add-On Deal promotion...');
    const addonPromo = await apiCall('POST', '/api/promotions', {
      name: 'Shopee Ev Addon Deal',
      type: 'addon_deal',
      primaryProductId: mainProduct._id,
      addonProducts: [{ product: accessoryProduct._id, addonPrice: 5 }],
      startsAt: new Date(Date.now() - 3600000),
      endsAt: new Date(Date.now() + 86400000)
    }, seller.token);
    console.log(`Addon promotion created: ${addonPromo.name}`);

    // Verify checkout with Add-On deal: 1 primary product ($100) + 1 accessory ($5 discount price)
    console.log('Testing checkout price calculation with Add-On Deal...');
    const checkoutAddon = await apiCall('POST', '/api/orders', {
      orderItems: [
        { product: mainProduct._id, name: mainProduct.name, qty: 1, price: mainProduct.price, image: 'test.jpg' },
        { product: accessoryProduct._id, name: accessoryProduct.name, qty: 1, price: accessoryProduct.price, image: 'test.jpg' }
      ],
      shippingAddress: { address: 'Quận 2', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
      paymentMethod: 'ShopeeEvTest',
      selectedCarriers: { [shop._id]: 'ghn' }
    }, buyer.token);

    console.log(`Checkout success. ItemsPrice: ${checkoutAddon.itemsPrice} (Expected: 105)`);
    if (checkoutAddon.itemsPrice !== 105) {
      throw new Error(`Add-on promotion pricing error. Expected itemsPrice=105, got ${checkoutAddon.itemsPrice}`);
    }

    // 7. Verify Escrow Release on confirm order receive
    console.log('\n[Step 7] Testing Escrow release payout to Seller Wallet...');
    
    // Fulfill order first (move from Pending to Processing)
    const arrangePickup = await apiCall('POST', '/api/shipping/fulfill', { orderId: checkoutBundle._id }, seller.token);
    console.log(`Order fulfilled: tracking=${arrangePickup.order.trackingNumber}, status=${arrangePickup.order.status}`);
    
    // Simulate logistics delivered webhook
    const deliveryWebhook = await apiCall('POST', '/api/shipping/webhook', {
      trackingNumber: arrangePickup.order.trackingNumber,
      carrierStatus: 'DELIVERED',
      location: 'Recipient Front Porch'
    });
    console.log(`Courier update webhook: status=${deliveryWebhook.order.status}, isPaid=${deliveryWebhook.order.isPaid}`);
    if (deliveryWebhook.order.status !== 'Delivered') throw new Error('Order status should update to Delivered on courier DELIVERED webhook.');

    // Buyer confirms order received
    const receiveConfirm = await apiCall('PUT', `/api/orders/${checkoutBundle._id}/receive`, {}, buyer.token);
    console.log(`Confirmed receive. escrowStatus=${receiveConfirm.order.escrowStatus}`);
    if (receiveConfirm.order.escrowStatus !== 'released') throw new Error('escrowStatus must transition to released.');

    // Check Seller Wallet balances
    const walletAfterRelease = await mongoose.connection.db.collection('sellerwallets').findOne({ shopId: new mongoose.Types.ObjectId(shop._id) });
    console.log(`Seller Wallet after release: Balance=${walletAfterRelease.balance}, PendingEscrow=${walletAfterRelease.pendingEscrow}`);
    // pendingEscrow should decrease (totalPrice of checkoutBundle deducted) and balance should increase by that totalPrice
    const expectedReleasedBalance = checkoutBundle.totalPrice;
    if (Math.abs(walletAfterRelease.balance - expectedReleasedBalance) > 0.01) {
      throw new Error(`Seller balance mismatch. Expected ${expectedReleasedBalance}, got ${walletAfterRelease.balance}`);
    }

    // 8. Verify Dispute Return / Refund holding
    console.log('\n[Step 8] Testing return/refund dispute holding...');
    
    // Fulfill addon order
    const arrangePickupAddon = await apiCall('POST', '/api/shipping/fulfill', { orderId: checkoutAddon._id }, seller.token);
    // Simulate deliver webhook
    await apiCall('POST', '/api/shipping/webhook', {
      trackingNumber: arrangePickupAddon.order.trackingNumber,
      carrierStatus: 'DELIVERED',
      location: 'Front Porch'
    });

    // Buyer files dispute return/refund request
    const disputeResponse = await apiCall('POST', `/api/orders/${checkoutAddon._id}/refund-request`, {
      reason: 'Broken main screen on arrival'
    }, buyer.token);
    console.log(`Dispute submitted: escrowStatus=${disputeResponse.order.escrowStatus}, reason=${disputeResponse.order.returnRequestReason}`);
    if (disputeResponse.order.escrowStatus !== 'disputed') throw new Error('escrowStatus must transition to disputed.');

    // Wallet pendingEscrow should remain unchanged (held)
    const walletAfterDispute = await mongoose.connection.db.collection('sellerwallets').findOne({ shopId: new mongoose.Types.ObjectId(shop._id) });
    console.log(`Seller Wallet pendingEscrow after dispute: ${walletAfterDispute.pendingEscrow}`);

    // 9. Verify live stream Socket.IO virtual gifting coin transaction
    console.log('\n[Step 9] Testing Live commerce virtual gifting transaction ledger balance swaps...');
    
    // Give buyer 100 Stuffy Coins directly in db to send a rocket gift (50 coins)
    await mongoose.connection.db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(buyer._id) },
      { $set: { coinsBalance: 100 } }
    );

    // Give seller 0 Stuffy Coins directly in db to test receive
    await mongoose.connection.db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(seller._id) },
      { $set: { coinsBalance: 0 } }
    );

    // Setup Socket.IO clients to emulate streaming room
    console.log('Connecting buyer & seller socket clients to server...');
    socketBuyer = io(API_BASE);
    socketSeller = io(API_BASE);

    await Promise.all([
      new Promise((resolve) => socketBuyer.on('connect', resolve)),
      new Promise((resolve) => socketSeller.on('connect', resolve))
    ]);

    // Join live stream room
    socketBuyer.emit('JOIN_LIVE_STREAM', shop._id.toString());
    socketSeller.emit('JOIN_LIVE_STREAM', shop._id.toString());
    await new Promise((resolve) => setTimeout(resolve, 500));

    const giftPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for GIFT_RECEIVED event')), 5000);
      socketSeller.on('GIFT_RECEIVED', (data) => {
        clearTimeout(timeout);
        console.log(`Socket broadcast GIFT_RECEIVED caught:`, data);
        resolve(data);
      });
    });

    // Buyer emits SEND_VIRTUAL_GIFT (Rocket = 50 coins)
    socketBuyer.emit('SEND_VIRTUAL_GIFT', {
      shopId: shop._id.toString(),
      giftType: 'Rocket',
      senderId: buyer._id.toString()
    });

    const receivedGift = await giftPromise;
    if (receivedGift.giftType !== 'Rocket' || (receivedGift.userName !== 'Shopee Ev Buyer' && receivedGift.senderName !== 'Shopee Ev Buyer')) {
      throw new Error('GIFT_RECEIVED broadcast contained incorrect data.');
    }

    // Verify buyer and seller coin balances in db
    const buyerDb = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
    const sellerDb = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(seller._id) });

    console.log(`Buyer coins after gift: ${buyerDb.coinsBalance} (Expected: 50)`);
    console.log(`Seller coins after gift: ${sellerDb.coinsBalance} (Expected: 45 - 90% of 50 after 10% platform fee)`);

    if (buyerDb.coinsBalance !== 50) throw new Error('Buyer coins were not deducted correctly.');
    if (sellerDb.coinsBalance !== 45) throw new Error('Seller coins were not credited correctly (90% payout).');

    // Verify coin transactions ledger entries exist
    const spendLog = await mongoose.connection.db.collection('cointransactions').findOne({ user: new mongoose.Types.ObjectId(buyer._id), type: 'spend' });
    const earnLog = await mongoose.connection.db.collection('cointransactions').findOne({ user: new mongoose.Types.ObjectId(seller._id), type: 'earn' });
    if (!spendLog || spendLog.amount !== -50 || !earnLog || earnLog.amount !== 45) {
      throw new Error('Gift coin transaction ledgers missing or incorrect.');
    }
    console.log(`Gift ledger entries logged successfully.`);

    console.log('\n=== ALL SHOPEE EVOLUTION PHASE 2 E2E TESTS PASSED SUCCESSFULLY ===');
    
    socketBuyer.disconnect();
    socketSeller.disconnect();
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n=== TEST SUITE FAILED ===');
    console.error(error);
    if (socketBuyer) socketBuyer.disconnect();
    if (socketSeller) socketSeller.disconnect();
    await mongoose.disconnect();
    process.exit(1);
  }
}

runShopeeEvolutionV2Tests();
