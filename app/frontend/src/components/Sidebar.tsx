import React, { useState, useEffect } from 'react';
import './Sidebar.css';
import { 
  FiMenu, 
  FiX, 
  FiTrendingUp, 
  FiShoppingCart, 
  FiUsers, 
  FiSettings,
  FiUser,
  FiLogOut,
  FiChevronLeft,
  FiHelpCircle,
  FiBell,
  FiFileText,
  FiUpload
} from 'react-icons/fi';
import { 
  MdDashboard, 
  MdInventory2,
  MdAnalytics,
  MdStore
} from 'react-icons/md';

interface SidebarProps {
  userEmail: string;
  onLogout: () => void;
  onNavigate: (page: string) => void;
  activePage: string;
}

const Sidebar: React.FC<SidebarProps> = ({ userEmail, onLogout, onNavigate, activePage }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update body class when collapsed state changes
  useEffect(() => {
    if (!isMobile) {
      if (isCollapsed) {
        document.body.classList.add('sidebar-collapsed');
      } else {
        document.body.classList.remove('sidebar-collapsed');
      }
    }
    return () => {
      document.body.classList.remove('sidebar-collapsed');
    };
  }, [isCollapsed, isMobile]);

  const toggleSidebar = () => {
    if (isMobile) {
      setIsOpen(!isOpen);
    } else {
      setIsCollapsed(!isCollapsed);
    }
  };

  const handleItemClick = (page: string) => {
    onNavigate(page);
    if (isMobile) {
      setIsOpen(false);
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: MdDashboard, section: 'top' },
    { id: 'forecasts', label: 'Sales Forecast', icon: FiTrendingUp, section: 'top' },
    { id: 'stores', label: 'Stores', icon: MdStore, section: 'top' },
    { id: 'upload', label: 'Data Upload', icon: FiUpload, section: 'top' },
    { id: 'inventory', label: 'Inventory', icon: MdInventory2, section: 'top' },
    { id: 'orders', label: 'Orders', icon: FiShoppingCart, section: 'top' },
    { id: 'analytics', label: 'Analytics', icon: MdAnalytics, section: 'top' },
    { id: 'reports', label: 'Reports', icon: FiFileText, section: 'top' },
    { id: 'customers', label: 'Customers', icon: FiUsers, section: 'top' },
  ];

  // Bottom items removed - now in TopBar
  const bottomItems: any[] = [];

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && isOpen && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}

      {/* Mobile Header */}
      {isMobile && (
        <div className="mobile-header">
          <button className="menu-toggle" onClick={toggleSidebar}>
            {React.createElement(FiMenu as any)}
          </button>
          <div className="mobile-logo">OrderNimbus</div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobile ? 'mobile' : ''} ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          {!isCollapsed && (
            <div className="logo">
              <span className="logo-text">OrderNimbus</span>
            </div>
          )}
          {!isMobile && (
            <button className="collapse-btn" onClick={toggleSidebar}>
              {isCollapsed ? React.createElement(FiMenu as any) : React.createElement(FiChevronLeft as any)}
            </button>
          )}
          {isMobile && (
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              {React.createElement(FiX as any)}
            </button>
          )}
        </div>

        <div className="sidebar-content">
          {/* Main Menu Items */}
          <nav className="sidebar-nav">
            <div className="nav-section">
              {menuItems.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                  onClick={() => handleItemClick(item.id)}
                  title={isCollapsed ? item.label : ''}
                >
                  <span className="nav-icon">{React.createElement(item.icon as any)}</span>
                  {!isCollapsed && <span className="nav-label">{item.label}</span>}
                </button>
              ))}
            </div>
          </nav>

          {/* Bottom Section - Removed (items moved to TopBar) */}
        </div>
      </div>
    </>
  );
};

export default Sidebar;