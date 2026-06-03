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
