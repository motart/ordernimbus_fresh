import React, { useState, useEffect } from 'react';
import './NotificationsPage.css';
import toast from 'react-hot-toast';
import { ClipLoader } from 'react-spinners';
import { 
  FiBell, FiPackage, FiShoppingCart, FiAlertTriangle, 
  FiCheckCircle, FiXCircle, FiRefreshCw, FiCheck,
  FiTrendingUp, FiBox, FiCheckSquare
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { createAuthenticatedFetch } from '../utils/authenticatedFetch';

interface Notification {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  metadata?: any;
  read: boolean;
  createdAt: string;
  readAt?: string;
}

const NotificationsPage: React.FC = () => {
  const { getAccessToken } = useAuth();
  const authenticatedFetch = createAuthenticatedFetch({ getAccessToken });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authenticatedFetch(`/api/notifications`);

      if (response.ok) {
        const data = await response.json();
        // Filter out invalid notifications (those without required fields)
        const validNotifications = (data.notifications || []).filter(
          (n: any) => n && n.id && n.type && n.title && n.message
        ) as Notification[];
        setNotifications(validNotifications);
        
        // Update badge count in parent
        const unreadCount = validNotifications.filter((n: Notification) => !n.read).length;
        window.dispatchEvent(new CustomEvent('notificationUpdate', { detail: { count: unreadCount } }));
      } else {
        toast.error('Failed to load notifications');
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Error loading notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authenticatedFetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT'
      });

      if (response.ok) {
        setNotifications(prev => 
          prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
        );
        
        // Update badge count
        const unreadCount = notifications.filter(n => !n.read && n.id !== notificationId).length;
        window.dispatchEvent(new CustomEvent('notificationUpdate', { detail: { count: unreadCount } }));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      // userId is now extracted from JWT token on backend
      
      const response = await authenticatedFetch(`/api/notifications/read-all`, {
        method: 'PUT'
      });

      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        window.dispatchEvent(new CustomEvent('notificationUpdate', { detail: { count: 0 } }));
        toast.success('All notifications marked as read');
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'low_stock':
      case 'out_of_stock':
      case 'reorder_point':
        return FiPackage;
      case 'new_order':
      case 'large_order':
        return FiShoppingCart;
      case 'sync_failed':
        return FiXCircle;
      case 'sync_complete':
        return FiCheckCircle;
      case 'forecast_alert':
        return FiTrendingUp;
      default:
        return FiBell;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'unread' && notification.read) return false;
    if (typeFilter !== 'all' && notification.type !== typeFilter) return false;
    return true;
  });

  const notificationTypes = Array.from(new Set(notifications.map(n => n.type).filter(Boolean)));

  return (
    <div className="notifications-page">
      <header className="notifications-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Notifications</h1>
            <p>Stay updated with important alerts and updates</p>
          </div>
          <div className="header-actions">
            {notifications.some(n => !n.read) && (
              <button onClick={markAllAsRead} className="mark-all-read-btn">
                {React.createElement(FiCheck as any)}
                Mark All Read
              </button>
            )}
            <button onClick={loadNotifications} className="refresh-btn">
              {React.createElement(FiRefreshCw as any)}
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="notifications-filters">
        <div className="filter-group">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({notifications.length})
          </button>
          <button
            className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({notifications.filter(n => !n.read).length})
          </button>
        </div>
        
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="type-filter"
        >
          <option value="all">All Types</option>
          {notificationTypes.map(type => (
            <option key={type} value={type}>
              {type ? type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'}
            </option>
          ))}
        </select>
      </div>

      <div className="notifications-content">
        {isLoading ? (
          <div className="loading-state">
            <ClipLoader size={40} color="#667eea" />
            <p>Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="empty-state">
            {React.createElement(FiBell as any, { size: 64, color: '#9ca3af' })}
            <h3>No Notifications</h3>
            <p>{filter === 'unread' ? 'You have no unread notifications' : 'You have no notifications yet'}</p>
          </div>
        ) : (
          <div className="notifications-list">
            {filteredNotifications.map((notification) => {
              const Icon = getNotificationIcon(notification.type);
              return (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.read ? 'unread' : ''}`}
                >
                  <div className="notification-icon" style={{ color: getPriorityColor(notification.priority) }}>
                    {React.createElement(Icon as any, { size: 24 })}
                  </div>
                  <div className="notification-content">
                    <div className="notification-header">
                      <h3>{notification.title}</h3>
                      {!notification.read && (
                        <button 
                          className="mark-read-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          title="Mark as read"
                        >
                          {React.createElement(FiCheckSquare as any, { size: 16 })}
                        </button>
                      )}
                    </div>
                    <p>{notification.message}</p>
                    {notification.metadata && (
                      <div className="notification-metadata">
                        {notification.metadata.productTitle && (
                          <span className="metadata-item">
                            {React.createElement(FiBox as any, { size: 12 })}
                            {notification.metadata.productTitle}
                          </span>
                        )}
                        {notification.metadata.sku && (
                          <span className="metadata-item">SKU: {notification.metadata.sku}</span>
                        )}
                        {notification.metadata.currentStock !== undefined && (
                          <span className="metadata-item">Stock: {notification.metadata.currentStock}</span>
                        )}
                        {notification.metadata.total && (
                          <span className="metadata-item">
                            Total: ${notification.metadata.total.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                    <span className="notification-time">{formatTimeAgo(notification.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;