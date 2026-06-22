import mongoose from 'mongoose';
import { EscrowDaemon } from './services/escrowDaemon';
import Order from './models/Order';
import Shop from './models/Shop';
import User from './models/User';
import SellerWallet from './models/SellerWallet';

const API_BASE = 'http://localhost:5000';

async function runTests() {
  console.log('=== STARTING ESCROW RECONCILIATION & REPORT TESTS ===');
  let testSuccess = true;

  try {
    // 1. Connect to DB (same as dev server to ensure data sharing)
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // 2. Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'escrow_test_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'Escrow Test' } });
    await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EscrowTestCOD' });
    
    const timestamp = Date.now();
    const sellerEmail = `escrow_test_seller_${timestamp}@test.com`;
    const buyerEmail = `escrow_test_buyer_${timestamp}@test.com`;

    // 3. Register Seller via API to trigger shop auto-creation
    console.log('- Registering Seller via API...');
    const sellerRegRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Escrow Test Seller',
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
        name: 'Escrow Test Buyer',
        email: buyerEmail,
        password: 'password123'
      })
    });
    const buyerRegData = await buyerRegRes.json();
    if (!buyerRegRes.ok) throw new Error('Buyer registration failed: ' + buyerRegData.error);

    // Find the auto-created shop in DB
    const dbSeller = await User.findOne({ email: sellerEmail });
    const dbBuyer = await User.findOne({ email: buyerEmail });
    const dbShop = await Shop.findOne({ owner: dbSeller?._id });
    if (!dbShop) throw new Error('Shop was not created automatically for the seller!');

    // Initialize or get wallet for the shop
    let wallet = await SellerWallet.findOne({ shopId: dbShop._id });
    if (!wallet) {
      wallet = new SellerWallet({
        shopId: dbShop._id,
        balance: 100,
        pendingEscrow: 250,
        currency: 'USD',
        transactions: []
      });
      await wallet.save();
    } else {
      wallet.balance = 100;
      wallet.pendingEscrow = 250;
      wallet.transactions = [];
      await wallet.save();
    }

    // Create order delivered 4 days ago (expired escrow)
    const expiredOrder = new Order({
      user: dbBuyer?._id,
      shop: dbShop._id,
      orderItems: [
        {
          name: 'Test Item',
          qty: 1,
          image: 'image.jpg',
          price: 150,
          product: new mongoose.Types.ObjectId()
        }
      ],
      shippingAddress: {
        address: 'Test Rd',
        city: 'HCM',
        postalCode: '10000',
        country: 'VN'
      },
      itemsPrice: 150,
      shippingFee: 10,
      taxPrice: 0,
      totalPrice: 160,
      status: 'Delivered',
      paymentMethod: 'EscrowTestCOD',
      isPaid: true,
      escrowStatus: 'held',
      deliveredAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
    });
    await expiredOrder.save();

    // Create order delivered 1 day ago (not expired yet)
    const activeOrder = new Order({
      user: dbBuyer?._id,
      shop: dbShop._id,
      orderItems: [
        {
          name: 'Test Item 2',
          qty: 1,
          image: 'image2.jpg',
          price: 90,
          product: new mongoose.Types.ObjectId()
        }
      ],
      shippingAddress: {
        address: 'Test Rd',
        city: 'HCM',
        postalCode: '10000',
        country: 'VN'
      },
      itemsPrice: 90,
      shippingFee: 10,
      taxPrice: 0,
      totalPrice: 100,
      status: 'Delivered',
      paymentMethod: 'EscrowTestCOD',
      isPaid: true,
      escrowStatus: 'held',
      deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    });
    await activeOrder.save();

    console.log('\n=== TEST 1: processExpiredEscrows unit test ===');
    console.log('- Running escrow daemon sweep (threshold = 3 days)...');
    const processed = await EscrowDaemon.processExpiredEscrows(3);
    
    console.log(`  Processed orders count: ${processed} (Expected: 1)`);
    if (processed !== 1) {
      throw new Error(`Expected exactly 1 processed order, got ${processed}`);
    }

    // Verify order 1 (expired) is released
    const updatedExpiredOrder = await Order.findById(expiredOrder._id);
    console.log(`  Expired Order escrowStatus: ${updatedExpiredOrder?.escrowStatus} (Expected: released)`);
    if (updatedExpiredOrder?.escrowStatus !== 'released') {
      throw new Error('Expired order escrow was not released!');
    }

    // Verify order 2 (active) is still held
    const updatedActiveOrder = await Order.findById(activeOrder._id);
    console.log(`  Active Order escrowStatus: ${updatedActiveOrder?.escrowStatus} (Expected: held)`);
    if (updatedActiveOrder?.escrowStatus !== 'held') {
      throw new Error('Active order escrow was released prematurely!');
    }

    // Verify wallet balances
    const updatedWallet = await SellerWallet.findOne({ shopId: dbShop._id });
    console.log(`  Wallet Pending Escrow: ${updatedWallet?.pendingEscrow} (Expected: 90)`);
    console.log(`  Wallet Balance: ${updatedWallet?.balance} (Expected: 260)`); // 100 base + 160 released
    if (updatedWallet?.pendingEscrow !== 90 || updatedWallet?.balance !== 260) {
      throw new Error('Wallet balances were not adjusted correctly!');
    }

    // Verify transaction history
    console.log(`  Wallet Transactions Count: ${updatedWallet?.transactions.length} (Expected: 1)`);
    if (updatedWallet?.transactions.length !== 1 || updatedWallet.transactions[0].type !== 'escrow_payout') {
      throw new Error('Wallet transaction record was not created successfully!');
    }
    console.log('✓ TEST 1: processExpiredEscrows PASSED.');

    console.log('\n=== TEST 2: GET /api/orders/reconciliation/report integration test ===');
    console.log('- Querying Reconciliation CSV report...');
    const csvRes = await fetch(`${API_BASE}/api/orders/reconciliation/report`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const csvContent = await csvRes.text();
    
    console.log('  CSV Report preview:');
    console.log(csvContent.split('\n').slice(0, 3).join('\n'));

    if (!csvRes.ok) {
      throw new Error('CSV API request failed with status: ' + csvRes.status);
    }

    if (!csvContent.includes('Order ID,Date,Items Price') || !csvContent.includes(expiredOrder._id.toString())) {
      throw new Error('CSV report format is invalid or missing order details.');
    }
    console.log('✓ TEST 2: Reconciliation Report Integration Test PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'escrow_test_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'Escrow Test' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EscrowTestCOD' }); } catch (e) {}

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
