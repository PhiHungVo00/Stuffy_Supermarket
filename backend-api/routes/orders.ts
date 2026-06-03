import express, { Response } from 'express';
import { protect, admin } from '../middleware/auth';
import Order from '../models/Order';
import Product from '../models/Product';
import Shop from '../models/Shop';
import Voucher from '../models/Voucher';
import User from '../models/User';
import mongoose from 'mongoose';
import { LogisticsService } from '../services/LogisticsService';
import CoinTransaction from '../models/CoinTransaction';
import SellerWallet from '../models/SellerWallet';
import Promotion from '../models/Promotion';
import { RedisInventoryService } from '../services/RedisInventoryService';
import { DiscountEngine } from '../services/DiscountEngine';

const router = express.Router();

router.post('/', protect, async (req: any, res: Response) => {
  const { orderItems, shippingAddress, itemsPrice, taxPrice, totalPrice, paymentMethod, voucherCode, selectedCarriers } = req.body;

  if (!orderItems || orderItems.length === 0) {
    res.status(400).json({ error: 'No order items' });
    return;
  }

  const createdOrders: any[] = [];
  const decrementedItems: { productId: any; qty: number }[] = [];
  const redisDecremented: { promotionId: string; productId: string; qty: number }[] = [];
  let coinsToRedeem = 0;

  try {
    // 1. Verify stock and cache products
    const productsMap = new Map();
    for (const item of orderItems) {
      if (item.product) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(400).json({ error: `Product ${item.product} not found` });
        }
        if ((product.countInStock ?? 0) < (item.qty || 1)) {
          return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.countInStock}` });
        }
        productsMap.set(item.product.toString(), product);
      }
    }

    // 1b. Check Flash Sales & Preheat/Decrement Redis stock
    for (const item of orderItems) {
      if (item.product) {
        const product = productsMap.get(item.product.toString());
        const shopId = product?.shop;
        
        // Find if there is an active flash sale for this product
        const flashSale = await Promotion.findOne({
          shopId,
          type: 'flash_sale',
          primaryProductId: product._id,
          status: 'active',
          startsAt: { $lte: new Date() },
          endsAt: { $gte: new Date() }
        });

        if (flashSale) {
          const qty = item.qty || 1;
          const promoIdStr = flashSale._id.toString();
          const prodIdStr = product._id.toString();
          
          let redisResult = await RedisInventoryService.decrementInventory(promoIdStr, prodIdStr, qty);
          
          if (redisResult === -1) {
            // Not preheated in Redis yet. Preheat using current MongoDB product stock, then retry decrement.
            const currentStock = product.countInStock ?? 0;
            await RedisInventoryService.preheatInventory(promoIdStr, prodIdStr, currentStock);
            redisResult = await RedisInventoryService.decrementInventory(promoIdStr, prodIdStr, qty);
          }
          
          if (redisResult === -2) {
            // Insufficient stock in Redis
            // Before rejecting, clean up any already decremented Redis stocks
            for (const dec of redisDecremented) {
              await RedisInventoryService.rollbackInventory(dec.promotionId, dec.productId, dec.qty);
            }
            return res.status(400).json({ error: `Insufficient stock for Flash Sale product: ${product.name}` });
          }
          
          // Decrement succeeded in Redis
          redisDecremented.push({ promotionId: promoIdStr, productId: prodIdStr, qty });
        }
      }
    }

    // 2. Group items by shop ID
    const shopGroupsMap = new Map<string, any[]>();
    for (const item of orderItems) {
      const prod = productsMap.get(item.product.toString());
      const shopIdStr = prod?.shop ? prod.shop.toString() : 'default_shop';
      if (!shopGroupsMap.has(shopIdStr)) {
        shopGroupsMap.set(shopIdStr, []);
      }
      shopGroupsMap.get(shopIdStr)!.push(item);
    }

    // 3. Find default shop if there is a fallback default_shop group
    let defaultShop: any = null;
    if (shopGroupsMap.has('default_shop')) {
      defaultShop = await Shop.findOne({ name: 'Default Shop' });
      if (!defaultShop) {
        const defaultUser = await User.findOne({ role: 'admin' });
        const defaultUserId = defaultUser ? defaultUser._id : req.user._id;
        defaultShop = await Shop.create({
          name: 'Default Shop',
          owner: defaultUserId,
          description: 'Default Stuffy Supermarket Shop',
          tenantId: 'default_store'
        });
      }
    }

    // 4. Retrieve Vouchers if passed
    let platformVoucher: any = null;
    if (voucherCode) {
      platformVoucher = await Voucher.findOne({ code: voucherCode.toUpperCase(), isActive: true, scope: 'platform' });
    }
    let shopVoucher: any = null;
    if (req.body.shopVoucherCode) {
      shopVoucher = await Voucher.findOne({ code: req.body.shopVoucherCode.toUpperCase(), isActive: true, scope: 'shop' });
    }

    const totalItemsPrice = orderItems.reduce((acc: number, item: any) => acc + (item.price * (item.qty || 1)), 0);
    
    let platformDiscount = 0;
    let platformFreeShipping = false;

    if (platformVoucher) {
      if (platformVoucher.type === 'shipping') {
        platformFreeShipping = true;
      } else {
        if (platformVoucher.discountType === 'percentage') {
          platformDiscount = totalItemsPrice * (platformVoucher.discountValue / 100);
          if (platformVoucher.maxDiscount > 0) {
            platformDiscount = Math.min(platformDiscount, platformVoucher.maxDiscount);
          }
        } else {
          platformDiscount = platformVoucher.discountValue;
        }
      }
    }

    // Generate parentOrderId
    const parentOrderId = new mongoose.Types.ObjectId().toString();

    // Coins redemption calculation
    coinsToRedeem = 0;
    if (req.body.redeemCoins && req.body.redeemCoins > 0) {
      const dbUser = await User.findById(req.user._id);
      const userBalance = dbUser?.coinsBalance || 0;
      const maxCoins = Math.floor(totalItemsPrice * 0.25);
      coinsToRedeem = Math.min(Number(req.body.redeemCoins), userBalance, maxCoins);

      if (coinsToRedeem > 0) {
        await User.findByIdAndUpdate(req.user._id, { $inc: { coinsBalance: -coinsToRedeem } });
        await CoinTransaction.create({
          user: req.user._id,
          amount: -coinsToRedeem,
          type: 'spend',
          isCredited: true
        });
      }
    }

    // 5. Create Order document for each shop group
    for (const [shopIdStr, items] of shopGroupsMap.entries()) {
      const currentShopId = shopIdStr === 'default_shop' ? defaultShop._id : shopIdStr;
      const shopDoc = shopIdStr === 'default_shop' ? defaultShop : await Shop.findById(currentShopId);

      // Fetch active promotions for this shop
      const activePromotions = await Promotion.find({
        shopId: currentShopId,
        status: 'active',
        startsAt: { $lte: new Date() },
        endsAt: { $gte: new Date() }
      });

      // Map shop items for Stackable Discount input
      const discountInputItems = items.map(item => {
        const prod = productsMap.get(item.product.toString());
        return {
          product: item.product.toString(),
          originalPrice: prod?.price || item.price,
          price: item.price,
          qty: item.qty || 1
        };
      });

      // Calculate stackable discount
      const discountResult = DiscountEngine.calculateStackableDiscount({
        items: discountInputItems,
        activePromotions,
        shopVoucher,
        platformVoucher,
        totalPlatformItemsPrice: totalItemsPrice
      });

      // Update item prices to the campaign-adjusted prices returned by DiscountEngine
      for (const item of items) {
        const adjustedItem = discountResult.items.find(di => di.product === item.product.toString());
        if (adjustedItem) {
          item.price = adjustedItem.price;
        }
      }

      const groupItemsPrice = items.reduce((acc: number, item: any) => acc + (item.price * (item.qty || 1)), 0);
      const groupWeightGrams = items.reduce((acc: number, item: any) => acc + ((item.qty || 1) * 1000), 0);
      
      let groupShippingFee = 10; // Default shipping fee per shop
      let groupDiscount = discountResult.shopVoucherDiscount + discountResult.campaignDiscount;

      const carrierCode = selectedCarriers && selectedCarriers[currentShopId.toString()]
        ? selectedCarriers[currentShopId.toString()]
        : 'ghn';

      if (platformVoucher) {
        if (platformFreeShipping) {
          groupShippingFee = 0;
        } else {
          // Platform discount computed by DiscountEngine is already allocated proportionally
          groupDiscount += discountResult.platformVoucherDiscount;
        }
      }

      if (groupShippingFee !== 0) {
        try {
          groupShippingFee = await LogisticsService.calculateShippingFee({
            carrierCode,
            originProvince: shopDoc?.province || 'Hồ Chí Minh',
            originDistrict: shopDoc?.district || 'Quận Thủ Đức',
            destProvince: shippingAddress.city || 'Hồ Chí Minh',
            destDistrict: shippingAddress.address || 'Quận 1',
            weightGrams: groupWeightGrams,
            valueAmt: groupItemsPrice
          });
        } catch (err: any) {
          console.warn('[Orders] Shipping calculation error, falling back to 10:', err.message);
          groupShippingFee = 10;
        }
      }

      if (shopVoucher && shopVoucher.shopId && shopVoucher.shopId.toString() === currentShopId.toString()) {
        if (groupItemsPrice >= (shopVoucher.minOrderValue || 0)) {
          if (shopVoucher.type === 'shipping') {
            groupShippingFee = 0;
          }
        }
      }

      // Proportional Coins discount calculation
      const groupCoinsDiscount = totalItemsPrice > 0 ? (groupItemsPrice / totalItemsPrice) * coinsToRedeem : 0;

      // Calculate group tax: proportional to itemsPrice
      const effectiveTaxPrice = (taxPrice !== undefined && taxPrice !== null) ? Number(taxPrice) : (totalItemsPrice * 0.15);
      const groupTaxPrice = totalItemsPrice > 0 ? (groupItemsPrice / totalItemsPrice) * effectiveTaxPrice : 0;
      
      // Calculate group totalPrice
      const groupTotalPrice = Math.max(0, groupItemsPrice - groupDiscount - groupCoinsDiscount + groupShippingFee + groupTaxPrice);

      const coinsEarned = Math.floor(groupItemsPrice / 10); // 1 coin per $10 spent

      const order = new Order({
        user: req.user._id,
        shop: currentShopId,
        parentOrderId,
        orderItems: items,
        shippingAddress,
        itemsPrice: Math.round(groupItemsPrice * 100) / 100,
        shippingFee: Math.round(groupShippingFee * 100) / 100,
        shippingCarrier: carrierCode,
        taxPrice: Math.round(groupTaxPrice * 100) / 100,
        totalPrice: Math.round(groupTotalPrice * 100) / 100,
        paymentMethod,
        coinsRedeemed: Math.round(groupCoinsDiscount * 100) / 100,
        coinsEarned: coinsEarned
      });

      const savedOrder = await order.save();
      createdOrders.push(savedOrder);

      // Create a pending coin earn transaction
      if (coinsEarned > 0) {
        await CoinTransaction.create({
          user: req.user._id,
          amount: coinsEarned,
          type: 'earn',
          isCredited: false,
          orderId: savedOrder._id
        });
      }
    }

    // 6. Perform stock decrement atomically
    for (const item of orderItems) {
      if (item.product) {
        const qty = item.qty || 1;
        const result = await Product.findOneAndUpdate(
          { _id: item.product, countInStock: { $gte: qty } },
          { $inc: { countInStock: -qty } }
        );
        if (!result) {
          throw new Error(`Stock depleted for product ${item.product} during order processing. Order rolled back.`);
        }
        decrementedItems.push({ productId: item.product, qty });
      }
    }

    // 7. Update Seller Wallet pending escrow
    for (const savedOrder of createdOrders) {
      let wallet = await SellerWallet.findOne({ shopId: savedOrder.shop });
      if (!wallet) {
        wallet = new SellerWallet({
          shopId: savedOrder.shop,
          balance: 0,
          pendingEscrow: 0,
          currency: 'USD',
          transactions: []
        });
      }
      wallet.pendingEscrow = Math.round((wallet.pendingEscrow + savedOrder.totalPrice) * 100) / 100;
      await wallet.save();
    }

    res.status(201).json(createdOrders[0]);
  } catch (error: any) {
    console.error('[Orders] Error saving order:', error.message);

    // Rollback: Restore Redis stock
    for (const dec of redisDecremented) {
      try {
        await RedisInventoryService.rollbackInventory(dec.promotionId, dec.productId, dec.qty);
      } catch (rollbackErr: any) {
        console.error(`[Orders] Failed to restore Redis stock for product ${dec.productId}:`, rollbackErr.message);
      }
    }
    
    // Rollback: Restore coins
    if (coinsToRedeem > 0) {
      try {
        await User.findByIdAndUpdate(req.user._id, { $inc: { coinsBalance: coinsToRedeem } });
        await CoinTransaction.create({
          user: req.user._id,
          amount: coinsToRedeem,
          type: 'refund',
          isCredited: true
        });
      } catch (rollbackErr: any) {
        console.error(`[Orders] Failed to restore coins for user ${req.user._id}:`, rollbackErr.message);
      }
    }

    // Rollback: Restore stock
    for (const decItem of decrementedItems) {
      try {
        await Product.findByIdAndUpdate(decItem.productId, {
          $inc: { countInStock: decItem.qty }
        });
      } catch (rollbackErr: any) {
        console.error(`[Orders] Failed to restore stock for product ${decItem.productId}:`, rollbackErr.message);
      }
    }

    // Rollback: Delete orders and decrement wallet pending escrow
    for (const ord of createdOrders) {
      try {
        await Order.deleteOne({ _id: ord._id });
        await CoinTransaction.deleteOne({ orderId: ord._id }); // cleanup pending earn transaction
        
        const wallet = await SellerWallet.findOne({ shopId: ord.shop });
        if (wallet) {
          wallet.pendingEscrow = Math.max(0, Math.round((wallet.pendingEscrow - ord.totalPrice) * 100) / 100);
          await wallet.save();
        }
      } catch (rollbackErr: any) {
        console.error(`[Orders] Failed to delete order ${ord._id}:`, rollbackErr.message);
      }
    }

    res.status(400).json({ error: error.message || 'Server error creating order' });
  }
});

router.post('/shipping-fee', protect, async (req: any, res: Response) => {
  const { orderItems, shippingAddress, selectedCarriers } = req.body;

  if (!orderItems || orderItems.length === 0) {
    res.status(400).json({ error: 'No items provided' });
    return;
  }

  try {
    const productsMap = new Map();
    for (const item of orderItems) {
      const productId = item.product || item.id || item._id;
      if (productId) {
        const product = await Product.findById(productId);
        if (!product) {
          return res.status(400).json({ error: `Product ${productId} not found` });
        }
        productsMap.set(productId.toString(), product);
      }
    }

    const shopGroupsMap = new Map<string, any[]>();
    for (const item of orderItems) {
      const productId = item.product || item.id || item._id;
      const prod = productsMap.get(productId.toString());
      const shopIdStr = prod?.shop ? prod.shop.toString() : 'default_shop';
      if (!shopGroupsMap.has(shopIdStr)) {
        shopGroupsMap.set(shopIdStr, []);
      }
      shopGroupsMap.get(shopIdStr)!.push(item);
    }

    let defaultShop: any = null;
    if (shopGroupsMap.has('default_shop')) {
      defaultShop = await Shop.findOne({ name: 'Default Shop' });
      if (!defaultShop) {
        const defaultUser = await User.findOne({ role: 'admin' });
        const defaultUserId = defaultUser ? defaultUser._id : req.user._id;
        defaultShop = await Shop.create({
          name: 'Default Shop',
          owner: defaultUserId,
          description: 'Default Stuffy Supermarket Shop',
          tenantId: 'default_store'
        });
      }
    }

    const shippingFees: Record<string, number> = {};

    for (const [shopIdStr, items] of shopGroupsMap.entries()) {
      const groupItemsPrice = items.reduce((acc: number, item: any) => acc + (item.price * (item.qty || item.quantity || 1)), 0);
      const groupWeightGrams = items.reduce((acc: number, item: any) => acc + ((item.qty || item.quantity || 1) * 1000), 0);

      const currentShopId = shopIdStr === 'default_shop' ? defaultShop._id : shopIdStr;
      const shopDoc = shopIdStr === 'default_shop' ? defaultShop : await Shop.findById(currentShopId);

      const carrierCode = selectedCarriers && selectedCarriers[currentShopId.toString()]
        ? selectedCarriers[currentShopId.toString()]
        : 'ghn';

      let fee = 10;
      try {
        fee = await LogisticsService.calculateShippingFee({
          carrierCode,
          originProvince: shopDoc?.province || 'Hồ Chí Minh',
          originDistrict: shopDoc?.district || 'Quận Thủ Đức',
          destProvince: (shippingAddress && shippingAddress.city) || 'Hồ Chí Minh',
          destDistrict: (shippingAddress && shippingAddress.address) || 'Quận 1',
          weightGrams: groupWeightGrams,
          valueAmt: groupItemsPrice
        });
      } catch (err: any) {
        console.warn('[Orders] Shipping calculation error, falling back to 10:', err.message);
        fee = 10;
      }

      shippingFees[currentShopId.toString()] = Math.round(fee * 100) / 100;
    }

    res.json({ shippingFees });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error calculating shipping fee' });
  }
});

router.get('/myorders', protect, async (req: any, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user._id }).populate('shop').sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Server error getting orders' });
  }
});

router.get('/', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Not authorized. Admin or Seller role required.' });
    }

    const page = Number(req.query.page) || 1;
    const pageSize = 10;
    const status = req.query.status as string;

    const query: any = status && status !== 'All' ? { status } : {};
    
    if (req.user.role === 'seller') {
      const myShop = await Shop.findOne({ owner: req.user._id });
      if (!myShop) {
        return res.status(400).json({ error: 'Seller does not have a shop' });
      }
      query.shop = myShop._id;
    }

    const count = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('user', 'name email')
      .populate('shop')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    res.json({ orders, page, pages: Math.ceil(count / pageSize), total: count });
  } catch (error) {
    res.status(500).json({ error: 'Server error getting orders' });
  }
});

router.get('/:id', protect, async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email').populate('shop');
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      if (req.user.role === 'seller') {
        const myShop = await Shop.findOne({ owner: req.user._id });
        if (!myShop || order.shop?._id.toString() !== myShop._id.toString()) {
          return res.status(403).json({ error: 'Not authorized to view this order' });
        }
      } else {
        return res.status(403).json({ error: 'Not authorized to view this order' });
      }
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Server error getting order' });
  }
});

router.put('/:id/status', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Not authorized. Admin or Seller role required.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (req.user.role === 'seller') {
      const myShop = await Shop.findOne({ owner: req.user._id });
      if (!myShop || order.shop?.toString() !== myShop._id.toString()) {
        return res.status(403).json({ error: 'Sellers can only manage orders of their own shop' });
      }
    }

    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const previousStatus = order.status;
    order.status = status;
    if (status === 'Delivered' && previousStatus !== 'Delivered') {
      order.isPaid = true;
      order.deliveredAt = new Date();
      const coinsEarned = order.coinsEarned || 0;
      if (coinsEarned > 0) {
        await User.findByIdAndUpdate(order.user, { $inc: { coinsBalance: coinsEarned } });
        await CoinTransaction.findOneAndUpdate(
          { orderId: order._id, type: 'earn' },
          { isCredited: true }
        );
      }
    }

    if (status === 'Canceled' && previousStatus !== 'Canceled') {
      for (const item of order.orderItems) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { countInStock: item.qty || 1 }
          });
        }
      }

      // Refund spent coins
      const coinsRedeemed = order.coinsRedeemed || 0;
      if (coinsRedeemed > 0) {
        await User.findByIdAndUpdate(order.user, { $inc: { coinsBalance: coinsRedeemed } });
        await CoinTransaction.create({
          user: order.user,
          amount: coinsRedeemed,
          type: 'refund',
          isCredited: true,
          orderId: order._id
        });
      }

      // Cancel pending earned coins
      await CoinTransaction.deleteOne({ orderId: order._id, type: 'earn', isCredited: false });

      // Escrow Refund: if escrow is currently held, release it back to refund status
      if (order.escrowStatus === 'held') {
        order.escrowStatus = 'refunded';
        const wallet = await SellerWallet.findOne({ shopId: order.shop });
        if (wallet) {
          wallet.pendingEscrow = Math.max(0, Math.round((wallet.pendingEscrow - order.totalPrice) * 100) / 100);
          wallet.transactions.push({
            amount: -order.totalPrice,
            type: 'refund',
            description: `Escrow refunded for canceled order ${order._id}`,
            orderId: order._id,
            createdAt: new Date()
          });
          await wallet.save();
        }
      }
    }

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating order status' });
  }
});

// Confirm Order Received & Release Escrow
router.put('/:id/receive', protect, async (req: any, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.user.toString() !== req.user._id.toString()) {
      res.status(401).json({ error: 'Not authorized to confirm this order' });
      return;
    }
    if (order.status !== 'Delivered') {
      res.status(400).json({ error: 'Order must be delivered before confirming receipt' });
      return;
    }
    if (order.escrowStatus !== 'held') {
      res.status(400).json({ error: `Order escrow is already in ${order.escrowStatus} status` });
      return;
    }

    order.escrowStatus = 'released';
    order.escrowReleasedAt = new Date();
    await order.save();

    let wallet = await SellerWallet.findOne({ shopId: order.shop });
    if (!wallet) {
      wallet = new SellerWallet({
        shopId: order.shop,
        balance: 0,
        pendingEscrow: 0,
        currency: 'USD',
        transactions: []
      });
    }

    wallet.pendingEscrow = Math.max(0, Math.round((wallet.pendingEscrow - order.totalPrice) * 100) / 100);
    wallet.balance = Math.round((wallet.balance + order.totalPrice) * 100) / 100;
    wallet.transactions.push({
      amount: order.totalPrice,
      type: 'escrow_payout',
      description: `Escrow payout released for order ${order._id}`,
      orderId: order._id,
      createdAt: new Date()
    });
    await wallet.save();

    res.json({ message: 'Order received and funds released to seller wallet', order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Request Return/Refund & Halt Auto-Release
router.post('/:id/refund-request', protect, async (req: any, res: Response) => {
  const { reason } = req.body;
  if (!reason) {
    res.status(400).json({ error: 'Reason for return/refund is required' });
    return;
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.user.toString() !== req.user._id.toString()) {
      res.status(401).json({ error: 'Not authorized to request refund for this order' });
      return;
    }
    if (order.status !== 'Delivered' && order.status !== 'Shipped') {
      res.status(400).json({ error: 'Refunds can only be requested for shipped or delivered orders' });
      return;
    }
    if (order.escrowStatus !== 'held') {
      res.status(400).json({ error: `Order escrow is already in ${order.escrowStatus} status` });
      return;
    }

    order.escrowStatus = 'disputed';
    order.returnRequestReason = reason;
    await order.save();

    res.json({ message: 'Dispute submitted. Escrow funds locked.', order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Seller accepts/rejects return/refund dispute
router.put('/:id/dispute/respond', protect, async (req: any, res: Response) => {
  const { action } = req.body; // 'accept' or 'reject'
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be 'accept' or 'reject'." });
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify user owns the shop (or is admin)
    if (req.user.role !== 'admin') {
      const shop = await Shop.findOne({ owner: req.user._id });
      if (!shop || order.shop.toString() !== shop._id.toString()) {
        return res.status(403).json({ error: 'Not authorized to manage disputes for this shop' });
      }
    }

    if (order.escrowStatus !== 'disputed') {
      return res.status(400).json({ error: 'Order is not in disputed status' });
    }

    if (action === 'accept') {
      order.escrowStatus = 'refunded';
      order.status = 'Canceled';
      await order.save();

      // Escrow Refund: subtract from seller wallet pendingEscrow and refund buyer
      const wallet = await SellerWallet.findOne({ shopId: order.shop });
      if (wallet) {
        wallet.pendingEscrow = Math.max(0, Math.round((wallet.pendingEscrow - order.totalPrice) * 100) / 100);
        wallet.transactions.push({
          amount: -order.totalPrice,
          type: 'refund',
          description: `Dispute accepted by seller. Escrow refunded to buyer.`,
          orderId: order._id,
          createdAt: new Date()
        });
        await wallet.save();
      }

      // Rollback products stock
      for (const item of order.orderItems) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { countInStock: item.qty || 1 }
          });
        }
      }

      // Refund spent coins
      const coinsRedeemed = order.coinsRedeemed || 0;
      if (coinsRedeemed > 0) {
        await User.findByIdAndUpdate(order.user, { $inc: { coinsBalance: coinsRedeemed } });
        await CoinTransaction.create({
          user: order.user,
          amount: coinsRedeemed,
          type: 'refund',
          isCredited: true,
          orderId: order._id
        });
      }

      // Cancel pending earned coins
      await CoinTransaction.deleteOne({ orderId: order._id, type: 'earn', isCredited: false });

      return res.json({ message: 'Dispute accepted and buyer refunded successfully', order });
    } else {
      // Seller rejects dispute -> moves escrow to dispute_rejected, waiting for admin mediation
      order.escrowStatus = 'dispute_rejected';
      await order.save();

      return res.json({ message: 'Dispute rejected by seller. Escalating to admin mediation.', order });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin mediates and resolves the dispute
router.put('/:id/dispute/resolve', protect, admin, async (req: any, res: Response) => {
  const { decision } = req.body; // 'refund_buyer' or 'release_to_seller'
  if (!['refund_buyer', 'release_to_seller'].includes(decision)) {
    return res.status(400).json({ error: "Invalid decision. Must be 'refund_buyer' or 'release_to_seller'." });
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.escrowStatus !== 'disputed' && order.escrowStatus !== 'dispute_rejected') {
      return res.status(400).json({ error: 'Order escrow is not in a dispute state' });
    }

    if (decision === 'refund_buyer') {
      order.escrowStatus = 'refunded';
      order.status = 'Canceled';
      await order.save();

      // Escrow Refund: subtract from seller wallet pendingEscrow and refund buyer
      const wallet = await SellerWallet.findOne({ shopId: order.shop });
      if (wallet) {
        wallet.pendingEscrow = Math.max(0, Math.round((wallet.pendingEscrow - order.totalPrice) * 100) / 100);
        wallet.transactions.push({
          amount: -order.totalPrice,
          type: 'refund',
          description: `Dispute resolved by admin: refund to buyer.`,
          orderId: order._id,
          createdAt: new Date()
        });
        await wallet.save();
      }

      // Rollback products stock
      for (const item of order.orderItems) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { countInStock: item.qty || 1 }
          });
        }
      }

      // Refund spent coins
      const coinsRedeemed = order.coinsRedeemed || 0;
      if (coinsRedeemed > 0) {
        await User.findByIdAndUpdate(order.user, { $inc: { coinsBalance: coinsRedeemed } });
        await CoinTransaction.create({
          user: order.user,
          amount: coinsRedeemed,
          type: 'refund',
          isCredited: true,
          orderId: order._id
        });
      }

      // Cancel pending earned coins
      await CoinTransaction.deleteOne({ orderId: order._id, type: 'earn', isCredited: false });

      return res.json({ message: 'Dispute resolved: buyer refunded successfully', order });
    } else {
      // Release to seller
      order.escrowStatus = 'released';
      order.escrowReleasedAt = new Date();
      await order.save();

      let wallet = await SellerWallet.findOne({ shopId: order.shop });
      if (!wallet) {
        wallet = new SellerWallet({
          shopId: order.shop,
          balance: 0,
          pendingEscrow: 0,
          currency: 'USD',
          transactions: []
        });
      }

      wallet.pendingEscrow = Math.max(0, Math.round((wallet.pendingEscrow - order.totalPrice) * 100) / 100);
      wallet.balance = Math.round((wallet.balance + order.totalPrice) * 100) / 100;
      wallet.transactions.push({
        amount: order.totalPrice,
        type: 'escrow_payout',
        description: `Dispute resolved by admin: escrow payout released to seller wallet`,
        orderId: order._id,
        createdAt: new Date()
      });
      await wallet.save();

      return res.json({ message: 'Dispute resolved: escrow funds released to seller wallet', order });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
