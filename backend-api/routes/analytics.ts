import express, { Response } from 'express';
import { protect } from '../middleware/auth';
import Shop from '../models/Shop';
import Order from '../models/Order';

const router = express.Router();

// GET /api/analytics/forecast - Get 30-day historical revenue and 7-day AI forecast
router.get('/forecast', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Seller or Admin role required.' });
    }

    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found for this seller' });
    }

    // 1. Calculate 30-day daily historical revenue
    const historicalDays = 30;
    const historicalData: Array<{ date: string; revenue: number }> = [];
    const now = new Date();

    // Initialize daily slots
    for (let i = historicalDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      historicalData.push({ date: dateStr, revenue: 0 });
    }

    // Query paid/non-canceled orders for the shop in the last 30 days
    const startDate = new Date();
    startDate.setDate(now.getDate() - (historicalDays - 1));
    startDate.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      shop: shop._id,
      status: { $ne: 'Canceled' },
      createdAt: { $gte: startDate }
    });

    orders.forEach(order => {
      const dateStr = new Date(order.createdAt as Date).toISOString().split('T')[0];
      const slot = historicalData.find(h => h.date === dateStr);
      if (slot) {
        slot.revenue += order.totalPrice || 0;
      }
    });

    // Round historical values
    historicalData.forEach(h => {
      h.revenue = Math.round(h.revenue * 100) / 100;
    });

    // Check if we have any historical sales
    const totalSales = historicalData.reduce((sum, h) => sum + h.revenue, 0);

    // Fallback: If no real sales, generate realistic mock sales trend for forecasting
    if (totalSales === 0) {
      // Create a nice baseline mock trend
      historicalData.forEach((h, index) => {
        // Base value around 100, adding weekly seasonality (peaks on Wed/Fri) and noise
        const dayOfWeek = new Date(h.date).getDay();
        const seasonality = (dayOfWeek === 3 || dayOfWeek === 5) ? 80 : 20;
        const trend = index * 1.5; // Slight upward trend
        const randomNoise = Math.floor(Math.random() * 30);
        h.revenue = Math.max(10, Math.round((80 + seasonality + trend + randomNoise) * 100) / 100);
      });
    }

    // 2. Perform Linear Regression Forecasting (projecting next 7 days)
    // Points (x, y) where x is index 0..29, y is revenue
    const n = historicalData.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let x = 0; x < n; x++) {
      const y = historicalData[x].revenue;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    // Calculate slope (m) and intercept (c)
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 3. Generate 7-day forecast
    const forecastDays = 7;
    const forecastData: Array<{ date: string; revenue: number }> = [];

    for (let i = 1; i <= forecastDays; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      
      const x = n + i - 1; // Future index (e.g., 30..36)
      let forecastedRevenue = slope * x + intercept;
      
      // Ensure we don't return negative revenue
      forecastedRevenue = Math.max(0, Math.round(forecastedRevenue * 100) / 100);
      forecastData.push({ date: dateStr, revenue: forecastedRevenue });
    }

    res.json({
      historical: historicalData,
      forecast: forecastData,
      slope,
      intercept,
      usingFallbackData: totalSales === 0
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error processing revenue forecast' });
  }
});

export default router;
