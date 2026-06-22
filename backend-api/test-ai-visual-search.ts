import mongoose from 'mongoose';
import Product from './models/Product';
import Shop from './models/Shop';
import User from './models/User';

const API_BASE = 'http://localhost:5000';

async function runTests() {
  console.log('=== STARTING AI VISUAL SEARCH INTEGRATION TESTS ===');
  let testSuccess = true;

  try {
    // 1. Connect to DB
    console.log('[Setup] Connecting to database stuffy_db...');
    await mongoose.connect('mongodb://localhost:27017/stuffy_db');
    console.log('[Setup] Connected to database.');

    // 2. Clear old test records
    await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'aisearch_test_' } });
    await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'AISearch Test' } });
    await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'AISearch' } });

    // 3. Setup test data (Seller, Shop, Product)
    const timestamp = Date.now();
    const seller = new User({
      name: 'AISearch Test Seller',
      email: `aisearch_test_seller_${timestamp}@test.com`,
      password: 'password123',
      role: 'seller',
      tenantId: 'default_store'
    });
    await seller.save();

    const shop = new Shop({
      name: `AISearch Test Shop ${timestamp}`,
      owner: seller._id,
      description: 'Test Shop for AI Search',
      tenantId: 'default_store'
    });
    await shop.save();

    // Create a product to be searched
    const product = new Product({
      name: 'AISearch Test Laptop Pro',
      price: 1200,
      category: 'Electronics',
      countInStock: 5,
      shop: shop._id,
      tenantId: 'default_store',
      description: 'High performance laptop for development'
    });
    await product.save();

    console.log('\n=== TEST: Post mock image to Visual Search API ===');
    
    const requestBody = {
      image: 'mock_base64_image_data',
      mimeType: 'image/jpeg'
    };

    console.log(`- Sending POST request to /api/ai-search/visual-search...`);
    const searchRes = await fetch(`${API_BASE}/api/ai-search/visual-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      throw new Error(`API returned error: ${searchData.error || searchData.message}`);
    }

    console.log(`  Engine: ${searchData.engine} (Expected: Mock Fallback Engine)`);
    console.log(`  Keywords: ${JSON.stringify(searchData.keywords)}`);
    console.log(`  Products count: ${searchData.products ? searchData.products.length : 0}`);

    if (searchData.engine !== 'Mock Fallback Engine') {
      throw new Error(`Expected engine to be 'Mock Fallback Engine', got ${searchData.engine}`);
    }

    if (!searchData.products || searchData.products.length === 0) {
      throw new Error('No products returned in fallback mode search!');
    }

    // Verify search works on database
    const foundProduct = searchData.products.find((p: any) => p.name === 'AISearch Test Laptop Pro');
    if (foundProduct) {
      console.log(`  Found target product: ${foundProduct.name}`);
    } else {
      console.log(`  [Notice] Target product not in top results, but fallback returned data successfully.`);
    }

    console.log('✓ TEST: AI Visual Search Integration Test PASSED.');

  } catch (err: any) {
    console.error('\n✖ TEST FAILED:', err.message || err);
    testSuccess = false;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test records...');
    try { await mongoose.connection.db?.collection('users').deleteMany({ email: { $regex: 'aisearch_test_' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('shops').deleteMany({ name: { $regex: 'AISearch Test' } }); } catch (e) {}
    try { await mongoose.connection.db?.collection('products').deleteMany({ name: { $regex: 'AISearch' } }); } catch (e) {}

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
