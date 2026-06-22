const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const mongoURI = 'mongodb://localhost:27017/stuffy_db';

const ShopSchema = new mongoose.Schema({
  name: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  password: String
});

const Shop = mongoose.model('Shop', ShopSchema);
const User = mongoose.model('User', UserSchema);

async function run() {
  try {
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB.');

    const shops = await Shop.find({}).populate('owner');
    console.log(`\n=== DANH SÃCH Cá»¬A HÃ€NG VÃ€ CHá»¦ Sá»ž Há»®U ===`);
    
    const hashedPassword = await bcrypt.hash('password123', 10);

    for (const shop of shops) {
      console.log(`\nShop: ${shop.name}`);
      console.log(`- Shop ID: ${shop._id}`);
      if (shop.owner) {
        console.log(`- Owner Name: ${shop.owner.name}`);
        console.log(`- Owner Email: ${shop.owner.email}`);
        console.log(`- Owner Role: ${shop.owner.role}`);
        
        // Reset password to password123
        shop.owner.password = hashedPassword;
        await shop.owner.save();
        console.log(`- Owner Password reset to: password123`);
      } else {
        console.log(`- Owner: NULL (No owner linked)`);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed.');
  }
}

run();