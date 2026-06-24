import express, { Response } from 'express';
import { protect, admin, authorize } from '../middleware/auth';
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

/**
 * Lỗi nghiệp vụ tường minh khi trừ tồn kho có điều kiện trong transaction thất bại
 * (sản phẩm không còn đủ kho tại thời điểm trừ). Ném lỗi này trong callback của
 * session.withTransaction(...) để abort transaction.
 *
 * Mang `productId` và cờ nhận diện `isInsufficientStockError` để task 2.6 ánh xạ
 * sang HTTP 400 mà không phụ thuộc vào việc so khớp chuỗi thông báo lỗi.
 */
class InsufficientStockError extends Error {
  public readonly isInsufficientStockError = true;
  public readonly productId: any;

  constructor(productId: any) {
    // Giữ thông báo tương đương hành vi hiện tại để không phá vỡ hợp đồng API đối ngoại
    super(`Stock depleted for product ${productId} during order processing. Order rolled back.`);
    this.name = 'InsufficientStockError';
    this.productId = productId;
    // Khôi phục prototype chain khi compile target ES5 (an toàn ở mọi target)
    Object.setPrototypeOf(this, InsufficientStockError.prototype);
  }
}

/**
 * Phát hiện dấu hiệu lỗi "thiếu replica set" của MongoDB khi cố chạy transaction
 * trên môi trường single-node. MongoDB báo lỗi `IllegalOperation: Transaction
 * numbers are only allowed on a replica set member or mongos`.
 *
 * Nhận diện qua `codeName === 'IllegalOperation'` HOẶC thông điệp chứa các dấu
 * hiệu đặc trưng, để không phụ thuộc cứng vào một dạng chuỗi duy nhất.
 */
function isReplicaSetMissingError(error: any): boolean {
  if (!error) return false;
  if (error.codeName === 'IllegalOperation') return true;
  const message: string = error.message || '';
  return (
    message.includes('replica set member or mongos') ||
    message.includes('Transaction numbers are only allowed')
  );
}

/**
 * Ánh xạ lỗi (sau khi withTransaction thất bại / abort) sang { status, message }
 * để trả response HTTP nhất quán. Phân loại:
 *  - Thiếu replica set → 500 với thông báo cấu hình rõ ràng.
 *  - InsufficientStockError (cờ isInsufficientStockError) → 400 giữ nguyên message.
 *  - Lỗi khác → 400 với error.message hoặc 'Server error creating order'.
 */
function mapErrorToResponse(error: any): { status: number; message: string } {
  if (isReplicaSetMissingError(error)) {
    return {
      status: 500,
      message: 'Server misconfiguration: MongoDB transactions require a replica set.',
    };
  }
  if (error && error.isInsufficientStockError) {
    return { status: 400, message: error.message };
  }
  return { status: 400, message: (error && error.message) || 'Server error creating order' };
}

const router = express.Router();

