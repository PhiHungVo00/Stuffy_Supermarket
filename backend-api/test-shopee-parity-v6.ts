/// <reference path="./declarations.d.ts" />
import mongoose from 'mongoose';
import User from './models/User';
import Shop from './models/Shop';
import Product from './models/Product';
import Order from './models/Order';
import CoinTransaction from './models/CoinTransaction';

const API_BASE = 'http://127.0.0.1:5000';

async function runShopeeParityTests() {
  console.log('=== STARTING SHOPEE PARITY INTEGRATION TESTS (V6) ===');
  let testSuccess = true;

  try {
    // 1. Connect to DB
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev6_shopee_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV6' } });
    await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV6 Product' } });
    await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV6ShopeeCOD' });

    const timestamp = Date.now();
    const sellerAEmail = `ev6_shopee_seller_a_${timestamp}@test.com`;
    const sellerBEmail = `ev6_shopee_seller_b_${timestamp}@test.com`;
    const buyerEmail = `ev6_shopee_buyer_${timestamp}@test.com`;

    // 2. Register Seller A, Seller B, and Buyer
    console.log('- Registering Seller A via API...');
    const regResA = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV6 Seller A', email: sellerAEmail, password: 'password123', role: 'seller' })
    });
    const regDataA = await regResA.json();
    const tokenA = regDataA.token;

    console.log('- Registering Seller B via API...');
    const regResB = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV6 Seller B', email: sellerBEmail, password: 'password123', role: 'seller' })
    });
    const regDataB = await regResB.json();
    const tokenB = regDataB.token;

    console.log('- Registering Buyer via API...');
    const regResBuyer = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EV6 Buyer', email: buyerEmail, password: 'password123' })
    });
    const regDataBuyer = await regResBuyer.json();
    const tokenBuyer = regDataBuyer.token;

    const dbSellerA = await User.findOne({ email: sellerAEmail });
    const dbSellerB = await User.findOne({ email: sellerBEmail });
    const dbBuyer = await User.findOne({ email: buyerEmail });
    const dbShopA = await Shop.findOne({ owner: dbSellerA?._id });
    const dbShopB = await Shop.findOne({ owner: dbSellerB?._id });

    console.log('[Debug] dbSellerA:', dbSellerA ? { id: dbSellerA._id, name: dbSellerA.name, role: dbSellerA.role } : 'null');
    console.log('[Debug] dbSellerB:', dbSellerB ? { id: dbSellerB._id, name: dbSellerB.name, role: dbSellerB.role } : 'null');
    console.log('[Debug] dbShopA:', dbShopA ? { id: dbShopA._id, name: dbShopA.name, owner: dbShopA.owner } : 'null');
    console.log('[Debug] dbShopB:', dbShopB ? { id: dbShopB._id, name: dbShopB.name, owner: dbShopB.owner } : 'null');
    console.log('[Debug] regDataA:', regDataA);
    console.log('[Debug] regDataB:', regDataB);

    if (!dbShopA || !dbShopB) throw new Error('Shops were not auto-created!');

    // Update Shop coordinates or locations if needed to test dynamic logistics
    await Shop.findByIdAndUpdate(dbShopA._id, {
      $set: { province: 'Hồ Chí Minh', district: 'Quận Thủ Đức' }
    });

    console.log('\n=== TEST 1: Dynamic Shipping Fee based on Weight ===');
    // Seller A creates two products with different weights
    console.log('- Seller A creating EV6 Product Light (weight = 200g)...');
    const prodLightRes = await fetch(`${API_BASE}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: 'EV6 Product Light',
        price: 100,
        category: 'Toys',
        countInStock: 20,
        weight: 200,
        description: 'Light weight item'
      })
    });
    const dbProdLight = await prodLightRes.json();
    if (!prodLightRes.ok) throw new Error('Product creation failed: ' + dbProdLight.error);

    console.log('- Seller A creating EV6 Product Heavy (weight = 10000g / 10kg)...');
    const prodHeavyRes = await fetch(`${API_BASE}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: 'EV6 Product Heavy',
        price: 100,
        category: 'Toys',
        countInStock: 20,
        weight: 10000,
        description: 'Heavy weight item'
      })
    });
    const dbProdHeavy = await prodHeavyRes.json();
    if (!prodHeavyRes.ok) throw new Error('Product creation failed: ' + dbProdHeavy.error);

    // Get Shipping Fee for Light Product
    console.log('- Querying shipping fee for Light Product...');
    const feeLightRes = await fetch(`${API_BASE}/api/orders/shipping-fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify({
        orderItems: [{ product: dbProdLight._id, qty: 1, price: 100 }],
        shippingAddress: { address: 'Quận 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' }
      })
    });
    const feeLightData = await feeLightRes.json();
    const feeLight = feeLightData.shippingFees[dbShopA._id.toString()];
    console.log(`  Light Shipping Fee: $${feeLight}`);

    // Get Shipping Fee for Heavy Product
    console.log('- Querying shipping fee for Heavy Product...');
    const feeHeavyRes = await fetch(`${API_BASE}/api/orders/shipping-fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify({
        orderItems: [{ product: dbProdHeavy._id, qty: 1, price: 100 }],
        shippingAddress: { address: 'Quận 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' }
      })
    });
    const feeHeavyData = await feeHeavyRes.json();
    const feeHeavy = feeHeavyData.shippingFees[dbShopA._id.toString()];
    console.log(`  Heavy Shipping Fee: $${feeHeavy}`);

    if (feeHeavy <= feeLight) {
      throw new Error(`Dynamic shipping fee failed! Heavy fee ($${feeHeavy}) is not greater than Light fee ($${feeLight})`);
    }
    console.log('✓ TEST 1: Dynamic Shipping Fee based on Weight PASSED.');

    console.log('\n=== TEST 2: Coins Redemption during Checkout ===');
    // Credit buyer with 200 Stuffy Coins
    console.log('- Crediting buyer with 200 Stuffy Coins...');
    await User.findByIdAndUpdate(dbBuyer?._id, { $set: { coinsBalance: 200 } });

    // Buyer checkouts Light product with 100 Coins. 
    // Light product price = 100. Max 25% of 100 is 25 coins.
    console.log('- Buyer placing order with 100 redeemCoins (expected max deduction 25 coins = $25)...');
    const orderRes = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify({
        orderItems: [{ name: dbProdLight.name, qty: 1, image: 'img.jpg', price: 100, product: dbProdLight._id }],
        shippingAddress: { address: 'Quận 1', city: 'Hồ Chí Minh', postalCode: '70000', country: 'Vietnam' },
        itemsPrice: 100,
        taxPrice: 0,
        totalPrice: 100 + feeLight,
        paymentMethod: 'EV6ShopeeCOD',
        redeemCoins: 100
      })
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error('Order creation with coins failed: ' + orderData.error);
    const dbOrder = orderData[0] || orderData;

    console.log(`  Order created. ID: ${dbOrder._id}`);
    console.log(`  Coins Redeemed: ${dbOrder.coinsRedeemed}`);
    console.log(`  Total price (itemsPrice + ship - coinsRedeemed): $${dbOrder.totalPrice}`);

    // Verify Coins deducted from Buyer balance
    const updatedBuyer = await User.findById(dbBuyer?._id);
    console.log(`  Buyer remaining Coins: ${updatedBuyer?.coinsBalance} (Expected: 175)`);

    // Verify CoinTransaction was created
    const coinTx = await CoinTransaction.findOne({ user: dbBuyer?._id, type: 'spend' });
    console.log(`  Coin transaction amount: ${coinTx?.amount} (Expected: -25)`);

    if (dbOrder.coinsRedeemed !== 25 || updatedBuyer?.coinsBalance !== 175 || coinTx?.amount !== -25) {
      throw new Error('Coin redemption deduction or transaction recording is incorrect!');
    }
    console.log('✓ TEST 2: Coins Redemption during Checkout PASSED.');

    console.log('\n=== TEST 3: Review & Seller Reply ===');
    // Try posting review before order is Delivered (should fail)
    console.log('- Buyer trying to post review while order is still Pending...');
    const reviewFailRes = await fetch(`${API_BASE}/api/products/${dbProdLight._id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify({ rating: 5, comment: 'Excellent product!' })
    });
    const reviewFailData = await reviewFailRes.json();
    console.log(`  Status: ${reviewFailRes.status}, Error: ${reviewFailData.error}`);
    if (reviewFailRes.status !== 400 || !reviewFailData.error.includes('Only verified buyers')) {
      throw new Error('Buyer allowed to post review on non-Delivered order!');
    }

    // Set order status to Delivered
    console.log("- Seller A setting order status to 'Delivered'...");
    const statusRes = await fetch(`${API_BASE}/api/orders/${dbOrder._id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ status: 'Delivered' })
    });
    if (!statusRes.ok) throw new Error('Failed to set order status to Delivered');

    // Post review again (should succeed now)
    console.log('- Buyer posting review now that order is Delivered...');
    const reviewSuccessRes = await fetch(`${API_BASE}/api/products/${dbProdLight._id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenBuyer}` },
      body: JSON.stringify({ rating: 5, comment: 'Excellent product!' })
    });
    if (!reviewSuccessRes.ok) {
      const data = await reviewSuccessRes.json();
      throw new Error('Review failed even after order Delivered: ' + data.error);
    }
    console.log('  Review posted successfully.');

    // Fetch product to get review ID
    const updatedProd = await Product.findById(dbProdLight._id);
    const review = updatedProd?.reviews?.[0];
    if (!review) throw new Error('Review not found in product reviews array!');
    const reviewId = review._id.toString();
    console.log(`  Review ID: ${reviewId}, Rating: ${review.rating}, Comment: "${review.comment}"`);

    // Seller B tries to reply to Seller A's product review (should fail)
    console.log("- Seller B (another shop) trying to reply to Seller A's product review...");
    const replyResB = await fetch(`${API_BASE}/api/products/${dbProdLight._id}/reviews/${reviewId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({ reply: 'Thank you from another seller!' })
    });
    const replyDataB = await replyResB.json();
    console.log(`  Status: ${replyResB.status}, Error: ${replyDataB.error}`);
    if (replyResB.status !== 403 || !replyDataB.error.includes('reviews on products from their own shop')) {
      throw new Error('Seller B allowed to reply to Seller A\'s product review! Security vulnerability!');
    }

    // Seller A replies to the review (should succeed)
    console.log("- Seller A replying to the review...");
    const replyResA = await fetch(`${API_BASE}/api/products/${dbProdLight._id}/reviews/${reviewId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ reply: 'Thank you for buying from our shop!' })
    });
    if (!replyResA.ok) {
      const data = await replyResA.json();
      throw new Error('Seller A failed to reply to review: ' + data.error);
    }
    console.log('  Reply posted successfully.');

    // Verify reply in database
    const finalProd = await Product.findById(dbProdLight._id);
    const finalReview = finalProd?.reviews?.[0];
    console.log(`  Saved Reply: "${finalReview?.reply}"`);
    console.log(`  Saved RepliedAt: ${finalReview?.repliedAt}`);

    if (finalReview?.reply !== 'Thank you for buying from our shop!' || !finalReview?.repliedAt) {
      throw new Error('Reply details not saved correctly in database review subdocument!');
    }
    console.log('✓ TEST 3: Review & Seller Reply PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'ev6_shopee_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'EV6' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'EV6 Product' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('orders').deleteMany({ paymentMethod: 'EV6ShopeeCOD' }); } catch (e) {}

    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected database.');

    if (testSuccess) {
      console.log('\n=== ALL SHOPEE PARITY INTEGRATION TESTS PASSED SUCCESSFULLY! ===\n');
      process.exit(0);
    } else {
      console.log('\n=== SHOPEE PARITY INTEGRATION TESTS FAILED ===\n');
      process.exit(1);
    }
  }
}

runShopeeParityTests();
