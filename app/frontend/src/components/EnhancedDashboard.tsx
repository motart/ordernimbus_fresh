import React, { useState, useEffect, ReactNode } from 'react';
import * as Icons from 'react-icons/fi';
import { 
  FiTrendingUp, 
  FiPackage, 
  FiUsers, 
  FiShoppingCart,
  FiActivity,
  FiDollarSign,
  FiBarChart2,
  FiPieChart,
  FiArrowUp,
  FiArrowDown,
  FiMoreVertical,
  FiCalendar,
  FiFilter
} from 'react-icons/fi';
import {
  Card,
  Button,
  Badge,
  Skeleton,
  Progress,
  Dropdown,
  animations
} from './ui/UIComponents';
import './EnhancedDashboard.css';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

// Simplified motion components for animation
const motion = {
  div: React.forwardRef<HTMLDivElement, any>((props, ref) => <div ref={ref} {...props} />)
};

const AnimatePresence: React.FC<{ children: ReactNode }> = ({ children }) => <>{children}</>;

interface MetricData {
  title: string;
  value: string | number;
  change: number;
  changeLabel: string;
  icon: ReactNode;
  color: string;
  trend: 'up' | 'down' | 'neutral';
  sparklineData?: number[];
}

interface ChartData {
  date: string;
  actual: number;
  forecast: number;
  orders: number;
  customers: number;
}

