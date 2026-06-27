const mongoose = require('mongoose');

async function run() {
  const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/stuffy_db';
  await mongoose.connect(mongoURI);
  
  const Promotion = mongoose.model('Promotion', new mongoose.Schema({}, { strict: false }));
  const promotions = await Promotion.find({});
  console.log('Promotions count:', promotions.length);
  console.log(JSON.stringify(promotions, null, 2));
  
  const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
  const products = await Product.find({});
  console.log('Products count:', products.length);
  console.log(JSON.stringify(products.map(p => ({ id: p._id, name: p.name, shop: p.shop })), null, 2));
  
  await mongoose.disconnect();
}

run().catch(console.error);
