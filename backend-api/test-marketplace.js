const mongoose = require('mongoose');
const API_BASE = 'http://localhost:5000';

async function runTests() {
  console.log('=== STARTING MARKETPLACE INTEGRATION TESTS ===');
  
  try {
    console.log('Connecting to database to clean up documents...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_test_suite');
    
    // Delete test-created documents, keeping the pre-seeded admin user
    try { await mongoose.connection.db.collection('users').deleteMany({ email: { $ne: 'admin@stuffy.com' } }); } catch (e) {}
    try { await mongoose.connection.db.collection('shops').deleteMany({}); } catch (e) {}
    try { await mongoose.connection.db.collection('products').deleteMany({}); } catch (e) {}
    try { await mongoose.connection.db.collection('vouchers').deleteMany({}); } catch (e) {}
    try { await mongoose.connection.db.collection('orders').deleteMany({}); } catch (e) {}
    
    await mongoose.disconnect();
    console.log('Database cleaned successfully.');

    const timestamp = Date.now();
    
    // Helper function for api calls
    async function apiCall(method, path, body = null, token = null) {
      const url = `${API_BASE}${path}`;
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const config = {
        method,
        headers,
      };
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
    console.log(`Admin logged in. Token: ${admin.token.substring(0, 10)}...`);

    // 2. Register Seller 1
    console.log('\n[Step 2] Registering Seller 1...');
    const seller1 = await apiCall('POST', '/api/auth/register', {
      name: 'Seller One',
      email: `seller1_${timestamp}@test.com`,
      password: 'password123',
      role: 'seller'
    });
    console.log(`Seller 1 registered. Token: ${seller1.token.substring(0, 10)}...`);

    // 3. Register Seller 2
    console.log('\n[Step 3] Registering Seller 2...');
    const seller2 = await apiCall('POST', '/api/auth/register', {
      name: 'Seller Two',
      email: `seller2_${timestamp}@test.com`,
      password: 'password123',
      role: 'seller'
    });
    console.log(`Seller 2 registered. Token: ${seller2.token.substring(0, 10)}...`);

    // 4. Register Buyer
    console.log('\n[Step 4] Registering Buyer...');
    const buyer = await apiCall('POST', '/api/auth/register', {
      name: 'Buyer Bob',
      email: `buyer_${timestamp}@test.com`,
      password: 'password123',
    });
    console.log(`Buyer registered. Token: ${buyer.token.substring(0, 10)}...`);

    // 5. Verify Shops were Auto-Created
    console.log('\n[Step 5] Listing Shops...');
    const shops = await apiCall('GET', '/api/shops');
    console.log(`Total active shops: ${shops.length}`);
    const shop1 = shops.find(s => s.name === "Seller One's Shop");
    const shop2 = shops.find(s => s.name === "Seller Two's Shop");
    if (!shop1 || !shop2) {
      throw new Error('Verification failed: One or both seller shops were not automatically created.');
    }
    console.log(`Shop 1 verified: ID=${shop1._id}, Owner=${shop1.owner}`);
    console.log(`Shop 2 verified: ID=${shop2._id}, Owner=${shop2.owner}`);

    // 6. Create Vouchers as Admin
    console.log('\n[Step 6] Creating Vouchers...');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day expiry
    
    // Create Platform percentage voucher (10% off)
    const platformVoucher = await apiCall('POST', '/api/vouchers', {
      code: `PLATFORM_${timestamp}`,
      type: 'discount',
      discountType: 'percentage',
      discountValue: 10,
      description: 'Platform 10% Off',
      scope: 'platform',
      expiresAt,
    }, admin.token);
    console.log(`Platform Voucher Created: ${platformVoucher.code}`);

    // Create Shop 1 fixed voucher ($5 off)
    const shopVoucher = await apiCall('POST', '/api/vouchers', {
      code: `SHOP1_${timestamp}`,
      type: 'discount',
      discountType: 'fixed',
      discountValue: 5,
      description: 'Shop 1 $5 Off',
      scope: 'shop',
      shopId: shop1._id,
      expiresAt,
    }, admin.token);
    console.log(`Shop 1 Voucher Created: ${shopVoucher.code}`);

    // 7. Create Products
    console.log('\n[Step 7] Creating Products...');
    // Create product 1 for Seller 1
    const product1 = await apiCall('POST', '/api/products', {
      name: 'Shop 1 Product A',
      price: 100,
      category: 'Audio',
      countInStock: 10,
      shop: shop1._id
    }, seller1.token);
    console.log(`Product 1 Created: ${product1.name}, ID=${product1._id}`);

    // Create product 2 for Seller 2
    const product2 = await apiCall('POST', '/api/products', {
      name: 'Shop 2 Product B',
      price: 200,
      category: 'Gaming',
      countInStock: 5,
      shop: shop2._id
    }, seller2.token);
    console.log(`Product 2 Created: ${product2.name}, ID=${product2._id}`);

    // 8. Attempt review before delivery (should fail)
    console.log('\n[Step 8] Testing Review Guard before purchase...');
    try {
      await apiCall('POST', `/api/products/${product1._id}/reviews`, {
        name: buyer.name,
        rating: 5,
        comment: 'Great product!'
      }, buyer.token);
      throw new Error('Success (Fail): Buyer could submit review before delivery!');
    } catch (err) {
      if (err.status === 400 && err.error.includes('Only verified buyers')) {
        console.log('Passed Review Guard test: Submit review rejected as expected.');
      } else {
        throw err;
      }
    }

    // 9. Checkout Cart with Mixed Shops and Stackable Vouchers
    console.log('\n[Step 9] Creating Checkout with split order requirements...');
    // We order 2 of Product 1 and 1 of Product 2
    // ItemsPrice total = 100 * 2 + 200 * 1 = 400
    const checkoutResult = await apiCall('POST', '/api/orders', {
      orderItems: [
        {
          product: product1._id,
          name: product1.name,
          qty: 2,
          price: product1.price,
          image: 'product1.jpg'
        },
        {
          product: product2._id,
          name: product2.name,
          qty: 1,
          price: product2.price,
          image: 'product2.jpg'
        }
      ],
      shippingAddress: {
        address: '123 E-Commerce Way',
        city: 'Cyber City',
        postalCode: '90210',
        country: 'Internet Land'
      },
      paymentMethod: 'Stripe',
      voucherCode: platformVoucher.code, // 10% platform
      shopVoucherCode: shopVoucher.code, // $5 shop1
    }, buyer.token);
    console.log(`Checkout response success. Parent Order: ${checkoutResult.parentOrderId}`);

    // 10. Verify Split Orders
    console.log('\n[Step 10] Verifying Split Orders...');
    const buyerOrders = await apiCall('GET', '/api/orders/myorders', null, buyer.token);
    const relatedOrders = buyerOrders.filter(o => o.parentOrderId === checkoutResult.parentOrderId);
    console.log(`Found ${relatedOrders.length} sub-orders for parentOrderId: ${checkoutResult.parentOrderId}`);
    
    if (relatedOrders.length !== 2) {
      throw new Error(`Expected exactly 2 split orders, but found ${relatedOrders.length}`);
    }

    // Examine order 1 (Shop 1)
    const oShop1 = relatedOrders.find(o => o.shop && o.shop._id === shop1._id);
    const oShop2 = relatedOrders.find(o => o.shop && o.shop._id === shop2._id);

    if (!oShop1 || !oShop2) {
      throw new Error('Split orders do not map to the correct shop IDs.');
    }

    console.log(`Sub-order 1 (Shop 1): itemsPrice=${oShop1.itemsPrice}, shippingFee=${oShop1.shippingFee}, totalPrice=${oShop1.totalPrice}`);
    console.log(`Sub-order 2 (Shop 2): itemsPrice=${oShop2.itemsPrice}, shippingFee=${oShop2.shippingFee}, totalPrice=${oShop2.totalPrice}`);

    // Check pricing:
    // Sub-order 1 itemsPrice: 200. Shop 1 voucher: 5. Platform proportional discount: 20. Shipping: 15.8. Tax (15% of 200) = 30.
    // Total price = 200 - (20 + 5) + 15.8 + 30 = 220.8.
    if (oShop1.totalPrice !== 220.8) {
      throw new Error(`Pricing incorrect for Sub-order 1. Expected 220.8, got ${oShop1.totalPrice}`);
    }
    console.log('Passed Sub-order 1 calculation check.');

    // Sub-order 2 itemsPrice: 200. Platform proportional discount: 20. Shipping: 15.4. Tax = 30.
    // Total price = 200 - 20 + 15.4 + 30 = 225.4.
    if (oShop2.totalPrice !== 225.4) {
      throw new Error(`Pricing incorrect for Sub-order 2. Expected 225.4, got ${oShop2.totalPrice}`);
    }
    console.log('Passed Sub-order 2 calculation check.');

    // 11. Check Stock Decrement
    console.log('\n[Step 11] Checking stock decrements...');
    const updatedProd1 = await apiCall('GET', `/api/products/${product1._id}`);
    const updatedProd2 = await apiCall('GET', `/api/products/${product2._id}`);
    console.log(`Product 1 Stock: original=10, current=${updatedProd1.countInStock} (Expected: 8)`);
    console.log(`Product 2 Stock: original=5, current=${updatedProd2.countInStock} (Expected: 4)`);
    if (updatedProd1.countInStock !== 8 || updatedProd2.countInStock !== 4) {
      throw new Error('Stock decrements did not match purchase quantities.');
    }
    console.log('Passed stock decrement check.');

    // 12. Test Review Submission after delivery
    console.log('\n[Step 12] Testing Review Guard after status is set to Delivered...');
    // Set Order 1 (Shop 1) to Delivered as Admin
    await apiCall('PUT', `/api/orders/${oShop1._id}/status`, { status: 'Delivered' }, admin.token);
    console.log(`Order ${oShop1._id} set to Delivered.`);

    // Submit review for product 1
    const reviewResult = await apiCall('POST', `/api/products/${product1._id}/reviews`, {
      name: buyer.name,
      rating: 5,
      comment: 'Excellent service and genuine quality.'
    }, buyer.token);
    console.log(`Review submit response: ${JSON.stringify(reviewResult)}`);

    // Verify it is listed in product reviews
    const finalProd1 = await apiCall('GET', `/api/products/${product1._id}`);
    console.log(`Product 1 total reviews: ${finalProd1.numReviews}, average rating: ${finalProd1.rating}`);
    if (finalProd1.numReviews !== 1 || finalProd1.reviews[0].comment !== 'Excellent service and genuine quality.') {
      throw new Error('Failed to list review or review fields mismatch.');
    }
    console.log('Passed review submission test.');

    // Attempt review for product 2 (should still fail since order status is not Delivered)
    console.log('Testing review for product 2 (order status is Pending)...');
    try {
      await apiCall('POST', `/api/products/${product2._id}/reviews`, {
        name: buyer.name,
        rating: 4,
        comment: 'Nice product!'
      }, buyer.token);
      throw new Error('Success (Fail): Buyer could review a product that is not delivered!');
    } catch (err) {
      if (err.status === 400 && err.error.includes('Only verified buyers')) {
        console.log('Passed: Product 2 review rejected successfully.');
      } else {
        throw err;
      }
    }

    // 13. Test Transactional Stock Rollback on Checkout Failure
    console.log('\n[Step 13] Testing checkout rollback on stock depletion...');
    // Set product 2 stock to 1 as Seller 2
    await apiCall('PUT', `/api/products/${product2._id}`, { countInStock: 1 }, seller2.token);
    
    // Attempt to checkout with 2 of product 2 (which exceeds stock 1) and 1 of product 1
    try {
      await apiCall('POST', '/api/orders', {
        orderItems: [
          {
            product: product1._id,
            name: product1.name,
            qty: 1,
            price: product1.price,
            image: 'product1.jpg'
          },
          {
            product: product2._id,
            name: product2.name,
            qty: 2, // Exceeds stock!
            price: product2.price,
            image: 'product2.jpg'
          }
        ],
        shippingAddress: {
          address: 'Rollback Road',
          city: 'Ghost Town',
          postalCode: '00000',
          country: 'Nowhere'
        },
        paymentMethod: 'COD'
      }, buyer.token);
      throw new Error('Success (Fail): Checkout succeeded despite insufficient stock!');
    } catch (err) {
      if (err.status === 400 && err.error.includes('Insufficient stock')) {
        console.log('Passed: Checkout rejected with insufficient stock as expected.');
        
        // Verify stock is not leaked and no new orders were saved
        const finalProd1_stock = await apiCall('GET', `/api/products/${product1._id}`);
        const finalProd2_stock = await apiCall('GET', `/api/products/${product2._id}`);
        
        console.log(`Product 1 Stock after failed checkout: ${finalProd1_stock.countInStock} (Expected: 8)`);
        console.log(`Product 2 Stock after failed checkout: ${finalProd2_stock.countInStock} (Expected: 1)`);
        
        if (finalProd1_stock.countInStock !== 8 || finalProd2_stock.countInStock !== 1) {
          throw new Error('Stock rollback verification failed (stock leak occurred).');
        }
        
        console.log('Passed: Stock rollback verified successfully.');
      } else {
        throw err;
      }
    }

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error(error);
    process.exit(1);
  }
}

runTests();