router.post('/', protect, async (req: any, res: Response) => {
  const { orderItems, shippingAddress, itemsPrice, taxPrice, totalPrice, paymentMethod, voucherCode, selectedCarriers, shippingVoucherCode } = req.body;

  if (!orderItems || orderItems.length === 0) {
    res.status(400).json({ error: 'No order items' });
    return;
  }

  let createdOrders: any[] = [];
  const redisDecremented: { promotionId: string; productId: string; qty: number }[] = [];
  let coinsToRedeem = 0;

  try {
    // 1. Verify stock and cache products
    const productsMap = new Map();
    for (const item of orderItems) {
      if (item.product) {
        // 🔒 SECURITY FIX: Sanitize and strictly validate quantity
        item.qty = Math.floor(Number(item.qty)) || 1;
        if (item.qty <= 0) {
          return res.status(400).json({ error: `Số lượng sản phẩm không hợp lệ (mã SP: ${item.product})` });
        }

        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(400).json({ error: `Product ${item.product} not found` });
        }

        // 🔒 SECURITY FIX: Override client's price with trusted Database price
        item.price = product.price;

        if ((product.countInStock ?? 0) < item.qty) {
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
    // 🔒 SECURITY FIX: Prevent Infinite Voucher Usage and Expired Vouchers
    const getVoucherQuery = (code: string, extraConditions: any) => ({
      code: code.toUpperCase(),
      isActive: true,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ['$usedCount', '$usageLimit'] },
      claimedBy: { $ne: req.user._id }, // Prevent same user from using it multiple times
      ...extraConditions
    });

    let platformVoucher: any = null;
    if (voucherCode) {
      platformVoucher = await Voucher.findOne(getVoucherQuery(voucherCode, { scope: 'platform' }));
      if (platformVoucher && platformVoucher.isLivestreamExclusive && !req.body.fromLivestream) {
        return res.status(400).json({ error: `Voucher ${voucherCode} is only valid for purchases from livestream` });
      }
    }
    let shopVoucher: any = null;
    if (req.body.shopVoucherCode) {
      shopVoucher = await Voucher.findOne(getVoucherQuery(req.body.shopVoucherCode, { scope: 'shop' }));
      if (shopVoucher && shopVoucher.isLivestreamExclusive && !req.body.fromLivestream) {
        return res.status(400).json({ error: `Voucher ${req.body.shopVoucherCode} is only valid for purchases from livestream` });
      }
    }
    let shippingVoucher: any = null;
    if (shippingVoucherCode) {
      shippingVoucher = await Voucher.findOne(getVoucherQuery(shippingVoucherCode, { scope: 'platform', type: 'shipping' }));
      if (shippingVoucher && shippingVoucher.isLivestreamExclusive && !req.body.fromLivestream) {
        return res.status(400).json({ error: `Voucher ${shippingVoucherCode} is only valid for purchases from livestream` });
      }
    }

    // Split platformVoucher to support multi-tier stackable logic
    let platformDiscountVoucher: any = null;
    let platformShippingVoucher: any = null;

    if (platformVoucher) {
      if (platformVoucher.type === 'shipping') {
        platformShippingVoucher = platformVoucher;
      } else {
        platformDiscountVoucher = platformVoucher;
      }
    }

    if (shippingVoucher) {
      platformShippingVoucher = shippingVoucher;
    }

    const totalItemsPrice = orderItems.reduce((acc: number, item: any) => acc + (item.price * (item.qty || 1)), 0);
    
    let platformDiscount = 0;

    if (platformDiscountVoucher) {
      if (platformDiscountVoucher.discountType === 'percentage') {
        platformDiscount = totalItemsPrice * (platformDiscountVoucher.discountValue / 100);
        if (platformDiscountVoucher.maxDiscount > 0) {
          platformDiscount = Math.min(platformDiscount, platformDiscountVoucher.maxDiscount);
        }
      } else {
        platformDiscount = platformDiscountVoucher.discountValue;
      }
    }

    // Generate parentOrderId
    const parentOrderId = new mongoose.Types.ObjectId().toString();

    let remainingShippingDiscount = 0;
    let platformShippingVoucherApplied = false;
    let accumulatedShippingDiscount = 0;
    if (platformShippingVoucher && totalItemsPrice >= (platformShippingVoucher.minOrderValue || 0)) {
      platformShippingVoucherApplied = true;
      if (platformShippingVoucher.discountType === 'fixed') {
        remainingShippingDiscount = platformShippingVoucher.discountValue;
      } else if (platformShippingVoucher.discountType === 'percentage') {
        // will calculate proportionally per group
      } else {
        remainingShippingDiscount = Infinity;
      }
    }

    // Coins redemption calculation (compute only — the MongoDB write is deferred to the
    // transaction phase in task 2.2, so it stays out of the read/compute prep section)
    coinsToRedeem = 0;
    if (req.body.redeemCoins && req.body.redeemCoins > 0) {
      const dbUser = await User.findById(req.user._id);
      const userBalance = dbUser?.coinsBalance || 0;
      const maxCoins = Math.floor(totalItemsPrice * 0.25);
      coinsToRedeem = Math.min(Number(req.body.redeemCoins), userBalance, maxCoins);
    }

    // 5. Prepare an Order payload for each shop group (READ/COMPUTE only — no DB writes here).
    // All discount/shipping/price computation happens before the transaction boundary so the
    // transaction callback (task 2.2) stays short and is safe to retry.
    const preparedOrders: { coinsEarned: number; orderData: any }[] = [];
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
      const isMyShopVoucher = shopVoucher && shopVoucher.shopId && shopVoucher.shopId.toString() === currentShopId.toString();
      const discountResult = DiscountEngine.calculateStackableDiscount({
        items: discountInputItems,
        activePromotions,
        shopVoucher: isMyShopVoucher ? shopVoucher : undefined,
        platformVoucher: platformDiscountVoucher,
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
      const groupWeightGrams = items.reduce((acc: number, item: any) => {
        const prod = productsMap.get(item.product.toString());
        return acc + ((item.qty || 1) * (prod?.weight ?? 200));
      }, 0);
      
      let groupShippingFee = 10; // Default shipping fee per shop
      let groupDiscount = discountResult.shopVoucherDiscount + discountResult.campaignDiscount;

      const carrierCode = selectedCarriers && selectedCarriers[currentShopId.toString()]
        ? selectedCarriers[currentShopId.toString()]
        : 'ghn';

      if (platformDiscountVoucher) {
        // Platform discount computed by DiscountEngine is already allocated proportionally
        groupDiscount += discountResult.platformVoucherDiscount;
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

      let shopShippingFree = false;
      if (shopVoucher && shopVoucher.shopId && shopVoucher.shopId.toString() === currentShopId.toString()) {
        if (groupItemsPrice >= (shopVoucher.minOrderValue || 0)) {
          if (shopVoucher.type === 'shipping') {
            shopShippingFree = true;
            groupShippingFee = 0;
          }
        }
      }

      if (!shopShippingFree && platformShippingVoucherApplied && groupShippingFee > 0) {
        let shippingDiscountForGroup = 0;
        if (platformShippingVoucher.discountType === 'percentage') {
          shippingDiscountForGroup = groupShippingFee * (platformShippingVoucher.discountValue / 100);
          if (platformShippingVoucher.maxDiscount > 0) {
            const allowedRemaining = Math.max(0, platformShippingVoucher.maxDiscount - accumulatedShippingDiscount);
            shippingDiscountForGroup = Math.min(shippingDiscountForGroup, allowedRemaining);
          }
        } else {
          shippingDiscountForGroup = Math.min(groupShippingFee, remainingShippingDiscount);
          remainingShippingDiscount -= shippingDiscountForGroup;
        }
        accumulatedShippingDiscount += shippingDiscountForGroup;
        groupShippingFee = Math.max(0, groupShippingFee - shippingDiscountForGroup);
      }

      // Proportional Coins discount calculation
      const groupCoinsDiscount = totalItemsPrice > 0 ? (groupItemsPrice / totalItemsPrice) * coinsToRedeem : 0;

      // Calculate group tax: proportional to itemsPrice
      const effectiveTaxPrice = (taxPrice !== undefined && taxPrice !== null) ? Number(taxPrice) : (totalItemsPrice * 0.15);
      const groupTaxPrice = totalItemsPrice > 0 ? (groupItemsPrice / totalItemsPrice) * effectiveTaxPrice : 0;
      
      // Calculate group totalPrice
      const groupTotalPrice = Math.max(0, groupItemsPrice - groupDiscount - groupCoinsDiscount + groupShippingFee + groupTaxPrice);

      const coinsEarned = Math.floor(groupItemsPrice / 10); // 1 coin per $10 spent

      // Calculate real estimated delivery date based on location distance
      const shopProvince = (shopDoc?.province || 'Hồ Chí Minh').toLowerCase().trim();
      const destCity = (shippingAddress.city || 'Hồ Chí Minh').toLowerCase().trim();
      const isSameCity = shopProvince === destCity || 
                         shopProvince.includes(destCity) || 
                         destCity.includes(shopProvince) ||
                         (shopProvince.includes('hồ chí minh') && destCity.includes('hcm')) ||
                         (shopProvince.includes('hcm') && destCity.includes('hồ chí minh'));
      
      const deliveryDays = isSameCity ? 2 : 4;
      const estimatedDate = new Date();
      estimatedDate.setDate(estimatedDate.getDate() + deliveryDays);

      // Prepare the order payload (COMPUTE only — persisted inside the transaction in task 2.2)
      preparedOrders.push({
        coinsEarned,
        orderData: {
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
          coinsEarned: coinsEarned,
          estimatedDeliveryDate: estimatedDate
        }
      });
    }

    // ================================================================
    // BẮT ĐẦU TRANSACTION Ở ĐÂY  (task 2.2)
    // ----------------------------------------------------------------
    // Mọi thao tác phía TRÊN chỉ là đọc/validate/tính toán + trừ tồn kho
    // Redis flash sale (ngoài transaction MongoDB). Mọi thao tác GHI
    // MongoDB phía DƯỚI (trừ coins, tạo Order, trừ tồn kho Product, cập
    // nhật SellerWallet) sẽ được task 2.2 bọc trong
    // session.withTransaction(...) để đảm bảo tính nguyên tử.
    // ================================================================

    // Bọc toàn bộ thao tác GHI MongoDB trong một transaction duy nhất.
    // withTransaction có thể chạy lại callback khi gặp TransientTransactionError,
    // nên callback CHỈ chứa thao tác MongoDB và phải reset mọi biến tích lũy ở đầu.
    // Side-effect Redis (đã trừ phía trên) KHÔNG được đặt trong callback.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Reset trạng thái tích lũy để an toàn khi withTransaction retry
        createdOrders = [];

        // 🔒 SECURITY FIX: Atomic Voucher Usage Tracking
        const vouchersToUpdate = [platformVoucher, shopVoucher, shippingVoucher]
          .filter(v => v)
          .filter((v, index, self) => self.findIndex(t => t._id.toString() === v._id.toString()) === index);
        
        for (const voucher of vouchersToUpdate) {
          const updated = await Voucher.findOneAndUpdate(
            { _id: voucher._id, $expr: { $lt: ['$usedCount', '$usageLimit'] } },
            { $inc: { usedCount: 1 }, $push: { claimedBy: req.user._id } },
            { session, new: true }
          );
          if (!updated) {
            throw new Error(`Voucher ${voucher.code} is no longer available or usage limit reached.`);
          }
        }

        // (1) Trừ User.coinsBalance + ghi CoinTransaction spend (khi có redeem)
        // 🔒 SECURITY FIX: Atomic Coin Balance Update to prevent Race Condition
        if (coinsToRedeem > 0) {
          const updatedUser = await User.findOneAndUpdate(
            { _id: req.user._id, coinsBalance: { $gte: coinsToRedeem } },
            { $inc: { coinsBalance: -coinsToRedeem } },
            { session, new: true }
          );
          if (!updatedUser) {
            throw new Error('Insufficient coins balance or balance changed during processing.');
          }
          // Model.create([...], { session }) phải nhận MẢNG để truyền options session đúng cách
          await CoinTransaction.create([{
            user: req.user._id,
            amount: -coinsToRedeem,
            type: 'spend',
            isCredited: true
          }], { session });
        }

        // (2) Tạo các Order đã chuẩn bị + CoinTransaction earn (pending)
        for (const prepared of preparedOrders) {
          const order = new Order(prepared.orderData);
          const savedOrder = await order.save({ session });
          createdOrders.push(savedOrder);

          // Create a pending coin earn transaction
          if (prepared.coinsEarned > 0) {
            await CoinTransaction.create([{
              user: req.user._id,
              amount: prepared.coinsEarned,
              type: 'earn',
              isCredited: false,
              orderId: savedOrder._id
            }], { session });
          }
        }

        // 6. Trừ tồn kho có điều kiện (atomically) — TRONG transaction (task 2.3)
        // Trừ chỉ khi countInStock >= qty; nếu không đủ → throw InsufficientStockError
        // để abort transaction (withTransaction tự hoàn tác mọi ghi MongoDB).
        for (const item of orderItems) {
          if (item.product) {
            const qty = item.qty || 1;
            const result = await Product.findOneAndUpdate(
              { _id: item.product, countInStock: { $gte: qty } },
              { $inc: { countInStock: -qty } },
              { session, new: true }
            );
            if (!result) {
              throw new InsufficientStockError(item.product);
            }
          }
        }

        // 7. Update Seller Wallet pending escrow (task 2.4)
        // Dùng findOneAndUpdate $inc với { session, upsert: true } thay cho đọc-sửa-ghi:
        // - an toàn cạnh tranh (tăng nguyên tử trên server, không đọc-rồi-ghi)
        // - upsert tạo ví nếu chưa tồn tại (thay nhánh new SellerWallet); các trường mặc định
        //   (balance, currency) được Mongoose áp dụng nhờ setDefaultsOnInsert (mặc định bật).
        // savedOrder.totalPrice đã được làm tròn 2 chữ số ở orderData.totalPrice nên $inc trực
        // tiếp giữ hành vi tương đương (pendingEscrow tăng đúng tổng totalPrice).
        for (const savedOrder of createdOrders) {
          await SellerWallet.findOneAndUpdate(
            { shopId: savedOrder.shop },
            { $inc: { pendingEscrow: savedOrder.totalPrice } },
            { session, new: true, upsert: true }
          );
        }
      });

      res.status(201).json(createdOrders[0]);
    } finally {
      await session.endSession();
    }
  } catch (error: any) {
    console.error('[Orders] Error saving order:', error.message);

    // Bù trừ thủ công CHỈ cho Redis (thao tác flash sale nằm NGOÀI transaction MongoDB).
    // Các thao tác ghi MongoDB (coins, Order, tồn kho Product, SellerWallet) đã được
    // session.withTransaction tự abort nguyên tử — KHÔNG cần (và không được) hoàn tác thủ công.
    // Chạy TRƯỚC khi phân loại/ánh xạ lỗi để Redis luôn được hoàn về trạng thái nhất quán.
    for (const dec of redisDecremented) {
      try {
        await RedisInventoryService.rollbackInventory(dec.promotionId, dec.productId, dec.qty);
      } catch (rollbackErr: any) {
        // Req 3.3: chỉ ghi log, không làm hỏng phản hồi trả về client
        console.error(`[Orders] Failed to restore Redis stock for product ${dec.productId}:`, rollbackErr.message);
      }
    }

    // Phân loại và ánh xạ lỗi → HTTP (task 2.6).
    // Lưu ý: transaction đã abort nên DB sạch, không có trạng thái ghi nửa vời.
    if (isReplicaSetMissingError(error)) {
      // Req 5.2: dấu hiệu thiếu replica set → cảnh báo cấu hình vận hành rõ ràng
      console.error(
        '[Orders] MongoDB transaction failed: server is not running as a replica set. ' +
        'Transactions require MongoDB to be configured as a replica set (e.g. --replSet rs0).'
      );
    }

    const { status, message } = mapErrorToResponse(error);
    res.status(status).json({ error: message });
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
      const groupWeightGrams = items.reduce((acc: number, item: any) => {
        const productId = item.product || item.id || item._id;
        const prod = productsMap.get(productId.toString());
        return acc + ((item.qty || item.quantity || 1) * (prod?.weight ?? 200));
      }, 0);

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

router.get('/', protect, authorize('admin', 'seller'), async (req: any, res: Response) => {
  try {

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

router.get('/reconciliation/report', protect, authorize('admin', 'seller'), async (req: any, res: Response) => {
  try {

    let query: any = {};
    if (req.user.role === 'seller') {
      const myShop = await Shop.findOne({ owner: req.user._id });
      if (!myShop) {
        return res.status(400).json({ error: 'Seller does not have a shop' });
      }
      query.shop = myShop._id;
    }

    const orders = await Order.find(query).populate('shop').sort({ createdAt: -1 });

    // Build CSV content
    let csv = 'Order ID,Date,Items Price,Shipping Fee,Tax Price,Total Price,Status,Escrow Status,Payment Method,Is Paid\n';
    
    for (const order of orders) {
      const dateStr = order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '';
      csv += `"${order._id}","${dateStr}",${order.itemsPrice},${order.shippingFee},${order.taxPrice},${order.totalPrice},"${order.status}","${order.escrowStatus || 'held'}","${order.paymentMethod}",${order.isPaid}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=reconciliation_report.csv');
    res.status(200).send(csv);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error generating reconciliation report: ' + error.message });
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

router.put('/:id/status', protect, authorize('admin', 'seller'), async (req: any, res: Response) => {
  try {

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

    // 🔒 SECURITY FIX: Prevent Status Forgery
    if (status === 'Delivered' && req.user.role === 'seller') {
      return res.status(403).json({ error: 'Sellers cannot mark orders as Delivered. Only Webhooks or Admins can do this.' });
    }

    const previousStatus = order.status;
    order.status = status;
    
    // Dispatch to 3PL carrier when moving from Pending to Processing
    if (status === 'Processing' && previousStatus === 'Pending') {
      try {
        const dispatchResult = await LogisticsService.dispatchOrderTo3PL(order.shippingCarrier || 'ghn', order);
        order.trackingNumber = dispatchResult.trackingNumber;
        order.shippingLabelUrl = dispatchResult.labelUrl;
        
        if (!order.shippingHistory) {
          order.shippingHistory = [];
        }
        order.shippingHistory.push({
          status: 'Processing',
          location: 'Stuffy Warehouse - Order Dispatched',
          timestamp: new Date()
        });
        console.log(`[Orders] Dispatched order ${order._id} to 3PL. Tracking: ${order.trackingNumber}`);
      } catch (dispatchErr: any) {
        console.error(`[Orders] Failed to dispatch order ${order._id} to 3PL:`, dispatchErr.message);
      }
    }

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
        // 🔒 SECURITY FIX: Escrow Lost Update (Refund)
        await SellerWallet.findOneAndUpdate(
          { shopId: order.shop },
          {
            $inc: { pendingEscrow: -order.totalPrice },
            $push: {
              transactions: {
                amount: -order.totalPrice,
                type: 'refund',
                description: `Escrow refunded for canceled order ${order._id}`,
                orderId: order._id,
                createdAt: new Date()
              }
            }
          }
        );
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

    // 🔒 SECURITY FIX: Escrow Lost Update (Release)
    await SellerWallet.findOneAndUpdate(
      { shopId: order.shop },
      {
        $inc: { pendingEscrow: -order.totalPrice, balance: order.totalPrice },
        $push: {
          transactions: {
            amount: order.totalPrice,
            type: 'escrow_payout',
            description: `Escrow payout released for order ${order._id}`,
            orderId: order._id,
            createdAt: new Date()
          }
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

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
      // 🔒 SECURITY FIX: Escrow Lost Update (Dispute Accepted -> Refund)
      await SellerWallet.findOneAndUpdate(
        { shopId: order.shop },
        {
          $inc: { pendingEscrow: -order.totalPrice },
          $push: {
            transactions: {
              amount: -order.totalPrice,
              type: 'refund',
              description: `Dispute accepted by seller. Escrow refunded to buyer.`,
              orderId: order._id,
              createdAt: new Date()
            }
          }
        }
      );

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
      // 🔒 SECURITY FIX: Escrow Lost Update (Admin Refund)
      await SellerWallet.findOneAndUpdate(
        { shopId: order.shop },
        {
          $inc: { pendingEscrow: -order.totalPrice },
          $push: {
            transactions: {
              amount: -order.totalPrice,
              type: 'refund',
              description: `Dispute resolved by admin: refund to buyer.`,
              orderId: order._id,
              createdAt: new Date()
            }
          }
        }
      );

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

      // 🔒 SECURITY FIX: Escrow Lost Update (Admin Release)
      await SellerWallet.findOneAndUpdate(
        { shopId: order.shop },
        {
          $inc: { pendingEscrow: -order.totalPrice, balance: order.totalPrice },
          $push: {
            transactions: {
              amount: order.totalPrice,
              type: 'escrow_payout',
              description: `Dispute resolved by admin: escrow payout released to seller wallet`,
              orderId: order._id,
              createdAt: new Date()
            }
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );

      return res.json({ message: 'Dispute resolved: escrow funds released to seller wallet', order });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
