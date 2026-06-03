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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('admin');

  useEffect(() => {
    const userInfoString = localStorage.getItem('userInfo');
    if (userInfoString) {
      const { token, role } = JSON.parse(userInfoString);
      setUserRole(role || 'admin');

      fetch(`${API_BASE}/api/orders?pageSize=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Compute Revenue by Day of the week
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

  const realRevenue = labels.map(day => Math.round(revenueByDay[day] * 100) / 100);
  const totalRevenue = realRevenue.reduce((sum, val) => sum + val, 0);

  // If there are no real orders, show fallback mock data scaled for the user's role
  const mockRevenue = userRole === 'seller' 
    ? [200, 450, 600, 1100, 500, 800, 1200] 
    : [1200, 1900, 3000, 5000, 2300, 3400, 4500];

  const salesData = {
    labels,
    datasets: [{
      label: 'Revenue ($)',
      data: totalRevenue > 0 ? realRevenue : mockRevenue,
      borderColor: userRole === 'seller' ? 'rgb(16, 185, 129)' : 'rgb(99, 102, 241)',
      backgroundColor: userRole === 'seller' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
      fill: true,
      tension: 0.4,
    }]
  };

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

  // Mocking funnel sessions (adjusted slightly for seller vs platform admin)
  const behaviourData = {
    labels: ['Home View', 'Search', 'Add to Cart', 'AR Experience', 'Checkout'],
    datasets: [{
      label: 'User Sessions',
      data: userRole === 'seller' ? [1200, 800, 350, 210, 110] : [4200, 3100, 1200, 800, 400],
      backgroundColor: userRole === 'seller' ? 'rgba(16, 185, 129, 0.7)' : 'rgba(168, 85, 247, 0.7)',
      borderRadius: 12
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { borderDash: [5, 5] } }
    }
  };

  return (
    <div style={{ marginBottom: '40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        {/* Sales Chart */}
        <div style={{ 
          background: 'white', padding: '24px', borderRadius: '18px', border: '1px solid var(--border-light)',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
        }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {userRole === 'seller' ? 'Shop Revenue Trend' : 'Platform Revenue Trend'}
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
            {userRole === 'seller' ? 'Shop Visitor Funnel' : 'Platform User Funnel'}
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
            {userRole === 'seller' ? 'Shop Inventory Split' : 'Platform Inventory Split'}
          </h4>
          <div style={{ height: '220px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut data={categoryData} options={{ ...chartOptions, maintainAspectRatio: false }} />
          </div>
        </div>

      </div>
    </div>
  );
}
