import express, { Request, Response } from 'express';
import { protect } from '../middleware/auth';
import Product from '../models/Product';
import Shop from '../models/Shop';
import Order from '../models/Order';
import Outbox from '../models/Outbox';
import { clearCache } from '../redis';
import { pubsub } from '../rabbitmq';

const router = express.Router();

// GET /api/products
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default_store';
    const pageSize = Number(req.query.pageSize) || 8;
    const page = Number(req.query.pageNumber) || 1;
    const keyword = req.query.keyword
      ? { name: { $regex: req.query.keyword as string, $options: 'i' } }
      : {};
    const categoryQuery = req.query.category && req.query.category !== 'All' 
      ? { category: req.query.category as string } 
      : {};

    const priceQuery: any = {};
    if (req.query.minPrice) priceQuery.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) priceQuery.$lte = Number(req.query.maxPrice);
    const priceFilter = Object.keys(priceQuery).length > 0 ? { price: priceQuery } : {};

    const ratingFilter = req.query.minRating 
      ? { rating: { $gte: Number(req.query.minRating) } } 
      : {};

    const shopFilter = req.query.shop ? { shop: req.query.shop } : {};
    const query = { ...keyword, ...categoryQuery, ...priceFilter, ...ratingFilter, ...shopFilter, tenantId };

    let sortOption: any = { createdAt: -1 };
    switch (req.query.sortBy) {
      case 'price_asc': sortOption = { price: 1 }; break;
      case 'price_desc': sortOption = { price: -1 }; break;
      case 'rating': sortOption = { rating: -1 }; break;
      case 'newest': sortOption = { createdAt: -1 }; break;
      case 'popular': sortOption = { numReviews: -1 }; break;
    }

    const count = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('variants')
      .populate('shop')
      .sort(sortOption)
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    const categories = await Product.distinct('category', { tenantId });

    res.json({
      products,
      page,
      pages: Math.ceil(count / pageSize),
      total: count,
      categories
    });
  } catch (e: any) { 
    res.status(500).json({ error: e.message }); 
  }
});

// GET /api/products/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id).populate('variants').populate('shop');
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Track user behavior for Recommendations (Collaborative Filtering)
    const userId = (req.headers['x-user-id'] as string) || 'guest_' + req.ip;
    pubsub.publish('user_behavior_tracking', { userId, productId: product._id });

    res.json(product);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/products/:id
router.put('/:id', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Not authorized. Admin or Seller role required.' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (req.user.role === 'seller') {
      const myShop = await Shop.findOne({ owner: req.user._id });
      if (!myShop || product.shop.toString() !== myShop._id.toString()) {
        return res.status(403).json({ error: 'Sellers can only modify their own products' });
      }
    }

    product.name = req.body.name ?? product.name;
    product.price = req.body.price ?? product.price;
    product.description = req.body.description ?? product.description;
    product.image = req.body.image ?? product.image;
    product.images = req.body.images ?? product.images;
    product.category = req.body.category ?? product.category;
    product.countInStock = req.body.countInStock ?? product.countInStock;
    product.variants = req.body.variants ?? product.variants;

    const updatedProduct = await product.save();
    await clearCache('products:*');
    await clearCache(`product:${req.params.id}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('PRICE_UPDATED', updatedProduct);
    }
    res.json(updatedProduct);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Not authorized. Admin or Seller role required.' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (req.user.role === 'seller') {
      const myShop = await Shop.findOne({ owner: req.user._id });
      if (!myShop || product.shop.toString() !== myShop._id.toString()) {
        return res.status(403).json({ error: 'Sellers can only delete their own products' });
      }
    }

    await Product.deleteOne({ _id: req.params.id });
    await clearCache('products:*');
    await clearCache(`product:${req.params.id}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('PRODUCT_DELETED', req.params.id);
    }
    res.json({ message: 'Product removed' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/products/:id/reviews
router.post('/:id/reviews', protect, async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const deliveredOrder = await Order.findOne({
      user: req.user._id,
      status: 'Delivered',
      'orderItems.product': req.params.id
    });
    if (!deliveredOrder) {
      return res.status(400).json({ error: 'Only verified buyers who received this product can write a review.' });
    }

    const alreadyReviewed = product.reviews?.find(
      (r: any) => r.user.toString() === req.user._id.toString()
    );
    if (alreadyReviewed) {
      return res.status(400).json({ error: 'Product already reviewed by this user' });
    }

    const review = {
      name: req.user.name,
      rating: Number(req.body.rating),
      comment: req.body.comment,
      user: req.user._id,
    };

    product.reviews = product.reviews || [];
    product.reviews.push(review as any);
    product.numReviews = product.reviews.length;
    product.rating = product.reviews.reduce((acc: number, item: any) => item.rating + acc, 0) / product.reviews.length;

    await product.save();
    await clearCache(`product:${req.params.id}`);
    await clearCache('products:*');

    res.status(201).json({ message: 'Review added' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/products
router.post('/', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Not authorized. Admin or Seller role required.' });
    }

    let shopId = req.body.shop;
    if (req.user.role === 'seller') {
      const myShop = await Shop.findOne({ owner: req.user._id });
      if (!myShop) {
        return res.status(400).json({ error: 'Seller does not have a shop' });
      }
      if (shopId && shopId.toString() !== myShop._id.toString()) {
        return res.status(403).json({ error: 'Sellers can only assign products to their own shop' });
      }
      shopId = myShop._id;
    } else {
      if (!shopId) {
        const defaultShop = await Shop.findOne({ name: 'Default Shop' });
        if (defaultShop) {
          shopId = defaultShop._id;
        } else {
          return res.status(400).json({ error: 'Shop ID is required' });
        }
      } else {
        const shop = await Shop.findById(shopId);
        if (!shop) {
          return res.status(404).json({ error: 'Shop not found' });
        }
      }
    }

    const newProduct = new Product({
        ...req.body,
        shop: shopId,
        tenantId: req.headers['x-tenant-id'] || 'default_store'
    });
    await newProduct.save();
    await clearCache('products:*'); // Invalidate listed products
    
    // Transactional Outbox Pattern: Save events to the DB first
    await Outbox.create({
      aggregateType: 'Product',
      aggregateId: newProduct._id.toString(),
      eventType: 'INVENTORY_SYNC',
      payload: newProduct
    });

    await Outbox.create({
      aggregateType: 'Product',
      aggregateId: newProduct._id.toString(),
      eventType: 'EMAIL_NOTIFICATIONS',
      payload: { to: 'admin@stuffy.com', body: `New Product Added: ${newProduct.name}` }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('NEW_PRODUCT', newProduct);
    }
    res.json(newProduct);
  } catch (e: any) { 
    res.status(500).json({ error: e.message }); 
  }
});

export default router;
