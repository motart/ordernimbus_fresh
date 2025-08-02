import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import { signOut } from 'aws-amplify/auth';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import StoresPage from './StoresPage';
import ProfilePage from './ProfilePage';
import ForecastPage from './ForecastPage';
import DataUpload from './DataUpload';
import SecureDataManager from '../utils/SecureDataManager';

interface DashboardProps {
  userEmail: string;
  onLogout: () => void;
}

interface SalesData {
  date: string;
  actual: number;
  forecast: number;
}

const Dashboard: React.FC<DashboardProps> = ({ userEmail, onLogout }) => {
  const [selectedStore, setSelectedStore] = useState('Store 001');
  const [timeRange, setTimeRange] = useState('7days');
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [activePage, setActivePage] = useState('dashboard');

  const handleLogout = async () => {
    try {
      // Reset secure data manager to clear encryption keys
      const secureDataManager = SecureDataManager.getInstance();
      secureDataManager.reset();
      
      await signOut();
      toast.success('Logged out successfully', {
        icon: '👋',
      });
      onLogout();
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Logout failed, but clearing local session');
      
      // Still reset secure data manager even if Cognito fails
      const secureDataManager = SecureDataManager.getInstance();
      secureDataManager.reset();
      
      onLogout(); // Still logout locally even if Cognito fails
    }
  };

  useEffect(() => {
    // Generate mock sales data
    const generateData = () => {
      const data: SalesData[] = [];
      const days = timeRange === '7days' ? 7 : timeRange === '30days' ? 30 : 90;
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        data.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          actual: Math.floor(Math.random() * 50000) + 30000,
          forecast: Math.floor(Math.random() * 50000) + 30000,
        });
      }
      setSalesData(data);
    };

    generateData();
  }, [timeRange]);

  const totalSales = salesData.reduce((sum, day) => sum + day.actual, 0);
  const avgSales = salesData.length > 0 ? totalSales / salesData.length : 0;
  const accuracy = 94.5; // Mock accuracy

  const handleNavigate = (page: string) => {
    setActivePage(page);
    // Add navigation logic here for different pages
    if (page !== 'dashboard' && page !== 'stores' && page !== 'profile' && page !== 'forecasts' && page !== 'upload') {
      toast(`${page.charAt(0).toUpperCase() + page.slice(1)} page coming soon!`, { icon: '🚀' });
    }
  };

  return (
    <div className="dashboard-container">
      <Sidebar 
        userEmail={userEmail}
        onLogout={handleLogout}
        onNavigate={handleNavigate}
        activePage={activePage}
      />
      <div className="dashboard-main">
        {activePage === 'stores' ? (
          <StoresPage />
        ) : activePage === 'profile' ? (
          <ProfilePage />
        ) : activePage === 'forecasts' ? (
          <ForecastPage />
        ) : activePage === 'upload' ? (
          <DataUpload onDataUploaded={(data, type) => {
            toast.success(`Successfully uploaded ${data.length} ${type} records`);
          }} />
        ) : (
          <>
            <header className="dashboard-header">
              <div className="header-content">
                <h1>{activePage === 'dashboard' ? 'Sales Dashboard' : activePage.charAt(0).toUpperCase() + activePage.slice(1)}</h1>
                {activePage === 'dashboard' && (
                  <select 
                    value={selectedStore} 
                    onChange={(e) => setSelectedStore(e.target.value)}
                    className="store-selector"
                  >
                    <option>Store 001 - Downtown</option>
                    <option>Store 002 - Mall</option>
                    <option>Store 003 - Airport</option>
                  </select>
                )}
              </div>
            </header>

            <div className="dashboard-content">
        <div className="metrics-row">
          <div className="metric-card">
            <h3>Total Sales</h3>
            <p className="metric-value">${(totalSales / 1000).toFixed(1)}K</p>
            <span className="metric-change positive">+12.5%</span>
          </div>
          <div className="metric-card">
            <h3>Daily Average</h3>
            <p className="metric-value">${(avgSales / 1000).toFixed(1)}K</p>
            <span className="metric-change positive">+5.2%</span>
          </div>
          <div className="metric-card">
            <h3>Forecast Accuracy</h3>
            <p className="metric-value">{accuracy}%</p>
            <span className="metric-change positive">+2.1%</span>
          </div>
          <div className="metric-card">
            <h3>SKUs Analyzed</h3>
            <p className="metric-value">1,248</p>
            <span className="metric-change neutral">0%</span>
          </div>
        </div>

        <div className="chart-container">
          <div className="chart-header">
            <h2>Sales Forecast</h2>
            <div className="time-selector">
              <button 
                className={timeRange === '7days' ? 'active' : ''}
                onClick={() => setTimeRange('7days')}
              >
                7 Days
              </button>
              <button 
                className={timeRange === '30days' ? 'active' : ''}
                onClick={() => setTimeRange('30days')}
              >
                30 Days
              </button>
              <button 
                className={timeRange === '90days' ? 'active' : ''}
                onClick={() => setTimeRange('90days')}
              >
                90 Days
              </button>
            </div>
          </div>
          
          <div className="chart">
            <div className="chart-legend">
              <span className="legend-item actual">Actual Sales</span>
              <span className="legend-item forecast">Forecast</span>
            </div>
            <div className="chart-bars">
              {salesData.map((day, index) => (
                <div key={index} className="chart-bar-group">
                  <div className="bars">
                    <div 
                      className="bar actual" 
                      style={{ height: `${(day.actual / 80000) * 100}%` }}
                      title={`Actual: $${day.actual.toLocaleString()}`}
                    />
                    <div 
                      className="bar forecast" 
                      style={{ height: `${(day.forecast / 80000) * 100}%` }}
                      title={`Forecast: $${day.forecast.toLocaleString()}`}
                    />
                  </div>
                  <span className="bar-label">{day.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="actions-row">
          <div className="action-card">
            <h3>Upload Sales Data</h3>
            <p>Import CSV files with historical sales</p>
            <button className="action-button">Upload CSV</button>
          </div>
          <div className="action-card">
            <h3>Configure Alerts</h3>
            <p>Set up notifications for forecast changes</p>
            <button className="action-button">Configure</button>
          </div>
          <div className="action-card">
            <h3>Export Report</h3>
            <p>Download detailed analytics report</p>
            <button className="action-button">Export PDF</button>
          </div>
        </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;