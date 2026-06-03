import jsonLogic from 'json-logic-js';
import DiscountRule, { IDiscountRule } from '../models/DiscountRule';

export interface CartData {
  total: number;
  items: any[];
  userRole?: string;
  dayOfWeek?: number; // 0-6 (Sunday-Saturday)
}

export interface StackableDiscountInput {
  items: Array<{
    product: string;
    originalPrice: number;
    price: number;
    qty: number;
  }>;
  activePromotions: any[];
  shopVoucher?: any;
  platformVoucher?: any;
  totalPlatformItemsPrice: number;
}

export class DiscountEngine {
  /**
   * Applies all active discount rules for a given tenant to the cart.
   */
  static async calculateBestDiscount(tenantId: string, cart: CartData): Promise<{ 
    appliedRule: string | null, 
    discountAmount: number 
  }> {
    const rules = await DiscountRule.find({ tenantId, isActive: true }).sort('-priority');
    
    let bestDiscount = 0;
    let bestRule: string | null = null;

    // Enhance cart data with current context
    const context = {
      ...cart,
      dayOfWeek: new Date().getDay(),
      itemCount: cart.items.length,
      hasTech: cart.items.some(i => i.category === 'Tech')
    };

    for (const rule of rules) {
      // Evaluate Rule using JSON Logic
      const isMatch = jsonLogic.apply(rule.logic, context);
      
      if (isMatch) {
        let currentDiscount = 0;
        if (rule.discountType === 'percentage') {
          currentDiscount = (cart.total * rule.discountValue) / 100;
        } else if (rule.discountType === 'fixed') {
          currentDiscount = rule.discountValue;
        }

        if (currentDiscount > bestDiscount) {
          bestDiscount = currentDiscount;
          bestRule = rule.name;
        }
      }
    }

    return { appliedRule: bestRule, discountAmount: bestDiscount };
  }

