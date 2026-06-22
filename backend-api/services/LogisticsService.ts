import axios from 'axios';

export interface ICalculateShippingInput {
  carrierCode: string;
  originProvince: string;
  originDistrict: string;
  destProvince: string;
  destDistrict: string;
  weightGrams: number;
  valueAmt: number;
}

export interface ILogisticsStrategy {
  calculateFee(input: Omit<ICalculateShippingInput, 'carrierCode'>): Promise<number>;
  dispatchOrderTo3PL(order: any): Promise<{ trackingNumber: string; labelUrl?: string }>;
}

// Master Data Helper resolvers for Sandbox APIs
class SandboxResolver {
  public static async resolveGhnDistrictId(districtName: string, provinceName: string): Promise<number | null> {
    const dLower = districtName.toLowerCase();
    if (dLower.includes('thủ đức') || dLower.includes('thu duc')) return 1454;
    if (dLower.includes('quận 1') || dLower.includes('quan 1')) return 1442;
    if (dLower.includes('cầu giấy') || dLower.includes('cau giay')) return 3440;
    return null;
  }

  public static async resolveViettelProvinceId(provinceName: string): Promise<number> {
    const pLower = provinceName.toLowerCase();
    if (pLower.includes('hà nội') || pLower.includes('ha noi')) return 1;
    if (pLower.includes('hồ chí minh') || pLower.includes('ho chi minh') || pLower.includes('hcm')) return 79;
    return 79;
  }

  public static async resolveViettelDistrictId(districtName: string): Promise<number> {
    const dLower = districtName.toLowerCase();
    if (dLower.includes('cầu giấy') || dLower.includes('cau giay')) return 1;
    if (dLower.includes('thủ đức') || dLower.includes('thu duc')) return 760;
    return 760;
  }
}

// GHN Strategy
export class GhnStrategy implements ILogisticsStrategy {
  public async calculateFee(input: Omit<ICalculateShippingInput, 'carrierCode'>): Promise<number> {
    if (!process.env.GHN_TOKEN) throw new Error('Missing GHN Token');
    const url = 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee';
    const fromDistrictId = 1454;
    const toDistrictId = await SandboxResolver.resolveGhnDistrictId(input.destDistrict, input.destProvince);

    const response = await axios.post(
      url,
      {
        from_district_id: fromDistrictId,
        to_district_id: toDistrictId || 1454,
        weight: input.weightGrams,
        service_id: 53320,
        insurance_value: input.valueAmt
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Token': process.env.GHN_TOKEN
        }
      }
    );
    if (response.data && response.data.data && response.data.data.total) {
      const feeVnd = response.data.data.total;
      return Math.round((feeVnd / 25000) * 100) / 100;
    }
    throw new Error('Invalid GHN API response structure');
  }

  public async dispatchOrderTo3PL(order: any): Promise<{ trackingNumber: string; labelUrl?: string }> {
    if (!process.env.GHN_TOKEN || process.env.GHN_TOKEN === 'mock_token') {
      throw new Error('Missing or mock GHN Token');
    }
    
    // Call GHN Sandbox create order API
    const url = 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create';
    const response = await axios.post(
      url,
      {
        payment_type_id: 2, // Buyer pays shipping
        note: "Giao hang sieu thi Stuffy",
        required_note: "KHONGCHOXEMHANG",
        to_name: order.shippingAddress.address,
        to_phone: "0909999999",
        to_address: `${order.shippingAddress.address}, ${order.shippingAddress.city}`,
        to_ward_code: "20308", // Ward mapping code (District 1 Ward)
        to_district_id: 1442,
        weight: 1000,
        length: 10,
        width: 10,
        height: 10,
        service_id: 53320,
        pickup_time: Math.floor(Date.now() / 1000) + 3600
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Token': process.env.GHN_TOKEN,
          'ShopId': '80000' // Sandbox shop id
        }
      }
    );

    if (response.data && response.data.data && response.data.data.order_code) {
      return {
        trackingNumber: response.data.data.order_code,
        labelUrl: `https://dev-online-gateway.ghn.vn/a5/public-api/printA5?token=${response.data.data.order_code}`
      };
    }
    throw new Error('Invalid GHN Dispatch API response');
  }
}

