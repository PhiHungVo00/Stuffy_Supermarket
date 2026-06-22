import mongoose from 'mongoose';
import Order from './models/Order';
import Shop from './models/Shop';
import User from './models/User';

const API_BASE = 'http://localhost:5000';

async function runTests() {
  console.log('=== STARTING 3PL DISPATCH INTEGRATION TESTS ===');
  let testSuccess = true;

  try {
    // 1. Connect to DB
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // 2. Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'dispatch_test_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'Dispatch Test' } });
    await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: '3PLTestCOD' });

    // 3. Setup test data (Seller, Buyer, Shop, Order)
    const timestamp = Date.now();
    const sellerEmail = `dispatch_test_seller_${timestamp}@test.com`;
    const buyerEmail = `dispatch_test_buyer_${timestamp}@test.com`;

    // Register Seller via API to trigger shop auto-creation
    console.log('- Registering Seller via API...');
    const sellerRegRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dispatch Test Seller',
        email: sellerEmail,
        password: 'password123',
        role: 'seller'
      })
    });
    const sellerRegData = await sellerRegRes.json();
    if (!sellerRegRes.ok) throw new Error('Seller registration failed: ' + sellerRegData.error);
    const token = sellerRegData.token;

    // Register Buyer via API
    console.log('- Registering Buyer via API...');
    const buyerRegRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dispatch Test Buyer',
        email: buyerEmail,
        password: 'password123'
      })
    });
    const buyerRegData = await buyerRegRes.json();
    if (!buyerRegRes.ok) throw new Error('Buyer registration failed: ' + buyerRegData.error);

    const dbSeller = await User.findOne({ email: sellerEmail });
    const dbBuyer = await User.findOne({ email: buyerEmail });
    const dbShop = await Shop.findOne({ owner: dbSeller?._id });
    if (!dbShop) throw new Error('Shop was not created automatically for the seller!');

    // Create a pending order with carrier ghn
    const order = new Order({
      user: dbBuyer?._id,
      shop: dbShop._id,
      orderItems: [
        {
          name: 'Test Item',
          qty: 1,
          image: 'image.jpg',
          price: 50,
          product: new mongoose.Types.ObjectId()
        }
      ],
      shippingAddress: {
        address: '123 Test Street',
        city: 'Hồ Chí Minh',
        postalCode: '70000',
        country: 'Vietnam'
      },
      itemsPrice: 50,
      shippingFee: 10,
      taxPrice: 0,
      totalPrice: 60,
      status: 'Pending',
      paymentMethod: '3PLTestCOD',
      isPaid: false,
      shippingCarrier: 'ghn',
      escrowStatus: 'held'
    });
    await order.save();

    console.log('\n=== TEST: Dispatch order to 3PL on status change ===');

    console.log(`- Sending PUT request to update status to Processing...`);
    const updateRes = await fetch(`${API_BASE}/api/orders/${order._id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'Processing' })
    });
    const updateData = await updateRes.json();

    if (!updateRes.ok) {
      throw new Error(`API returned error: ${updateData.error || updateData.message}`);
    }

    console.log(`  Updated Order status: ${updateData.status} (Expected: Processing)`);
    console.log(`  Updated Order trackingNumber: ${updateData.trackingNumber} (Expected: starting with STUFFY_GHN_)`);
    console.log(`  Updated Order shippingLabelUrl: ${updateData.shippingLabelUrl}`);

    if (updateData.status !== 'Processing') {
      throw new Error('Order status was not updated to Processing!');
    }

    if (!updateData.trackingNumber || !updateData.trackingNumber.startsWith('STUFFY_GHN_')) {
      throw new Error(`Invalid trackingNumber: ${updateData.trackingNumber}`);
    }

    if (!updateData.shippingLabelUrl || !updateData.shippingLabelUrl.includes('/shipping-labels/ghn/')) {
      throw new Error(`Invalid shippingLabelUrl: ${updateData.shippingLabelUrl}`);
    }

    // Verify shippingHistory is updated
    console.log(`  Shipping History length: ${updateData.shippingHistory.length} (Expected: 1)`);
    if (updateData.shippingHistory.length !== 1 || updateData.shippingHistory[0].status !== 'Processing') {
      throw new Error('shippingHistory was not updated with Processing event!');
    }

    console.log('✓ TEST: 3PL Dispatch on status change PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'dispatch_test_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'Dispatch Test' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: '3PLTestCOD' }); } catch (e) {}

    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected.');

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