  /**
   * Upgraded Shopee-like stackable promotion calculator
   */
  static calculateStackableDiscount(input: StackableDiscountInput): {
    items: Array<{ product: string; price: number; qty: number }>;
    campaignDiscount: number;
    shopVoucherDiscount: number;
    platformVoucherDiscount: number;
    totalDiscount: number;
    priceFloorAdjusted: boolean;
  } {
    const { items, activePromotions, shopVoucher, platformVoucher, totalPlatformItemsPrice } = input;
    
    // Create deep copies to prevent side effects
    const processedItems = items.map(item => ({
      product: item.product.toString(),
      originalPrice: item.originalPrice || item.price,
      price: item.originalPrice || item.price, // Start from original price before any promotion
      qty: item.qty || 1
    }));

    let campaignDiscount = 0;
    let priceFloorAdjusted = false;

    // 1. Base Campaign Promotions (Flash Sale, Add-On Deal)
    // A. Apply Add-On Deals
    const addonDeals = activePromotions.filter(p => p.type === 'addon_deal');
    for (const deal of addonDeals) {
      if (deal.primaryProductId && deal.addonProducts) {
        const hasPrimary = processedItems.some(item => item.product === deal.primaryProductId.toString());
        if (hasPrimary) {
          for (const item of processedItems) {
            const addonConfig = deal.addonProducts.find((ap: any) => ap.product.toString() === item.product);
            if (addonConfig) {
              const diff = item.price - addonConfig.addonPrice;
              if (diff > 0) {
                campaignDiscount += diff * item.qty;
                item.price = addonConfig.addonPrice;
              }
            }
          }
        }
      }
    }

    // B. Apply Flash Sales
    const flashSales = activePromotions.filter(p => p.type === 'flash_sale');
    for (const deal of flashSales) {
      if (deal.primaryProductId && deal.discountValue !== undefined) {
        for (const item of processedItems) {
          if (item.product === deal.primaryProductId.toString()) {
            let discountAmt = 0;
            if (deal.discountType === 'percentage') {
              discountAmt = item.price * (deal.discountValue / 100);
            } else {
              discountAmt = deal.discountValue;
            }
            campaignDiscount += discountAmt * item.qty;
            item.price = Math.max(0, item.price - discountAmt);
          }
        }
      }
    }

    // Subtotal after base campaigns
    const groupItemsPrice = processedItems.reduce((acc, item) => acc + (item.price * item.qty), 0);

    // C. Apply Bundle Deals (E.g. buy minQuantity items get discountValue off)
    let bundleDiscount = 0;
    const bundleDeals = activePromotions.filter(p => p.type === 'bundle_deal');
    const totalQty = processedItems.reduce((acc, item) => acc + item.qty, 0);
    for (const deal of bundleDeals) {
      if (deal.minQuantity && totalQty >= deal.minQuantity && deal.discountValue) {
        if (deal.discountType === 'percentage') {
          bundleDiscount += groupItemsPrice * (deal.discountValue / 100);
        } else {
          bundleDiscount += deal.discountValue;
        }
      }
    }
    campaignDiscount += bundleDiscount;

    // 2. Shop Voucher Discount
    let shopVoucherDiscount = 0;
    if (shopVoucher && groupItemsPrice >= (shopVoucher.minOrderValue || 0)) {
      if (shopVoucher.type !== 'shipping') {
        if (shopVoucher.discountType === 'percentage') {
          shopVoucherDiscount = groupItemsPrice * (shopVoucher.discountValue / 100);
          if (shopVoucher.maxDiscount > 0) {
            shopVoucherDiscount = Math.min(shopVoucherDiscount, shopVoucher.maxDiscount);
          }
        } else {
          shopVoucherDiscount = shopVoucher.discountValue;
        }
      }
    }

    // 3. Platform Voucher Discount (Proportional allocation)
    let platformVoucherDiscount = 0;
    if (platformVoucher && platformVoucher.type !== 'shipping' && totalPlatformItemsPrice > 0) {
      let totalPlatformDiscount = 0;
      if (platformVoucher.discountType === 'percentage') {
        totalPlatformDiscount = totalPlatformItemsPrice * (platformVoucher.discountValue / 100);
        if (platformVoucher.maxDiscount > 0) {
          totalPlatformDiscount = Math.min(totalPlatformDiscount, platformVoucher.maxDiscount);
        }
      } else {
        totalPlatformDiscount = platformVoucher.discountValue;
      }
      platformVoucherDiscount = (groupItemsPrice / totalPlatformItemsPrice) * totalPlatformDiscount;
    }

    // 4. Price Floor Enforcement (50% original price protection)
    // Distribute discounts (shop + bundle + platform) proportionally to verify floor limit
    const totalPromotionalDeduction = shopVoucherDiscount + bundleDiscount + platformVoucherDiscount;
    
    let verifiedPromotionalDeduction = 0;
    
    for (const item of processedItems) {
      const itemOriginalSubtotal = item.originalPrice * item.qty;
      const itemCampaignSubtotal = item.price * item.qty; // price already reduced by flash sale/addon
      
      // Proportional deduction for this item from other vouchers
      const itemProportionalDeduction = groupItemsPrice > 0 
        ? (itemCampaignSubtotal / groupItemsPrice) * totalPromotionalDeduction 
        : 0;

      const finalItemSubtotal = itemCampaignSubtotal - itemProportionalDeduction;
      const minAllowedSubtotal = itemOriginalSubtotal * 0.5;

      if (finalItemSubtotal < minAllowedSubtotal) {
        priceFloorAdjusted = true;
        // Cap the deduction to allow exactly 50% price
        const maxDeduction = itemCampaignSubtotal - minAllowedSubtotal;
        verifiedPromotionalDeduction += Math.max(0, maxDeduction);
      } else {
        verifiedPromotionalDeduction += itemProportionalDeduction;
      }
    }

    // Recalculate adjusted voucher totals
    const finalTotalDiscount = campaignDiscount + verifiedPromotionalDeduction;

    return {
      items: processedItems.map(item => ({ product: item.product, price: item.price, qty: item.qty })),
      campaignDiscount,
      shopVoucherDiscount: totalPromotionalDeduction > 0 ? (shopVoucherDiscount / totalPromotionalDeduction) * verifiedPromotionalDeduction : 0,
      platformVoucherDiscount: totalPromotionalDeduction > 0 ? (platformVoucherDiscount / totalPromotionalDeduction) * verifiedPromotionalDeduction : 0,
      totalDiscount: finalTotalDiscount,
      priceFloorAdjusted
    };
  }
}

