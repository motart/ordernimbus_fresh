import React from 'react';
import './TopBar.css';
import { 
  FiBell,
  FiHelpCircle
} from 'react-icons/fi';
import { getApiUrl } from '../config/environment';

interface TopBarProps {
  userEmail: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  activePage: string;
  pageTitle?: string;
  leftContent?: React.ReactNode;
}

const TopBar: React.FC<TopBarProps> = ({ userEmail, onNavigate, onLogout, activePage, pageTitle, leftContent }) => {
  const [notificationCount, setNotificationCount] = React.useState(0);

  React.useEffect(() => {
    // Listen for notification updates
    const handleNotificationUpdate = (event: any) => {
      setNotificationCount(event.detail.count);
    };

    window.addEventListener('notificationUpdate', handleNotificationUpdate);
    
    // Load initial notification count
    loadNotificationCount();

    return () => {
      window.removeEventListener('notificationUpdate', handleNotificationUpdate);
    };
  }, []);

  const loadNotificationCount = async () => {
    try {
      const userId = localStorage.getItem('currentUserId') || 'e85183d0-3061-70b8-25f5-171fd848ac9d';
      const response = await fetch(`${getApiUrl()}/api/notifications?unreadOnly=true`, {
        headers: {
          'Content-Type': 'application/json',
          'userId': userId
        }
      });

      if (response.ok) {
        const data = await response.json();
        setNotificationCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error loading notification count:', error);
    }
  };

  const getUserInitials = () => {
    return userEmail ? userEmail.substring(0, 2).toUpperCase() : 'UN';
  };

  const getUserName = () => {
    return userEmail ? userEmail.split('@')[0] : 'User';
  };

  const handleItemClick = (page: string) => {
    onNavigate(page);
  };

  return (
    <div className="topbar">
      <div className="topbar-content">
        {/* Left side - page title and custom content */}
        <div className="topbar-left">
          {pageTitle && <h1 className="topbar-title">{pageTitle}</h1>}
          {leftContent}
        </div>

        {/* Right side - menu items */}
        <div className="topbar-right">
          {/* Notifications */}
          <button
            className={`topbar-item ${activePage === 'notifications' ? 'active' : ''}`}
            onClick={() => handleItemClick('notifications')}
            title="Notifications"
          >
            {React.createElement(FiBell as any, { size: 20 })}
            {notificationCount > 0 && <span className="notification-badge">{notificationCount}</span>}
          </button>

          {/* Help & Support */}
          <button
            className={`topbar-item ${activePage === 'help' ? 'active' : ''}`}
            onClick={() => handleItemClick('help')}
            title="Help & Support"
          >
            {React.createElement(FiHelpCircle as any, { size: 20 })}
          </button>

          {/* Profile Button */}
          <button
            className={`profile-button ${activePage === 'profile' ? 'active' : ''}`}
            onClick={() => handleItemClick('profile')}
            title="My Profile"
          >
            <div className="user-avatar">
              {getUserInitials()}
            </div>
            <span className="user-name">{getUserName()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopBar;