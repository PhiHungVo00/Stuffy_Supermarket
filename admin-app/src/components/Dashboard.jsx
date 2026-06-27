import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
// @ts-ignore
import { useI18nStore } from 'store/i18n';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const API_BASE = isProduction ? 'https://stuffy-backend-api.onrender.com' : 'http://localhost:5000';

export default function Dashboard({ products }) {
  const { t } = useI18nStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('admin');
  const [forecastData, setForecastData] = useState(null);

  useEffect(() => {
    const userInfoString = localStorage.getItem('userInfo');
    if (userInfoString) {
      const { token, role } = JSON.parse(userInfoString);
      setUserRole(role || 'admin');

      // Fetch normal orders
      fetch(`${API_BASE}/api/orders?pageSize=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

      // Fetch AI analytics forecast
      fetch(`${API_BASE}/api/analytics/forecast`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setForecastData(data);
        }
      })
      .catch(() => {});
    } else {
      setLoading(false);
    }
  }, []);

  // Compute normal weekly stats
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const revenueByDay = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  orders.forEach(order => {
    if (order.status !== 'Canceled') {
      const date = new Date(order.createdAt);
      const dayName = daysOfWeek[date.getDay()];
      if (revenueByDay[dayName] !== undefined) {
        revenueByDay[dayName] += order.totalPrice || 0;
      }
    }
  });

  // Setup main trend chart data (incorporating historical and forecast if available)
  let salesData = null;

  if (forecastData && forecastData.historical && forecastData.forecast) {
    // Show last 7 days of history + 7 days of forecast
    const historyLast7 = forecastData.historical.slice(-7);
    const forecast = forecastData.forecast;

    const combinedLabels = [
      ...historyLast7.map(h => {
        const parts = h.date.split('-');
        return `${parts[1]}/${parts[2]}`; // MM/DD
      }),
      ...forecast.map(f => {
        const parts = f.date.split('-');
        return `${parts[1]}/${parts[2]} (AI)`; // MM/DD (AI)
      })
    ];

    const historyPoints = [...historyLast7.map(h => h.revenue), ...Array(forecast.length).fill(null)];
    
    // Connect forecast line starting from the last historical point
    const lastHistoryVal = historyLast7[historyLast7.length - 1].revenue;
    const forecastPoints = [
      ...Array(historyLast7.length - 1).fill(null),
      lastHistoryVal,
      ...forecast.map(f => f.revenue)
    ];

    salesData = {
      labels: combinedLabels,
      datasets: [
        {
          label: t('admin_historical_revenue'),
          data: historyPoints,
          borderColor: userRole === 'seller' ? 'rgb(16, 185, 129)' : 'rgb(99, 102, 241)',
          backgroundColor: userRole === 'seller' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: t('admin_ai_revenue'),
          data: forecastPoints,
          borderColor: 'rgb(245, 158, 11)',
          borderDash: [5, 5],
          backgroundColor: 'rgba(245, 158, 11, 0.05)',
          fill: false,
          tension: 0.4,
        }
      ]
    };
  } else {
    // Fallback if forecast API fails/not loaded
    const realRevenue = labels.map(day => Math.round(revenueByDay[day] * 100) / 100);
    const totalRevenue = realRevenue.reduce((sum, val) => sum + val, 0);
    const mockRevenue = userRole === 'seller' 
      ? [200, 450, 600, 1100, 500, 800, 1200] 
      : [1200, 1900, 3000, 5000, 2300, 3400, 4500];

    salesData = {
      labels,
      datasets: [{
        label: t('admin_revenue'),
        data: totalRevenue > 0 ? realRevenue : mockRevenue,
        borderColor: userRole === 'seller' ? 'rgb(16, 185, 129)' : 'rgb(99, 102, 241)',
        backgroundColor: userRole === 'seller' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      }]
    };
  }

  const categoryCount = products.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  const categoryData = {
    labels: Object.keys(categoryCount).length > 0 ? Object.keys(categoryCount) : ['No Products'],
    datasets: [{
      data: Object.values(categoryCount).length > 0 ? Object.values(categoryCount) : [1],
      backgroundColor: [
        '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'
      ],
      hoverOffset: 12
    }]
  };

  // Mocking funnel sessions
  const behaviourData = {
    labels: [t('admin_funnel_home'), t('admin_funnel_search'), t('admin_funnel_cart'), t('admin_funnel_ar'), t('admin_funnel_checkout')],
    datasets: [{
      label: t('admin_user_sessions'),
      data: userRole === 'seller' ? [1200, 800, 350, 210, 110] : [4200, 3100, 1200, 800, 400],
      backgroundColor: userRole === 'seller' ? 'rgba(16, 185, 129, 0.7)' : 'rgba(168, 85, 247, 0.7)',
      borderRadius: 12
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 8 } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { borderDash: [5, 5] } }
    }
  };

  return (
    <div style={{ marginBottom: '40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        {/* Sales Chart with AI Forecast */}
        <div style={{ 
          background: 'white', padding: '24px', borderRadius: '18px', border: '1px solid var(--border-light)',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
        }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {userRole === 'seller' ? t('admin_chart_forecast_seller') : t('admin_chart_forecast_admin')}
          </h4>
          <div style={{ height: '220px' }}>
            <Line data={salesData} options={chartOptions} />
          </div>
        </div>

        {/* User Behaviour */}
        <div style={{ 
          background: 'white', padding: '24px', borderRadius: '18px', border: '1px solid var(--border-light)',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
        }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {userRole === 'seller' ? t('admin_chart_funnel_seller') : t('admin_chart_funnel_admin')}
          </h4>
          <div style={{ height: '220px' }}>
            <Bar data={behaviourData} options={chartOptions} />
          </div>
        </div>

        {/* Inventory Split */}
        <div style={{ 
          background: 'white', padding: '24px', borderRadius: '18px', border: '1px solid var(--border-light)',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
        }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {userRole === 'seller' ? t('admin_chart_split_seller') : t('admin_chart_split_admin')}
          </h4>
          <div style={{ height: '220px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut data={categoryData} options={{ ...chartOptions, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
          </div>
        </div>

      </div>
    </div>
  );
}