// GHTK Strategy
export class GhtkStrategy implements ILogisticsStrategy {
  public async calculateFee(input: Omit<ICalculateShippingInput, 'carrierCode'>): Promise<number> {
    if (!process.env.GHTK_TOKEN) throw new Error('Missing GHTK Token');
    const url = 'https://services-staging.ghtklab.com/services/shipment/fee';
    const response = await axios.get(url, {
      headers: {
        'Token': process.env.GHTK_TOKEN
      },
      params: {
        pick_province: input.originProvince || 'Hồ Chí Minh',
        pick_district: input.originDistrict || 'Quận Thủ Đức',
        province: input.destProvince,
        district: input.destDistrict,
        weight: input.weightGrams,
        value: input.valueAmt,
        deliver_option: 'none'
      }
    });
    if (response.data && response.data.fee && response.data.fee.fee) {
      const feeVnd = response.data.fee.fee;
      return Math.round((feeVnd / 25000) * 100) / 100;
    }
    throw new Error('Invalid GHTK API response structure');
  }

  public async dispatchOrderTo3PL(order: any): Promise<{ trackingNumber: string; labelUrl?: string }> {
    if (!process.env.GHTK_TOKEN || process.env.GHTK_TOKEN === 'mock_token') {
      throw new Error('Missing or mock GHTK Token');
    }

    const url = 'https://services-staging.ghtklab.com/services/shipment/order';
    const response = await axios.post(
      url,
      {
        products: [{ name: 'Stuffy Supermarket Product', quantity: 1, weight: 1.0 }],
        order: {
          id: order._id.toString(),
          pick_name: "Stuffy Warehouse",
          pick_money: 0,
          pick_address: "123 Warehouse Rd",
          pick_province: "Hồ Chí Minh",
          pick_district: "Thủ Đức",
          name: "Buyer Customer",
          phone: "0909999999",
          address: order.shippingAddress.address,
          province: order.shippingAddress.city,
          district: order.shippingAddress.city,
          email: "customer@test.com",
          value: order.totalPrice
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Token': process.env.GHTK_TOKEN
        }
      }
    );

    if (response.data && response.data.success && response.data.order && response.data.order.label) {
      return {
        trackingNumber: response.data.order.label,
        labelUrl: `https://services-staging.ghtklab.com/admin/print/label?code=${response.data.order.label}`
      };
    }
    throw new Error('Invalid GHTK Dispatch API response');
  }
}

// Viettel Post Strategy
export class ViettelPostStrategy implements ILogisticsStrategy {
  public async calculateFee(input: Omit<ICalculateShippingInput, 'carrierCode'>): Promise<number> {
    if (!process.env.VIETTELPOST_TOKEN) throw new Error('Missing Viettel Post Token');
    const url = 'https://partner.viettelpost.vn/v2/order/getPrice';
    const response = await axios.post(
      url,
      {
        SENDER_PROVINCE: 79,
        SENDER_DISTRICT: 760,
        RECEIVER_PROVINCE: await SandboxResolver.resolveViettelProvinceId(input.destProvince),
        RECEIVER_DISTRICT: await SandboxResolver.resolveViettelDistrictId(input.destDistrict),
        PRODUCT_WEIGHT: input.weightGrams,
        PRODUCT_PRICE: input.valueAmt,
        PRODUCT_TYPE: 'HH',
        TYPE: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Token': process.env.VIETTELPOST_TOKEN
        }
      }
    );
    if (response.data && response.data.status === 200 && response.data.data && response.data.data.GIA_CUOC) {
      const feeVnd = response.data.data.GIA_CUOC;
      return Math.round((feeVnd / 25000) * 100) / 100;
    }
    throw new Error('Invalid Viettel Post API response structure');
  }

  public async dispatchOrderTo3PL(order: any): Promise<{ trackingNumber: string; labelUrl?: string }> {
    if (!process.env.VIETTELPOST_TOKEN || process.env.VIETTELPOST_TOKEN === 'mock_token') {
      throw new Error('Missing or mock Viettel Post Token');
    }

    const url = 'https://partner.viettelpost.vn/v2/order/createOrder';
    const response = await axios.post(
      url,
      {
        ORDER_NUMBER: order._id.toString(),
        SENDER_NAME: "Stuffy Supermarket",
        SENDER_PHONE: "0909999999",
        SENDER_ADDRESS: "123 Warehouse Rd, Thu Duc",
        RECEIVER_NAME: "Customer",
        RECEIVER_PHONE: "0909999999",
        RECEIVER_ADDRESS: order.shippingAddress.address,
        PRODUCT_NAME: "Stuffy Goods",
        PRODUCT_WEIGHT: 1000,
        PRODUCT_TYPE: "HH",
        TYPE: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Token': process.env.VIETTELPOST_TOKEN
        }
      }
    );

    if (response.data && response.data.status === 200 && response.data.data && response.data.data.ORDER_NUMBER) {
      return {
        trackingNumber: response.data.data.ORDER_NUMBER,
        labelUrl: `https://partner.viettelpost.vn/print?order=${response.data.data.ORDER_NUMBER}`
      };
    }
    throw new Error('Invalid Viettel Post Dispatch API response');
  }
}