const EnhancedDashboard: React.FC = () => {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState('7days');
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100
      }
    }
  };

  useEffect(() => {
    // Simulate data loading
    const loadDashboardData = async () => {
      setLoading(true);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Generate mock data based on time range
      const days = timeRange === '7days' ? 7 : timeRange === '30days' ? 30 : 90;
      const mockChartData: ChartData[] = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - i));
        
        mockChartData.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          actual: Math.floor(Math.random() * 50000) + 30000,
          forecast: Math.floor(Math.random() * 50000) + 30000,
          orders: Math.floor(Math.random() * 200) + 100,
          customers: Math.floor(Math.random() * 150) + 50
        });
      }
      
      setChartData(mockChartData);
      
      // Calculate metrics
      const totalSales = mockChartData.reduce((sum, day) => sum + day.actual, 0);
      const totalOrders = mockChartData.reduce((sum, day) => sum + day.orders, 0);
      const totalCustomers = mockChartData.reduce((sum, day) => sum + day.customers, 0);
      const avgOrderValue = totalSales / totalOrders;
      
      setMetrics([
        {
          title: 'Total Revenue',
          value: `$${(totalSales / 1000).toFixed(1)}K`,
          change: 12.5,
          changeLabel: 'vs last period',
          icon: React.createElement(FiDollarSign as any),
          color: '#5b6cff',
          trend: 'up',
          sparklineData: mockChartData.slice(-7).map(d => d.actual)
        },
        {
          title: 'Total Orders',
          value: totalOrders.toLocaleString(),
          change: 8.3,
          changeLabel: 'vs last period',
          icon: React.createElement(FiShoppingCart as any),
          color: '#14b8a6',
          trend: 'up',
          sparklineData: mockChartData.slice(-7).map(d => d.orders)
        },
        {
          title: 'Active Customers',
          value: totalCustomers.toLocaleString(),
          change: -2.4,
          changeLabel: 'vs last period',
          icon: React.createElement(FiUsers as any),
          color: '#eab308',
          trend: 'down',
          sparklineData: mockChartData.slice(-7).map(d => d.customers)
        },
        {
          title: 'Avg Order Value',
          value: `$${avgOrderValue.toFixed(2)}`,
          change: 5.7,
          changeLabel: 'vs last period',
          icon: React.createElement(FiTrendingUp as any),
          color: '#22c55e',
          trend: 'up',
          sparklineData: mockChartData.slice(-7).map(d => d.actual / d.orders)
        }
      ]);
      
      setLoading(false);
    };
    
    loadDashboardData();
  }, [timeRange]);

  // Custom chart colors
  const CHART_COLORS = {
    primary: '#5b6cff',
    secondary: '#14b8a6',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    neutral: '#94a3b8'
  };

  // Pie chart data for product categories
  const categoryData = [
    { name: 'Electronics', value: 35, color: CHART_COLORS.primary },
    { name: 'Clothing', value: 25, color: CHART_COLORS.secondary },
    { name: 'Food & Beverage', value: 20, color: CHART_COLORS.success },
    { name: 'Home & Garden', value: 15, color: CHART_COLORS.warning },
    { name: 'Other', value: 5, color: CHART_COLORS.neutral }
  ];

  // Recent activity data
  const recentActivity = [
    { id: 1, type: 'order', message: 'New order #1234 received', time: '2 min ago', icon: React.createElement(FiShoppingCart as any) },
    { id: 2, type: 'customer', message: 'New customer registration', time: '15 min ago', icon: React.createElement(FiUsers as any) },
    { id: 3, type: 'inventory', message: 'Low stock alert: Product SKU-789', time: '1 hour ago', icon: React.createElement(FiPackage as any) },
    { id: 4, type: 'sales', message: 'Daily sales target achieved', time: '2 hours ago', icon: React.createElement(FiTrendingUp as any) }
  ];

  const MetricCard: React.FC<{ metric: MetricData; index: number }> = ({ metric, index }) => (
    <motion.div
      className="metric-card-enhanced"
      style={{ '--metric-color': metric.color } as React.CSSProperties}
      onClick={() => setSelectedMetric(metric.title)}
    >
      <div className="metric-header">
        <div className="metric-icon" style={{ backgroundColor: `${metric.color}20`, color: metric.color }}>
          {metric.icon}
        </div>
        <Dropdown
          trigger={<button className="metric-menu">{React.createElement(FiMoreVertical as any)}</button>}
          items={[
            { id: 'view', label: 'View Details', onClick: () => toast('Opening details...') },
            { id: 'export', label: 'Export Data', onClick: () => toast('Exporting...') },
            { id: 'divider', label: '', divider: true },
            { id: 'hide', label: 'Hide Metric', onClick: () => toast('Metric hidden') }
          ]}
          position="right"
        />
      </div>
      
      <div className="metric-body">
        <p className="metric-label">{metric.title}</p>
        <h2 className="metric-value-large">{metric.value}</h2>
        
        <div className="metric-change-container">
          <Badge 
            variant={metric.trend === 'up' ? 'success' : metric.trend === 'down' ? 'error' : 'default'}
            size="sm"
            icon={metric.trend === 'up' ? React.createElement(FiArrowUp as any) : metric.trend === 'down' ? React.createElement(FiArrowDown as any) : null}
          >
            {metric.change > 0 ? '+' : ''}{metric.change}%
          </Badge>
          <span className="metric-change-label">{metric.changeLabel}</span>
        </div>
      </div>
      
      {metric.sparklineData && (
        <div className="metric-sparkline">
          <div className="mini-chart">
            {metric.sparklineData.map((value, i) => (
              <div 
                key={i}
                className="mini-bar"
                style={{ 
                  height: `${(value / Math.max(...(metric.sparklineData || []))) * 100}%`,
                  backgroundColor: metric.color
                }}
              />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="enhanced-dashboard">
      {/* Dashboard Header */}
      <motion.div 
        className="dashboard-header-enhanced"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="header-left">
          <h1 className="dashboard-title">
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {user?.email?.split('@')[0] || 'User'}! 👋
          </h1>
          <p className="dashboard-subtitle">Here's what's happening with your sales today</p>
        </div>
        
        <div className="header-right">
          <Button
            variant="ghost"
            icon={React.createElement(FiCalendar as any)}
            onClick={() => toast('Opening date picker...')}
          >
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </Button>
          
          <div className="time-range-selector">
            {['7days', '30days', '90days'].map(range => (
              <button
                key={range}
                className={`time-range-btn ${timeRange === range ? 'active' : ''}`}
                onClick={() => setTimeRange(range)}
              >
                {range === '7days' ? '7 Days' : range === '30days' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
          
          <Button
            variant="primary"
            icon={React.createElement(FiFilter as any)}
            onClick={() => toast('Opening filters...')}
          >
            Filters
          </Button>
        </div>
      </motion.div>

      {/* Key Metrics */}
      <div className="metrics-grid-enhanced">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="metric-card-skeleton">
              <Skeleton variant="text" count={3} />
            </Card>
          ))
        ) : (
          metrics.map((metric, index) => (
            <MetricCard key={metric.title} metric={metric} index={index} />
          ))
        )}
      </div>

      {/* Main Charts Section */}
      <div className="charts-grid-enhanced">
        {/* Sales Trend Chart */}
        <Card className="chart-card-enhanced">
          <div className="chart-header-enhanced">
            <div>
              <h3 className="chart-title">Sales & Forecast Trend</h3>
              <p className="chart-subtitle">Actual vs Predicted Sales Performance</p>
            </div>
            <Button variant="ghost" size="sm" icon={React.createElement(FiMoreVertical as any)}>Options</Button>
          </div>
          
          <div className="simple-chart">
            <div className="chart-bars-container">
              {chartData.slice(0, 10).map((day, index) => (
                <div key={index} className="chart-bar-group">
                  <div className="chart-bar actual-bar" 
                    style={{ height: `${(day.actual / 80000) * 100}%`, backgroundColor: CHART_COLORS.primary }}
                    title={`Actual: $${day.actual.toLocaleString()}`}
                  />
                  <div className="chart-bar forecast-bar" 
                    style={{ height: `${(day.forecast / 80000) * 100}%`, backgroundColor: CHART_COLORS.secondary }}
                    title={`Forecast: $${day.forecast.toLocaleString()}`}
                  />
                  <span className="bar-label">{day.date}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: CHART_COLORS.primary }}></span>
                Actual Sales
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: CHART_COLORS.secondary }}></span>
                Forecast
              </span>
            </div>
          </div>
        </Card>

        {/* Category Distribution */}
        <Card className="chart-card-enhanced">
          <div className="chart-header-enhanced">
            <div>
              <h3 className="chart-title">Sales by Category</h3>
              <p className="chart-subtitle">Product category distribution</p>
            </div>
          </div>
          
          <div className="category-distribution">
            {categoryData.map((cat) => (
              <div key={cat.name} className="category-item">
                <div className="category-header">
                  <span className="category-name">{cat.name}</span>
                  <span className="category-value">{cat.value}%</span>
                </div>
                <div className="category-bar-bg">
                  <div 
                    className="category-bar-fill"
                    style={{ 
                      width: `${cat.value}%`,
                      backgroundColor: cat.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Secondary Metrics Row */}
      <div className="secondary-metrics-row">
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="activity-card"
        >
          <Card>
            <div className="activity-header">
              <h3>Recent Activity</h3>
              <Badge variant="info" size="sm">Live</Badge>
            </div>
            
            <div className="activity-list">
              {recentActivity.map((activity, index) => (
                <div
                  key={activity.id}
                  className="activity-item fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`activity-icon activity-${activity.type}`}>
                    {activity.icon}
                  </div>
                  <div className="activity-content">
                    <p className="activity-message">{activity.message}</p>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <Button variant="ghost" fullWidth>
              View All Activity
            </Button>
          </Card>
        </motion.div>

        {/* Performance Indicators */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="performance-card"
        >
          <Card>
            <h3>Performance Indicators</h3>
            
            <div className="performance-metrics">
              <div className="performance-item">
                <div className="performance-header">
                  <span>Sales Target</span>
                  <span className="performance-value">85%</span>
                </div>
                <Progress value={85} variant="success" animated />
              </div>
              
              <div className="performance-item">
                <div className="performance-header">
                  <span>Inventory Turnover</span>
                  <span className="performance-value">72%</span>
                </div>
                <Progress value={72} variant="warning" animated />
              </div>
              
              <div className="performance-item">
                <div className="performance-header">
                  <span>Customer Satisfaction</span>
                  <span className="performance-value">94%</span>
                </div>
                <Progress value={94} variant="success" animated />
              </div>
              
              <div className="performance-item">
                <div className="performance-header">
                  <span>Forecast Accuracy</span>
                  <span className="performance-value">91%</span>
                </div>
                <Progress value={91} variant="success" animated />
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="quick-actions-card"
        >
          <Card>
            <h3>Quick Actions</h3>
            
            <div className="quick-actions-grid">
              <Button
                variant="secondary"
                icon={React.createElement(FiPackage as any)}
                onClick={() => toast.success('Opening inventory...')}
                fullWidth
              >
                Check Inventory
              </Button>
              
              <Button
                variant="secondary"
                icon={React.createElement(FiBarChart2 as any)}
                onClick={() => toast.success('Generating report...')}
                fullWidth
              >
                Generate Report
              </Button>
              
              <Button
                variant="secondary"
                icon={React.createElement(FiUsers as any)}
                onClick={() => toast.success('Opening customers...')}
                fullWidth
              >
                View Customers
              </Button>
              
              <Button
                variant="primary"
                icon={React.createElement(FiTrendingUp as any)}
                onClick={() => toast.success('Running forecast...')}
                fullWidth
              >
                Run Forecast
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;