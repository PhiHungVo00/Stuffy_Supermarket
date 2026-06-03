const mongoose = require('mongoose');
const API_BASE = 'http://localhost:5000';

async function runCoinsAndLogisticsTests() {
  console.log('=== STARTING STUFFY COINS & 3PL LOGISTICS E2E INTEGRATION TESTS ===');
  
  try {
    console.log('Connecting to database...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_test_suite');
    
    // Clean up test collections for a clean run
    try { await mongoose.connection.db.collection('users').deleteMany({ email: { $regex: 'coins_' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('shops').deleteMany({ name: { $regex: 'Coins' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('products').deleteMany({ name: { $regex: 'Coins' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('orders').deleteMany({ paymentMethod: 'CoinsTest' }); } catch (e) {}
    try { await mongoose.connection.db.collection('cointransactions').deleteMany({}); } catch (e) {}

    const timestamp = Date.now();

    // Helper for api calls
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

    // 1. Login Admin
    console.log('\n[Step 1] Logging in pre-seeded Admin...');
    const admin = await apiCall('POST', '/api/auth/login', {
      email: 'admin@stuffy.com',
      password: 'adminpassword',
    });
    console.log('Admin logged in.');

    // 2. Register Seller
    console.log('\n[Step 2] Registering Seller...');
    const seller = await apiCall('POST', '/api/auth/register', {
      name: 'Coins Seller',
      email: `coins_seller_${timestamp}@test.com`,
      password: 'password123',
      role: 'seller'
    });
    console.log('Seller registered.');

    // 3. Register Buyer
    console.log('\n[Step 3] Registering Buyer...');
    const buyer = await apiCall('POST', '/api/auth/register', {
      name: 'Coins Buyer',
      email: `coins_buyer_${timestamp}@test.com`,
      password: 'password123',
    });
    console.log('Buyer registered.');

    // Find the seller's shop
    const shops = await apiCall('GET', '/api/shops');
    const shop = shops.find(s => s.name === "Coins Seller's Shop");
    if (!shop) throw new Error('Seller shop was not created.');

    // Create a product ($100 price, stock 10)
    console.log('\n[Step 4] Creating Product...');
    const product = await apiCall('POST', '/api/products', {
      name: 'Coins Product Test',
      price: 100,
      category: 'Audio',
      countInStock: 10,
      shop: shop._id
    }, seller.token);
    console.log(`Product created: ID=${product._id}`);

    // Give buyer 50 coins directly in MongoDB to start testing
    console.log('\n[Step 5] Seeding buyer coins balance directly in database...');
    await mongoose.connection.db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(buyer._id) },
      { $set: { coinsBalance: 50 } }
    );
    
    // Check me endpoint returns the seeded coins
    const profile = await apiCall('GET', '/api/auth/me', null, buyer.token);
    console.log(`Buyer coins balance verified via /me endpoint: ${profile.coinsBalance}`);
    if (profile.coinsBalance !== 50) {
      throw new Error(`Seeded balance was 50, but me profile returned ${profile.coinsBalance}`);
    }

    // 6. Test Shipping Fee endpoint
    console.log('\n[Step 6] Testing /api/orders/shipping-fee dynamic calculator...');
    const feesPayload = {
      orderItems: [{ product: product._id, qty: 1, price: 100 }],
      shippingAddress: { city: 'Hồ Chí Minh', address: 'Quận 1', postalCode: '70000', country: 'Vietnam' },
      selectedCarriers: { [shop._id]: 'ghtk' }
    };
    const feesResult = await apiCall('POST', '/api/orders/shipping-fee', feesPayload, buyer.token);
    console.log(`Shipping fee result:`, feesResult);
    const calculatedFee = feesResult.shippingFees[shop._id];
    if (typeof calculatedFee !== 'number' || calculatedFee <= 0) {
      throw new Error(`Expected a positive numeric shipping fee, got ${calculatedFee}`);
    }
    console.log(`Dynamic shipping fee for GHTK verified: $${calculatedFee}`);

    // 7. Checkout with Coins redemption
    console.log('\n[Step 7] Testing checkout with 20 Coins redeemed (25% discount cap on $100)...');
    const checkoutResult = await apiCall('POST', '/api/orders', {
      orderItems: [{ product: product._id, name: product.name, qty: 1, price: product.price, image: 'test.jpg' }],
      shippingAddress: { address: 'Quận 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
      paymentMethod: 'CoinsTest',
      redeemCoins: 20,
      selectedCarriers: { [shop._id]: 'ghn' }
    }, buyer.token);

    console.log(`Checkout success. Split Order ID: ${checkoutResult._id}`);
    
    // Verify buyer coins balance is decremented immediately
    const userAfterCheckout = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
    console.log(`Buyer balance after checkout: ${userAfterCheckout.coinsBalance} (Expected: 30)`);
    if (userAfterCheckout.coinsBalance !== 30) {
      throw new Error(`Coins were not correctly deducted. Expected 30, got ${userAfterCheckout.coinsBalance}`);
    }

    // Verify transaction logs
    const spendTx = await mongoose.connection.db.collection('cointransactions').findOne({ user: new mongoose.Types.ObjectId(buyer._id), type: 'spend' });
    const earnTx = await mongoose.connection.db.collection('cointransactions').findOne({ user: new mongoose.Types.ObjectId(buyer._id), type: 'earn' });
    
    console.log(`Spend transaction verified: amount=${spendTx?.amount}, type=${spendTx?.type}`);
    console.log(`Pending earn transaction verified: amount=${earnTx?.amount}, isCredited=${earnTx?.isCredited}`);
    
    if (!spendTx || spendTx.amount !== -20 || !earnTx || earnTx.amount !== 10 || earnTx.isCredited !== false) {
      throw new Error('Coin transaction logs are incorrect or missing.');
    }

    // 8. Deliver order to trigger coin reward payout
    console.log('\n[Step 8] Delivering order to trigger pending coins credit...');
    await apiCall('PUT', `/api/orders/${checkoutResult._id}/status`, { status: 'Delivered' }, admin.token);
    
    const userAfterDelivery = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
    console.log(`Buyer balance after delivery payout: ${userAfterDelivery.coinsBalance} (Expected: 40)`);
    if (userAfterDelivery.coinsBalance !== 40) {
      throw new Error(`Coins were not credited on Delivery. Expected 40, got ${userAfterDelivery.coinsBalance}`);
    }

    const earnTxAfterDelivery = await mongoose.connection.db.collection('cointransactions').findOne({ _id: earnTx._id });
    console.log(`Earn transaction isCredited: ${earnTxAfterDelivery?.isCredited} (Expected: true)`);
    if (earnTxAfterDelivery?.isCredited !== true) {
      throw new Error('Earn transaction was not marked as credited.');
    }

    // 9. Test order cancellation refunds spent coins
    console.log('\n[Step 9] Testing order cancellation spent coins refund...');
    // Create new order, redeeming 10 coins (balance decreases to 30)
    const cancelOrder = await apiCall('POST', '/api/orders', {
      orderItems: [{ product: product._id, name: product.name, qty: 1, price: product.price, image: 'test.jpg' }],
      shippingAddress: { address: 'Quận 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
      paymentMethod: 'CoinsTest',
      redeemCoins: 10,
      selectedCarriers: { [shop._id]: 'ghn' }
    }, buyer.token);

    // Cancel this order as admin
    await apiCall('PUT', `/api/orders/${cancelOrder._id}/status`, { status: 'Canceled' }, admin.token);

    const userAfterCancel = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
    console.log(`Buyer balance after cancellation refund: ${userAfterCancel.coinsBalance} (Expected: 40)`);
    if (userAfterCancel.coinsBalance !== 40) {
      throw new Error(`Refund failed. Expected balance 40, got ${userAfterCancel.coinsBalance}`);
    }

    const refundTx = await mongoose.connection.db.collection('cointransactions').findOne({ orderId: new mongoose.Types.ObjectId(cancelOrder._id), type: 'refund' });
    console.log(`Refund transaction logged: amount=${refundTx?.amount}, type=${refundTx?.type}`);
    if (!refundTx || refundTx.amount !== 10) {
      throw new Error('Refund transaction log is missing or incorrect.');
    }

    // 10. Test checkout failure stock depletion rollback
    console.log('\n[Step 10] Testing stock depletion checkout rollback spent coins restore...');
    // Deplete product stock
    await apiCall('PUT', `/api/products/${product._id}`, { countInStock: 0 }, seller.token);
    
    // Attempt checkout
    try {
      await apiCall('POST', '/api/orders', {
        orderItems: [{ product: product._id, name: product.name, qty: 1, price: product.price, image: 'test.jpg' }],
        shippingAddress: { address: 'Quận 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
        paymentMethod: 'CoinsTest',
        redeemCoins: 10
      }, buyer.token);
      throw new Error('Success (Fail): Checkout succeeded with 0 stock.');
    } catch (err) {
      if (err.status === 400 && err.error.includes('Insufficient stock')) {
        console.log('Checkout failed as expected with Insufficient stock.');
        
        // Verify coins balance remains 40 (meaning it was successfully rolled back!)
        const userAfterFailedCheckout = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(buyer._id) });
        console.log(`Buyer balance after failed checkout: ${userAfterFailedCheckout.coinsBalance} (Expected: 40)`);
        if (userAfterFailedCheckout.coinsBalance !== 40) {
          throw new Error(`Failed checkout leaked coins. Expected balance 40, got ${userAfterFailedCheckout.coinsBalance}`);
        }
        console.log('Passed: Coins rollback successfully verified.');
      } else {
        throw err;
      }
    }

    console.log('\n=== ALL COINS & LOGISTICS TESTS PASSED SUCCESSFULLY ===');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runCoinsAndLogisticsTests();
