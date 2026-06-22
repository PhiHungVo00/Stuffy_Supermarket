const mongoose = require('mongoose');

const mongoURI = 'mongodb://localhost:27017/stuffy_db';

const OrderSchema = new mongoose.Schema({
  parentOrderId: String,
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  orderItems: [{
    name: String,
    qty: Number,
    image: String,
    price: Number,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }
  }],
  itemsPrice: Number,
  shippingFee: Number,
  totalPrice: Number,
  status: String,
  createdAt: Date
});

const ShopSchema = new mongoose.Schema({
  name: String
});

const Order = mongoose.model('Order', OrderSchema);
const Shop = mongoose.model('Shop', ShopSchema);

async function run() {
  try {
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB.');

    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('shop', 'name');

    console.log(`\n=== 5 ÄÆ N HÃ€NG Má»šI NHáº¤T TRÃŠN Há»† THá»NG ===`);
    orders.forEach((o, i) => {
      console.log(`\nÄÆ¡n hÃ ng #${i + 1}:`);
      console.log(`- ID: ${o._id}`);
      console.log(`- Parent Order ID (TÃ¡ch Ä‘Æ¡n): ${o.parentOrderId || 'KhÃ´ng cÃ³ (ÄÆ¡n láº»)'}`);
      console.log(`- Cá»­a hÃ ng (Shop): ${o.shop ? o.shop.name : 'Unknown Shop'} (${o.shop ? o.shop._id : ''})`);
      console.log(`- Tiá»n hÃ ng (itemsPrice): $${o.itemsPrice}`);
      console.log(`- PhÃ­ váº­n chuyá»ƒn (shippingFee): $${o.shippingFee}`);
      console.log(`- Tá»•ng thanh toÃ¡n (totalPrice): $${o.totalPrice}`);
      console.log(`- Sáº£n pháº©m mua:`);
      o.orderItems.forEach(item => {
        console.log(`  + ${item.name} (SL: ${item.qty}, GiÃ¡: $${item.price})`);
      });
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed.');
  }
}

run();