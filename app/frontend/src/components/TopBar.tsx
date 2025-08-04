import React, { useState } from 'react';
import './TopBar.css';
import { 
  FiBell,
  FiHelpCircle,
  FiUser,
  FiSettings,
  FiLogOut,
  FiChevronDown
} from 'react-icons/fi';

interface TopBarProps {
  userEmail: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  activePage: string;
}

const TopBar: React.FC<TopBarProps> = ({ userEmail, onNavigate, onLogout, activePage }) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getUserInitials = () => {
    return userEmail ? userEmail.substring(0, 2).toUpperCase() : 'UN';
  };

  const getUserName = () => {
    return userEmail ? userEmail.split('@')[0] : 'User';
  };

  const handleItemClick = (page: string) => {
    onNavigate(page);
    setShowProfileMenu(false);
  };

  return (
    <div className="topbar">
      <div className="topbar-content">
        {/* Left side - can be used for breadcrumbs or page title */}
        <div className="topbar-left">
          {/* Optional: Add breadcrumbs or page context here */}
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
            <span className="notification-badge">3</span>
          </button>

          {/* Help & Support */}
          <button
            className={`topbar-item ${activePage === 'help' ? 'active' : ''}`}
            onClick={() => handleItemClick('help')}
            title="Help & Support"
          >
            {React.createElement(FiHelpCircle as any, { size: 20 })}
          </button>

          {/* Settings */}
          <button
            className={`topbar-item ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => handleItemClick('settings')}
            title="Settings"
          >
            {React.createElement(FiSettings as any, { size: 20 })}
          </button>

          {/* Profile Dropdown */}
          <div className="profile-dropdown">
            <button
              className={`profile-button ${showProfileMenu ? 'active' : ''}`}
              onClick={() => setShowProfileMenu(!showProfileMenu)}
            >
              <div className="user-avatar">
                {getUserInitials()}
              </div>
              <span className="user-name">{getUserName()}</span>
              {React.createElement(FiChevronDown as any, { 
                size: 16, 
                className: `chevron ${showProfileMenu ? 'rotated' : ''}` 
              })}
            </button>

            {showProfileMenu && (
              <>
                <div className="dropdown-overlay" onClick={() => setShowProfileMenu(false)} />
                <div className="profile-menu">
                  <div className="profile-menu-header">
                    <div className="user-avatar-large">
                      {getUserInitials()}
                    </div>
                    <div className="user-info">
                      <div className="user-name-full">{getUserName()}</div>
                      <div className="user-email">{userEmail}</div>
                    </div>
                  </div>
                  <div className="profile-menu-divider" />
                  <button
                    className="profile-menu-item"
                    onClick={() => handleItemClick('profile')}
                  >
                    {React.createElement(FiUser as any, { size: 18 })}
                    <span>My Profile</span>
                  </button>
                  <button
                    className="profile-menu-item"
                    onClick={() => handleItemClick('settings')}
                  >
                    {React.createElement(FiSettings as any, { size: 18 })}
                    <span>Settings</span>
                  </button>
                  <div className="profile-menu-divider" />
                  <button
                    className="profile-menu-item logout"
                    onClick={onLogout}
                  >
                    {React.createElement(FiLogOut as any, { size: 18 })}
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopBar;