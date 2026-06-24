const mongoose = require('mongoose');

const mongoURI = 'mongodb://localhost:27017/stuffy_db';

const VoucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  type: { type: String, enum: ['shipping', 'discount', 'cashback'], required: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true },
  description: { type: String, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 },
  usageLimit: { type: Number, default: 100 },
  usedCount: { type: Number, default: 0 },
  claimedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  tenantId: { type: String, required: true, default: 'default_store' },
  scope: { type: String, enum: ['platform', 'shop'], default: 'shop' },
  shopId: { type: mongoose.Schema.Types.ObjectId }
});

const ShopSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, required: true },
  description: { type: String, default: '' },
  tenantId: { type: String, required: true, default: 'default_store' }
});

const Voucher = mongoose.model('Voucher', VoucherSchema);
const Shop = mongoose.model('Shop', ShopSchema);

async function run() {
  try {
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB.');

    // 1. Cáº­p nháº­t scope cho cÃ¡c voucher há»‡ thá»‘ng
    const systemVouchers = ['FREESHIP', 'TECH10', 'WELCOME15', 'FLASH30'];
    const updateResult = await Voucher.updateMany(
      { code: { $in: systemVouchers } },
      { $set: { scope: 'platform' } }
    );
    console.log(`Updated system vouchers to platform scope:`, updateResult);

    // 2. TÃ¬m táº¥t cáº£ cÃ¡c Shop
    const shops = await Shop.find({});
    console.log(`Found ${shops.length} shops:`);
    shops.forEach(s => console.log(`- ${s.name} (ID: ${s._id})`));

    const shop1 = shops.find(s => s.name.includes("One"));
    const shop2 = shops.find(s => s.name.includes("Two"));

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const adminUserId = new mongoose.Types.ObjectId('6a1c37711d1dde2322c5cfdc');

    // 3. Táº¡o voucher riÃªng cho Shop 1 náº¿u chÆ°a cÃ³
    if (shop1) {
      await Voucher.deleteOne({ code: 'SHOP1VOUCHER' });
      const v1 = await Voucher.create({
        code: 'SHOP1VOUCHER',
        type: 'discount',
        discountType: 'percentage',
        discountValue: 15,
        description: 'Giáº£m 15% cho sáº£n pháº©m Shop 1',
        minOrderValue: 20,
        usageLimit: 100,
        expiresAt: thirtyDaysFromNow,
        tenantId: 'default_store',
        scope: 'shop',
        shopId: shop1._id,
        claimedBy: [adminUserId]
      });
      console.log('Created SHOP1VOUCHER:', v1.code, 'for Shop:', shop1.name);
    }

    // 4. Táº¡o voucher riÃªng cho Shop 2 náº¿u chÆ°a cÃ³
    if (shop2) {
      await Voucher.deleteOne({ code: 'SHOP2VOUCHER' });
      const v2 = await Voucher.create({
        code: 'SHOP2VOUCHER',
        type: 'discount',
        discountType: 'fixed',
        discountValue: 30,
        description: 'Giáº£m $30 cho sáº£n pháº©m Shop 2',
        minOrderValue: 50,
        usageLimit: 100,
        expiresAt: thirtyDaysFromNow,
        tenantId: 'default_store',
        scope: 'shop',
        shopId: shop2._id,
        claimedBy: [adminUserId]
      });
      console.log('Created SHOP2VOUCHER:', v2.code, 'for Shop:', shop2.name);
    }

    // 5. ThÃªm admin vÃ o claimedBy cho táº¥t cáº£ voucher khÃ¡c
    const claimResult = await Voucher.updateMany(
      {},
      { $addToSet: { claimedBy: adminUserId } }
    );
    console.log(`Added admin user to claimedBy for all vouchers:`, claimResult);

    console.log('All vouchers in DB:');
    const allV = await Voucher.find({});
    allV.forEach(v => {
      console.log(`- ${v.code}: scope=${v.scope}, type=${v.type}, val=${v.discountValue}, shopId=${v.shopId}, claimedCount=${v.claimedBy.length}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

run();