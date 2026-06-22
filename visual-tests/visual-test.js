const { chromium } = require('@playwright/test');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const MONGO_URI = 'mongodb://localhost:27017/stuffy_db';
const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\f3f8f57d-c891-4d69-b72a-46b09a8a9439';

// Simple Mongoose model inline definitions
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: { type: String, select: true },
  role: { type: String, default: 'user' },
  coinsBalance: { type: Number, default: 0 }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const shopSchema = new mongoose.Schema({
  name: String,
  owner: mongoose.Schema.Types.ObjectId,
  description: String,
  tenantId: String
});
const Shop = mongoose.models.Shop || mongoose.model('Shop', shopSchema);

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  shop: mongoose.Schema.Types.ObjectId,
  countInStock: Number,
  weight: Number,
  category: String,
  tenantId: String
});
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

const voucherSchema = new mongoose.Schema({
  code: String,
  type: String,
  discountType: String,
  discountValue: Number,
  minOrderValue: Number,
  maxDiscount: Number,
  usageLimit: Number,
  expiresAt: Date,
  isActive: Boolean,
  scope: String,
  shopId: mongoose.Schema.Types.ObjectId,
  claimedBy: [mongoose.Schema.Types.ObjectId],
  tenantId: String
});
const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);

async function setupTestData() {
  console.log('Connecting to MongoDB to setup test data...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const email = 'fe_test@test.com';
  let user = await User.findOne({ email });
  
  if (!user) {
    console.log('Creating test user...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    user = await User.create({
      name: 'FE Test User',
      email,
      password: hashedPassword,
      role: 'user',
      coinsBalance: 150
    });
  } else {
    user.coinsBalance = 150;
    await user.save();
  }

  // Find or create a shop
  let shop = await Shop.findOne({ name: 'Default Shop' });
  if (!shop) {
    shop = await Shop.create({
      name: 'Default Shop',
      owner: user._id,
      description: 'Default Shop Description',
      tenantId: 'default_store'
    });
  }

  // Find or create a product in this shop
  let product = await Product.findOne({ name: 'FE Test Product' });
  if (!product) {
    product = await Product.create({
      name: 'FE Test Product',
      price: 120,
      shop: shop._id,
      countInStock: 20,
      weight: 600,
      category: 'Electronics',
      tenantId: 'default_store'
    });
    console.log('Test product created.');
  }

  // Create/Update vouchers and claim them
  await Voucher.deleteMany({ code: { $regex: 'EV8FE' } });

  // 1. Shop voucher: EV8FESHOP10 ($10 off)
  await Voucher.create({
    code: 'EV8FESHOP10',
    type: 'discount',
    discountType: 'fixed',
    discountValue: 10,
    minOrderValue: 40,
    usageLimit: 100,
    expiresAt: new Date(Date.now() + 86400000),
    isActive: true,
    scope: 'shop',
    shopId: shop._id,
    claimedBy: [user._id],
    tenantId: 'default_store'
  });

  // 2. Platform discount voucher: EV8FEPLAT20 (20% off)
  await Voucher.create({
    code: 'EV8FEPLAT20',
    type: 'discount',
    discountType: 'percentage',
    discountValue: 20,
    maxDiscount: 30,
    minOrderValue: 50,
    usageLimit: 100,
    expiresAt: new Date(Date.now() + 86400000),
    isActive: true,
    scope: 'platform',
    claimedBy: [user._id],
    tenantId: 'default_store'
  });

  // 3. Platform shipping voucher: EV8FESHIP5 ($5 off)
  await Voucher.create({
    code: 'EV8FESHIP5',
    type: 'shipping',
    discountType: 'fixed',
    discountValue: 5,
    minOrderValue: 50,
    usageLimit: 100,
    expiresAt: new Date(Date.now() + 86400000),
    isActive: true,
    scope: 'platform',
    claimedBy: [user._id],
    tenantId: 'default_store'
  });

  console.log('Test data setup completed successfully.');
  await mongoose.disconnect();
}