// Logistics Strategy Factory & Orchestrator
export class LogisticsService {
  private static strategies: Record<string, ILogisticsStrategy> = {
    ghn: new GhnStrategy(),
    ghtk: new GhtkStrategy(),
    viettelpost: new ViettelPostStrategy()
  };

  /**
   * Calculates the shipping fee using Giao Hàng Nhanh, Giao Hàng Tiết Kiệm, or Viettel Post APIs.
   * Leverages the Strategy Pattern to execute API calls dynamically, falling back to a mock calculation.
   */
  public static async calculateShippingFee(input: ICalculateShippingInput): Promise<number> {
    const normalizedCarrier = input.carrierCode.toLowerCase();
    const strategy = this.strategies[normalizedCarrier];

    if (strategy) {
      try {
        return await strategy.calculateFee(input);
      } catch (err: any) {
        console.warn(`[LogisticsService] Strategy for ${normalizedCarrier} failed. Falling back to mock. Error:`, err.message);
      }
    } else {
      console.warn(`[LogisticsService] No strategy found for carrier: ${normalizedCarrier}. Falling back to mock.`);
    }

    return this.calculateMockShippingFee(input);
  }

  /**
   * Dispatches order and registers it with the selected 3PL carrier.
   * Returns a real tracking number from sandbox or a mock fallback tracking number.
   */
  public static async dispatchOrderTo3PL(carrierCode: string, order: any): Promise<{ trackingNumber: string; labelUrl?: string }> {
    const normalizedCarrier = carrierCode.toLowerCase();
    const strategy = this.strategies[normalizedCarrier];

    if (strategy) {
      try {
        return await strategy.dispatchOrderTo3PL(order);
      } catch (err: any) {
        console.warn(`[LogisticsService] Dispatch strategy for ${normalizedCarrier} failed. Falling back to mock. Error:`, err.message);
      }
    } else {
      console.warn(`[LogisticsService] No dispatch strategy found for carrier: ${normalizedCarrier}. Falling back to mock.`);
    }

    return this.dispatchMockOrder(normalizedCarrier, order);
  }

  private static dispatchMockOrder(carrierCode: string, order: any): { trackingNumber: string; labelUrl?: string } {
    const randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
    const carrier = carrierCode.toUpperCase();
    return {
      trackingNumber: `STUFFY_${carrier}_${randomSuffix}`,
      labelUrl: `https://stuffy-supermarket.com/shipping-labels/${carrierCode}/${order._id}.pdf`
    };
  }

  private static calculateMockShippingFee(input: ICalculateShippingInput): number {
    const { carrierCode, originProvince, destProvince, weightGrams } = input;
    const isSameProvince = originProvince.toLowerCase().trim() === destProvince.toLowerCase().trim();
    const distanceMiles = isSameProvince ? 10 : 350;
    
    const baseRates: Record<string, number> = {
      ghn: 8.0,
      ghtk: 7.5,
      viettelpost: 9.0
    };

    const base = baseRates[carrierCode.toLowerCase()] || 8.0;
    const distanceCharge = distanceMiles * 0.02;
    const weightCharge = (weightGrams / 1000) * 0.40;

    const totalFee = base + distanceCharge + weightCharge;
    return Math.round(totalFee * 100) / 100;
  }
}
