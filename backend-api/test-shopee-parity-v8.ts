/// <reference path="./declarations.d.ts" />
import mongoose from 'mongoose';
import User from './models/User';
import Shop from './models/Shop';
import Product from './models/Product';
import Order from './models/Order';
import Voucher from './models/Voucher';

const API_BASE = 'http://127.0.0.1:5000';

async function runShopeeParityV8Tests() {
  console.log('=== STARTING SHOPEE PARITY INTEGRATION TESTS (V8) ===');
  let testSuccess = true;

  try {
    // 1. Connect to DB
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev8_shopee_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV8' } });
    await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV8 Product' } });
    await mongoose.connection.db?.collection('vouchers').deleteMany({ code: { $regex: 'EV8' } });
    await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV8ShopeeTest' });

    const timestamp = Date.now();
    const sellerEmail = `ev8_shopee_seller_${timestamp}@test.com`;
    const buyerEmail = `ev8_shopee_buyer_${timestamp}@test.com`;

    // 2. Register Seller and Buyer
    console.log('- Registering Seller via API...');
    const regResSeller = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV8 Seller', email: sellerEmail, password: 'password123', role: 'seller' })
    });
    const regDataSeller = await regResSeller.json();
    if (!regResSeller.ok) throw new Error('Seller registration failed: ' + regDataSeller.error);
    const tokenSeller = regDataSeller.token;

    console.log('- Registering Buyer via API...');
    const regResBuyer = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV8 Buyer', email: buyerEmail, password: 'password123' })
    });
    const regDataBuyer = await regResBuyer.json();
    if (!regResBuyer.ok) throw new Error('Buyer registration failed: ' + regDataBuyer.error);
    const tokenBuyer = regDataBuyer.token;

    const dbSeller = await User.findOne({ email: sellerEmail });
    const dbBuyer = await User.findOne({ email: buyerEmail });
    const dbShop = await Shop.findOne({ owner: dbSeller?._id });

    if (!dbShop || !dbSeller || !dbBuyer) throw new Error('Setup failed: entities not found');

    // Create a product
    console.log('- Creating test product...');
    const prodRes = await fetch(`${API_BASE}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSeller}` },
      body: JSON.stringify({
        name: 'EV8 Product Test',
        price: 100,
        category: 'Electronics',
        countInStock: 10,
        weight: 500,
        description: 'Test product for parity v8'
      })
    });
    const dbProd = await prodRes.json();
    if (!prodRes.ok) throw new Error('Product creation failed: ' + dbProd.error);

    // Create Vouchers in Database
    console.log('- Creating stackable multi-tier vouchers via API and DB...');
    
    // A. Shop discount voucher ($5 off) - Created via Seller API
    const shopVoucherRes = await fetch(`${API_BASE}/api/vouchers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSeller}` },
      body: JSON.stringify({
        code: 'EV8SHOP5',
        type: 'discount',
        discountType: 'fixed',
        discountValue: 5,
        description: 'EV8 Shop Voucher',
        minOrderValue: 50,
        usageLimit: 10,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        scope: 'shop'
      })
    });
    const shopVoucherData = await shopVoucherRes.json();
    if (!shopVoucherRes.ok) throw new Error('Shop voucher creation via API failed: ' + shopVoucherData.error);
    const shopVoucher = shopVoucherData;

    // Verify GET /api/vouchers/mine for seller
    console.log('  Verifying GET /api/vouchers/mine...');
    const mineRes = await fetch(`${API_BASE}/api/vouchers/mine`, {
      headers: { 'Authorization': `Bearer ${tokenSeller}` }
    });
    const mineData = await mineRes.json();
    if (!mineRes.ok) throw new Error('GET /api/vouchers/mine failed: ' + mineData.error);
    if (!mineData.some((v: any) => v.code === 'EV8SHOP5')) {
      throw new Error('Created shop voucher not found in seller mine list.');
    }

    // B. Platform items discount voucher (10% off)
    const platformVoucher = await Voucher.create({
      code: 'EV8PLAT10',
      type: 'discount',
      discountType: 'percentage',
      discountValue: 10,
      description: 'EV8 Platform Discount',
      minOrderValue: 50,
      maxDiscount: 20,
      usageLimit: 10,
      expiresAt: new Date(Date.now() + 86400000),
      isActive: true,
      scope: 'platform',
      claimedBy: [dbBuyer._id],
      tenantId: 'default_store'
    });

    // C. Platform shipping discount voucher ($4 off)
    const shippingVoucher = await Voucher.create({
      code: 'EV8SHIP4',
      type: 'shipping',
      discountType: 'fixed',
      discountValue: 4,
      description: 'EV8 Platform Shipping Discount',
      minOrderValue: 50,
      usageLimit: 10,
      expiresAt: new Date(Date.now() + 86400000),
      isActive: true,
      scope: 'platform',
      claimedBy: [dbBuyer._id],
      tenantId: 'default_store'
    });

    // Claim the shop voucher via API for buyer
    console.log('  Claiming shop voucher via API for buyer...');
    const claimRes = await fetch(`${API_BASE}/api/vouchers/${shopVoucher._id}/claim`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenBuyer}` }
    });
    const claimData = await claimRes.json();
    if (!claimRes.ok) throw new Error('Voucher claim via API failed: ' + claimData.error);

    // 3. Call shipping-fee API to get base shipping fee
    console.log('- Querying base shipping fee...');
    const feeRes = await fetch(`${API_BASE}/api/orders/shipping-fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify({
        orderItems: [{ product: dbProd._id, qty: 1, price: 100 }],
        shippingAddress: { address: 'District 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
        selectedCarriers: { [dbShop._id.toString()]: 'ghn' }
      })
    });
    const feeData = await feeRes.json();
    if (!feeRes.ok) throw new Error('Shipping fee calculation failed: ' + feeData.error);
    const baseShippingFee = feeData.shippingFees[dbShop._id.toString()] || 10;
    console.log(`  Base shipping fee for shop: $${baseShippingFee}`);

    // 4. Place order with all 3 vouchers stacked
    console.log('- Placing order with all 3 vouchers stacked...');
    const orderPayload = {
      orderItems: [{ name: dbProd.name, qty: 1, image: 'img.jpg', price: 100, product: dbProd._id }],
      shippingAddress: { address: 'District 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
      itemsPrice: 100,
      taxPrice: 0,
      totalPrice: 91, // We will verify this dynamically
      paymentMethod: 'EV8ShopeeTest',
      voucherCode: 'EV8PLAT10',
      shopVoucherCode: 'EV8SHOP5',
      shippingVoucherCode: 'EV8SHIP4',
      selectedCarriers: { [dbShop._id.toString()]: 'ghn' }
    };

    const orderRes = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify(orderPayload)
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error('Order creation failed: ' + orderData.error);

    const createdOrder = await Order.findById(orderData._id);
    if (!createdOrder) throw new Error('Created order not found in database!');

    console.log('\n=== VERIFYING ORDER PRICING ===');
    console.log(`  Items Price: $${createdOrder.itemsPrice} (Expected: $100)`);
    console.log(`  Shipping Fee Paid: $${createdOrder.shippingFee} (Expected: $${Math.max(0, baseShippingFee - 4)})`);
    
    const expectedDiscount = 5 + (100 * 0.1); // $5 shop + $10 platform = $15 discount on items
    const expectedTotalPrice = Math.round((100 - expectedDiscount + Math.max(0, baseShippingFee - 4)) * 100) / 100;
    console.log(`  Total Price Paid: $${createdOrder.totalPrice} (Expected: $${expectedTotalPrice})`);

    if (createdOrder.itemsPrice !== 100) {
      throw new Error('ItemsPrice does not match original price of $100');
    }

    const expectedShippingFee = Math.max(0, baseShippingFee - 4);
    if (Math.abs(createdOrder.shippingFee - expectedShippingFee) > 0.01) {
      throw new Error(`Shipping fee was not reduced correctly! Saved: ${createdOrder.shippingFee}, Expected: ${expectedShippingFee}`);
    }

    if (Math.abs(createdOrder.totalPrice - expectedTotalPrice) > 0.01) {
      throw new Error(`Total price was not calculated correctly! Saved: ${createdOrder.totalPrice}, Expected: ${expectedTotalPrice}`);
    }

    console.log('✓ TEST 1: Stackable Multi-Tier Vouchers calculation PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev8_shopee_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV8' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV8 Product' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('vouchers').deleteMany({ code: { $regex: 'EV8' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV8ShopeeTest' }); } catch (e) {}

    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected database.');

    if (testSuccess) {
      console.log('\n=== ALL SHOPEE PARITY INTEGRATION TESTS (V8) PASSED SUCCESSFULLY! ===\n');
      process.exit(0);
    } else {
      console.log('\n=== SHOPEE PARITY INTEGRATION TESTS (V8) FAILED ===\n');
      process.exit(1);
    }
  }
}

runShopeeParityV8Tests();