async function runBrowserTest() {
  await setupTestData();

  console.log('Launching Playwright Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Helper function to capture screenshot at each step
  async function takeStepScreenshot(stepName) {
    const screenshotPath = path.join(ARTIFACT_DIR, `step_${stepName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[Screenshot] Step "${stepName}" saved to: ${screenshotPath}`);
  }

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await takeStepScreenshot('1_login_page');

    console.log('Logging in...');
    await page.fill('input[type="email"]', 'fe_test@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for the storefront or header to indicate logged in
    await page.waitForSelector('button:has-text("Logout"), button:has-text("Đăng xuất")', { timeout: 15000 });
    console.log('Logged in successfully!');
    await takeStepScreenshot('2_logged_in_home');

    // Navigate to products and find our test product or click "Add to Cart"
    console.log('Navigating to products list...');
    await page.goto('http://localhost:3000/');
    
    // Wait for products list or "No products found" to appear
    await page.waitForSelector('.ds-glass-card, button:has-text("Add to Cart"), button:has-text("Thêm vào giỏ"), h3:has-text("Không tìm thấy")', { timeout: 20000 });
    await takeStepScreenshot('3_products_list');

    // Add product to cart
    console.log('Adding product to cart...');
    const addToCartBtn = page.locator('button:has-text("Add to Cart"), button:has-text("Thêm vào giỏ")').first();
    await addToCartBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addToCartBtn.click();
    console.log('Product added.');
    await page.waitForTimeout(2000);
    await takeStepScreenshot('4_added_to_cart');

    console.log('Navigating to Cart page...');
    await page.goto('http://localhost:3000/cart');
    await page.waitForSelector('button:has-text("Proceed to Checkout"), button:has-text("Tiến hành thanh toán")', { timeout: 15000 });
    await takeStepScreenshot('5_cart_initial');

    // Apply Shop Voucher
    console.log('Applying Shop Voucher EV8FESHOP10...');
    const shopVoucherInput = page.locator('input[placeholder*="voucher cửa hàng"], input[placeholder*="shop voucher"]').first();
    await shopVoucherInput.fill('EV8FESHOP10');
    const shopVoucherApplyBtn = page.locator('button:has-text("Áp dụng"), button:has-text("Apply")').first();
    await shopVoucherApplyBtn.click();
    await page.waitForTimeout(2000);

    // Apply Platform Discount Voucher
    console.log('Applying Platform Discount Voucher EV8FEPLAT20...');
    const platformVoucherInput = page.locator('input[placeholder*="giảm giá hệ thống"], input[placeholder*="platform voucher"]').first();
    await platformVoucherInput.fill('EV8FEPLAT20');
    const platformVoucherApplyBtn = page.locator('button:has-text("Áp dụng"), button:has-text("Apply")').last();
    await platformVoucherApplyBtn.click();
    await page.waitForTimeout(2000);

    // Apply Platform Shipping Voucher
    console.log('Applying Platform Shipping Voucher EV8FESHIP5...');
    await platformVoucherInput.fill('EV8FESHIP5');
    await platformVoucherApplyBtn.click();
    await page.waitForTimeout(2000);

    // Check Coins Redeemed if checkbox exists
    console.log('Checking Stuffy Coins Redemption...');
    const coinsCheckbox = page.locator('input[id="redeem-coins-checkbox"]');
    if (await coinsCheckbox.isVisible()) {
      await coinsCheckbox.check();
      await page.waitForTimeout(2000);
    }

    // Take screenshot of Cart page after vouchers applied
    await takeStepScreenshot('6_cart_vouchers_applied');

    // Open Checkout Modal
    console.log('Opening Checkout Modal...');
    const checkoutBtn = page.locator('button:has-text("Tiến hành thanh toán"), button:has-text("Proceed to Checkout")');
    await checkoutBtn.click();
    await page.waitForSelector('input[placeholder="123 Main St"]', { timeout: 10000 });
    await takeStepScreenshot('7_checkout_modal_step1');

    // Fill Shipping Address in Modal
    console.log('Filling shipping details in Modal...');
    await page.fill('input[placeholder="123 Main St"]', '456 Le Loi St');
    await page.fill('input[placeholder="New York"]', 'Ho Chi Minh');
    await page.fill('input[placeholder="10001"]', '70000');
    await page.fill('input[placeholder="United States"]', 'Vietnam');
    await takeStepScreenshot('8_checkout_modal_address_filled');
    
    // Click Continue to Payment
    await page.click('button:has-text("Tiếp tục thanh toán"), button:has-text("Continue to Payment")');
    await page.waitForSelector('button:has-text("Pay"), button:has-text("Thanh toán")', { timeout: 10000 });
    await takeStepScreenshot('9_checkout_modal_payment_step');

    console.log('Browser test finished successfully.');
  } catch (err) {
    console.error('An error occurred during browser execution:', err);
    await takeStepScreenshot('error_failure');
    // Save HTML content for debugging
    const htmlContent = await page.content();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'failure_dom.html'), htmlContent, 'utf8');
    console.log('Saved failure_dom.html for debugging.');
    throw err;
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

runBrowserTest().catch(console.error);
