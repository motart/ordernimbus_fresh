import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import './EnhancedDashboard.css';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import StoresPage from './StoresPage';
import ProfilePage from './ProfilePage';
import ForecastPage from './ForecastPage';
import InventoryPage from './InventoryPage';
import OrderPage from './OrderPage';
import ProductsPage from './ProductsPage';
import CustomersPage from './CustomersPage';
import NotificationsPage from './NotificationsPage';
import EnhancedDashboard from './EnhancedDashboard';
import SecureDataManager from '../utils/SecureDataManager';
import { useAuth } from '../contexts/AuthContext';

interface SalesData {
  date: string;
  actual: number;
  forecast: number;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [selectedStore, setSelectedStore] = useState('');
  const [timeRange, setTimeRange] = useState('7days');
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [activePage, setActivePage] = useState('dashboard');
  const [stores, setStores] = useState<any[]>([]);
  const [hasData, setHasData] = useState(false);

  const handleLogout = async () => {
    try {
      // Reset secure data manager to clear encryption keys
      const secureDataManager = SecureDataManager.getInstance();
      secureDataManager.reset();
      
      // Logout handled by auth service
      toast.success('Logged out successfully', {
        icon: '👋',
      });
      logout();
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Logout failed, but clearing local session');
      
      // Still reset secure data manager even if Cognito fails
      const secureDataManager = SecureDataManager.getInstance();
      secureDataManager.reset();
      
      logout(); // Still logout locally even if Cognito fails
    }
  };

  useEffect(() => {
    // Check if user has any data
    const checkUserData = async () => {
      try {
        // This would normally call an API to check if user has stores/data
        // For now, we'll check localStorage
        const userStores = localStorage.getItem(`stores_${user?.email || ''}`);
        const userData = localStorage.getItem(`sales_data_${user?.email || ''}`);
        
        if (userStores) {
          const parsedStores = JSON.parse(userStores);
          setStores(parsedStores);
          if (parsedStores.length > 0) {
            setSelectedStore(parsedStores[0].id);
          }
        }
        
        if (userData) {
          const parsedData = JSON.parse(userData);
          setSalesData(parsedData);
          setHasData(true);
        } else {
          setSalesData([]);
          setHasData(false);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        setSalesData([]);
        setHasData(false);
      }
    };

    checkUserData();
  }, [timeRange, user?.email || '']);

  const totalSales = salesData.reduce((sum, day) => sum + day.actual, 0);
  const avgSales = salesData.length > 0 ? totalSales / salesData.length : 0;
  const accuracy = salesData.length > 0 ? 94.5 : 0; // Only show accuracy if we have data

  const handleNavigate = (page: string) => {
    setActivePage(page);
    // Add navigation logic here for different pages
    if (page !== 'dashboard' && page !== 'stores' && page !== 'profile' && page !== 'forecasts' && page !== 'upload' && page !== 'inventory' && page !== 'orders' && page !== 'products' && page !== 'customers') {
      toast(`${page.charAt(0).toUpperCase() + page.slice(1)} page coming soon!`, { icon: '🚀' });
    }
  };

  const getPageTitle = () => {
    switch (activePage) {
      case 'dashboard': return 'Sales Dashboard';
      case 'stores': return 'Stores';
      case 'profile': return 'Profile';
      case 'forecasts': return 'Sales Forecast';
      case 'inventory': return 'Inventory';
      case 'orders': return 'Orders';
      case 'products': return 'Products';
      case 'customers': return 'Customers';
      case 'notifications': return 'Notifications';
      case 'help': return 'Help & Support';
      case 'settings': return 'Settings';
      default: return activePage.charAt(0).toUpperCase() + activePage.slice(1);
    }
  };

  return (
    <div className="dashboard-container">
      <Sidebar 
        userEmail={user?.email || ''}
        onLogout={handleLogout}
        onNavigate={handleNavigate}
        activePage={activePage}
      />
      <TopBar
        userEmail={user?.email || ''}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        activePage={activePage}
        pageTitle={getPageTitle()}
        leftContent={
          activePage === 'dashboard' && stores.length > 0 ? (
            <select 
              value={selectedStore} 
              onChange={(e) => setSelectedStore(e.target.value)}
              className="store-selector"
            >
              {stores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          ) : null
        }
      />
      <div className="dashboard-main">
        {activePage === 'stores' ? (
          <StoresPage />
        ) : activePage === 'profile' ? (
          <ProfilePage />
        ) : activePage === 'forecasts' ? (
          <ForecastPage />
        ) : activePage === 'inventory' ? (
          <InventoryPage />
        ) : activePage === 'orders' ? (
          <OrderPage />
        ) : activePage === 'products' ? (
          <ProductsPage />
        ) : activePage === 'customers' ? (
          <CustomersPage />
        ) : activePage === 'notifications' ? (
          <NotificationsPage />
        ) : activePage === 'dashboard' ? (
          <EnhancedDashboard />
        ) : (
          <div className="dashboard-content">
            <div className="empty-state">
              <h2>Page Under Construction</h2>
              <p>This page is being enhanced with new UI/UX features.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;