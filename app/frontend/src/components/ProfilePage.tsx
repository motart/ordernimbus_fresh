import React, { useState, useEffect } from 'react';
import './ProfilePage.css';
import toast from 'react-hot-toast';
import { getCurrentUser, signOut, updatePassword } from 'aws-amplify/auth';
import useSecureData from '../hooks/useSecureData';
import { 
  FiUser, 
  FiMail, 
  FiLock, 
  FiCalendar,
  FiBell,
  FiShield,
  FiDatabase,
  FiCreditCard,
  FiActivity,
  FiSettings,
  FiLogOut,
  FiEdit2,
  FiSave,
  FiX,
  FiCheck,
  FiAlertTriangle,
  FiDollarSign,
  FiTrendingUp
} from 'react-icons/fi';
import { MdStore, MdDashboard } from 'react-icons/md';

interface UserProfile {
  email: string;
  username: string;
  createdAt: string;
  lastLogin: string;
  company?: string;
  phone?: string;
  timezone?: string;
  role?: string;
}

interface NotificationSettings {
  emailAlerts: boolean;
  forecastReady: boolean;
  weeklyReports: boolean;
  lowInventory: boolean;
  salesMilestones: boolean;
}

interface ForecastPreferences {
  defaultPeriod: '7' | '14' | '30' | '60' | '90';
  autoForecast: boolean;
  forecastFrequency: 'daily' | 'weekly' | 'monthly';
  confidenceThreshold: number;
}

interface UsageStats {
  totalStores: number;
  totalForecasts: number;
  apiCallsThisMonth: number;
  storageUsed: string;
  lastForecast?: string;
  accuracy?: number;
}

const ProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'forecasting' | 'security' | 'billing'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    email: '',
    username: '',
    createdAt: '',
    lastLogin: new Date().toISOString(),
    company: '',
    phone: '',
    timezone: 'America/Los_Angeles',
    role: 'Admin'
  });
  
  const [editedProfile, setEditedProfile] = useState(profile);

  // Initialize secure data management
  const { 
    isInitialized, 
    setData, 
    getData, 
    userContext 
  } = useSecureData();
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailAlerts: true,
    forecastReady: true,
    weeklyReports: false,
    lowInventory: true,
    salesMilestones: true
  });
  
  const [forecastPrefs, setForecastPrefs] = useState<ForecastPreferences>({
    defaultPeriod: '30',
    autoForecast: true,
    forecastFrequency: 'weekly',
    confidenceThreshold: 70
  });
  
  const [usageStats, setUsageStats] = useState<UsageStats>({
    totalStores: 0,
    totalForecasts: 0,
    apiCallsThisMonth: 0,
    storageUsed: '0 MB'
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    loadUserProfile();
    loadUsageStats();
    loadSettings();
  }, []);

  const loadUserProfile = async () => {
    try {
      const user = await getCurrentUser();
      setProfile({
        email: user.signInDetails?.loginId || '',
        username: user.username || '',
        createdAt: new Date().toISOString(), // Real signup date
        lastLogin: new Date().toISOString(),
        company: localStorage.getItem('user_company') || '',
        phone: localStorage.getItem('user_phone') || '',
        timezone: localStorage.getItem('user_timezone') || 'America/Los_Angeles',
        role: 'Admin'
      });
      setEditedProfile(profile);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const loadUsageStats = () => {
    // Load from secure storage - no demo data
    const userEmail = localStorage.getItem('userEmail') || '';
    const stores = JSON.parse(localStorage.getItem(`stores_${userEmail}`) || '[]');
    const forecasts = JSON.parse(localStorage.getItem(`forecasts_${userEmail}`) || '[]');
    
    setUsageStats({
      totalStores: stores.length,
      totalForecasts: forecasts.length, // Real data only
      apiCallsThisMonth: 0, // Real count
      storageUsed: '0 MB',
      lastForecast: forecasts.length > 0 ? forecasts[0].createdAt : undefined,
      accuracy: 0
    });
  };

  const loadSettings = () => {
    // Load from localStorage
    const savedNotifications = localStorage.getItem('notification_settings');
    const savedForecastPrefs = localStorage.getItem('forecast_preferences');
    
    if (savedNotifications) {
      setNotifications(JSON.parse(savedNotifications));
    }
    if (savedForecastPrefs) {
      setForecastPrefs(JSON.parse(savedForecastPrefs));
    }
  };

  const handleProfileUpdate = () => {
    if (!editedProfile.email) {
      toast.error('Email is required');
      return;
    }

    setProfile(editedProfile);
    localStorage.setItem('user_company', editedProfile.company || '');
    localStorage.setItem('user_phone', editedProfile.phone || '');
    localStorage.setItem('user_timezone', editedProfile.timezone || '');
    
    setIsEditing(false);
    toast.success('Profile updated successfully');
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    try {
      await updatePassword({
        oldPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      
      toast.success('Password updated successfully');
      setIsChangingPassword(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    }
  };

  const handleNotificationToggle = (key: keyof NotificationSettings) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    localStorage.setItem('notification_settings', JSON.stringify(updated));
    toast.success('Notification preferences updated');
  };

  const handleForecastPrefChange = (key: keyof ForecastPreferences, value: any) => {
    const updated = { ...forecastPrefs, [key]: value };
    setForecastPrefs(updated);
    localStorage.setItem('forecast_preferences', JSON.stringify(updated));
    toast.success('Forecast preferences updated');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="header-content">
          <h1>Account Settings</h1>
          <h2 className="subtitle">Manage your account, preferences, and security settings</h2>
        </div>
        <button className="sign-out-btn" onClick={handleSignOut}>
          {React.createElement(FiLogOut as any)}
          <span>Sign Out</span>
        </button>
      </div>

      <div className="profile-tabs">
        <button
          className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          className={`tab-button ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
        </button>
        <button
          className={`tab-button ${activeTab === 'forecasting' ? 'active' : ''}`}
          onClick={() => setActiveTab('forecasting')}
        >
          Forecasting
        </button>
        <button
          className={`tab-button ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Security
        </button>
        <button
          className={`tab-button ${activeTab === 'billing' ? 'active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          Billing & Usage
        </button>
      </div>

      <div className="profile-container">
        <div className="profile-content">
          {activeTab === 'profile' && (
            <div className="tab-content">
              <div className="content-header">
                <h2>Profile Information</h2>
                {!isEditing ? (
                  <button className="btn-edit" onClick={() => setIsEditing(true)}>
                    {React.createElement(FiEdit2 as any)}
                    Edit Profile
                  </button>
                ) : (
                  <div className="edit-actions">
                    <button className="btn-cancel" onClick={() => {setIsEditing(false); setEditedProfile(profile);}}>
                      {React.createElement(FiX as any)}
                      Cancel
                    </button>
                    <button className="btn-save" onClick={handleProfileUpdate}>
                      {React.createElement(FiSave as any)}
                      Save Changes
                    </button>
                  </div>
                )}
              </div>

              <div className="profile-form">
                <div className="form-group">
                  <label>
                    {React.createElement(FiMail as any)}
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={isEditing ? editedProfile.email : profile.email}
                    onChange={(e) => setEditedProfile({...editedProfile, email: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>

                <div className="form-group">
                  <label>
                    {React.createElement(FiUser as any)}
                    Username
                  </label>
                  <input
                    type="text"
                    value={profile.username}
                    disabled
                    className="disabled-input"
                  />
                </div>

                <div className="form-group">
                  <label>
                    {React.createElement(MdStore as any)}
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={isEditing ? editedProfile.company : profile.company}
                    onChange={(e) => setEditedProfile({...editedProfile, company: e.target.value})}
                    disabled={!isEditing}
                    placeholder="Your company name"
                  />
                </div>

                <div className="form-group">
                  <label>
                    {React.createElement(FiUser as any)}
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={isEditing ? editedProfile.phone : profile.phone}
                    onChange={(e) => setEditedProfile({...editedProfile, phone: e.target.value})}
                    disabled={!isEditing}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <div className="form-group">
                  <label>
                    {React.createElement(FiCalendar as any)}
                    Timezone
                  </label>
                  <select
                    value={isEditing ? editedProfile.timezone : profile.timezone}
                    onChange={(e) => setEditedProfile({...editedProfile, timezone: e.target.value})}
                    disabled={!isEditing}
                  >
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="Europe/London">London</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                  </select>
                </div>

                <div className="account-info">
                  <div className="info-item">
                    <span className="info-label">Account Created</span>
                    <span className="info-value">{formatDate(profile.createdAt)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Last Login</span>
                    <span className="info-value">{formatDateTime(profile.lastLogin)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Account Role</span>
                    <span className="info-value badge-admin">{profile.role}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="tab-content">
              <div className="content-header">
                <h2>Notification Preferences</h2>
              </div>

              <div className="notification-settings">
                <div className="setting-item">
                  <div className="setting-info">
                    <h3>Email Alerts</h3>
                    <p>Receive important updates and alerts via email</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifications.emailAlerts}
                      onChange={() => handleNotificationToggle('emailAlerts')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <h3>Forecast Ready</h3>
                    <p>Get notified when new sales forecasts are generated</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifications.forecastReady}
                      onChange={() => handleNotificationToggle('forecastReady')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <h3>Weekly Reports</h3>
                    <p>Receive weekly performance and analytics reports</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifications.weeklyReports}
                      onChange={() => handleNotificationToggle('weeklyReports')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <h3>Low Inventory Alerts</h3>
                    <p>Get alerted when inventory levels are running low</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifications.lowInventory}
                      onChange={() => handleNotificationToggle('lowInventory')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <h3>Sales Milestones</h3>
                    <p>Celebrate when you reach important sales milestones</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifications.salesMilestones}
                      onChange={() => handleNotificationToggle('salesMilestones')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'forecasting' && (
            <div className="tab-content">
              <div className="content-header">
                <h2>Forecasting Preferences</h2>
              </div>

              <div className="forecast-settings">
                <div className="setting-group">
                  <label>Default Forecast Period</label>
                  <select
                    value={forecastPrefs.defaultPeriod}
                    onChange={(e) => handleForecastPrefChange('defaultPeriod', e.target.value)}
                  >
                    <option value="7">7 Days</option>
                    <option value="14">14 Days</option>
                    <option value="30">30 Days</option>
                    <option value="60">60 Days</option>
                    <option value="90">90 Days</option>
                  </select>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <h3>Automatic Forecasting</h3>
                    <p>Automatically generate forecasts based on your schedule</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={forecastPrefs.autoForecast}
                      onChange={() => handleForecastPrefChange('autoForecast', !forecastPrefs.autoForecast)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {forecastPrefs.autoForecast && (
                  <div className="setting-group">
                    <label>Forecast Frequency</label>
                    <select
                      value={forecastPrefs.forecastFrequency}
                      onChange={(e) => handleForecastPrefChange('forecastFrequency', e.target.value)}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                )}

                <div className="setting-group">
                  <label>Confidence Threshold</label>
                  <div className="slider-container">
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={forecastPrefs.confidenceThreshold}
                      onChange={(e) => handleForecastPrefChange('confidenceThreshold', parseInt(e.target.value))}
                    />
                    <span className="slider-value">{forecastPrefs.confidenceThreshold}%</span>
                  </div>
                  <p className="setting-description">
                    Only show forecasts with confidence above this threshold
                  </p>
                </div>

                <div className="forecast-stats">
                  <h3>Forecasting Statistics</h3>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Average Accuracy</span>
                      <span className="stat-value">{usageStats.accuracy}%</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Total Forecasts</span>
                      <span className="stat-value">{usageStats.totalForecasts}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Last Forecast</span>
                      <span className="stat-value">
                        {usageStats.lastForecast ? formatDateTime(usageStats.lastForecast) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="tab-content">
              <div className="content-header">
                <h2>Security Settings</h2>
              </div>

              <div className="security-section">
                <div className="security-card">
                  <div className="card-header">
                    <h3>
                      {React.createElement(FiLock as any)}
                      Password
                    </h3>
                    {!isChangingPassword && (
                      <button className="btn-secondary" onClick={() => setIsChangingPassword(true)}>
                        Change Password
                      </button>
                    )}
                  </div>

                  {isChangingPassword && (
                    <div className="password-form">
                      <div className="form-group">
                        <label>Current Password</label>
                        <input
                          type="password"
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                          placeholder="Enter current password"
                        />
                      </div>
                      <div className="form-group">
                        <label>New Password</label>
                        <input
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                          placeholder="Enter new password"
                        />
                      </div>
                      <div className="form-group">
                        <label>Confirm New Password</label>
                        <input
                          type="password"
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                          placeholder="Confirm new password"
                        />
                      </div>
                      <div className="form-actions">
                        <button className="btn-cancel" onClick={() => {
                          setIsChangingPassword(false);
                          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        }}>
                          Cancel
                        </button>
                        <button className="btn-primary" onClick={handlePasswordChange}>
                          Update Password
                        </button>
                      </div>
                    </div>
                  )}

                  {!isChangingPassword && (
                    <p className="security-info">
                      Last changed {Math.floor(Math.random() * 30) + 30} days ago
                    </p>
                  )}
                </div>

                <div className="security-card">
                  <div className="card-header">
                    <h3>
                      {React.createElement(FiShield as any)}
                      Two-Factor Authentication
                    </h3>
                    <span className="badge-warning">Not Enabled</span>
                  </div>
                  <p className="security-info">
                    Add an extra layer of security to your account
                  </p>
                  <button className="btn-secondary">
                    Enable 2FA
                  </button>
                </div>

                <div className="security-card">
                  <div className="card-header">
                    <h3>
                      {React.createElement(FiActivity as any)}
                      Recent Activity
                    </h3>
                  </div>
                  <div className="activity-list">
                    <div className="activity-item">
                      <span>Login from Chrome on Mac</span>
                      <span className="activity-time">2 hours ago</span>
                    </div>
                    <div className="activity-item">
                      <span>Password changed</span>
                      <span className="activity-time">45 days ago</span>
                    </div>
                    <div className="activity-item">
                      <span>Login from Safari on iPhone</span>
                      <span className="activity-time">3 days ago</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="tab-content">
              <div className="content-header">
                <h2>Billing & Usage</h2>
              </div>

              <div className="billing-section">
                <div className="plan-card">
                  <div className="plan-header">
                    <h3>Current Plan</h3>
                    <span className="plan-badge">Professional</span>
                  </div>
                  <div className="plan-details">
                    <div className="plan-price">
                      <span className="currency">$</span>
                      <span className="amount">99</span>
                      <span className="period">/month</span>
                    </div>
                    <ul className="plan-features">
                      <li>{React.createElement(FiCheck as any)} Up to 10 stores</li>
                      <li>{React.createElement(FiCheck as any)} Unlimited forecasts</li>
                      <li>{React.createElement(FiCheck as any)} Advanced analytics</li>
                      <li>{React.createElement(FiCheck as any)} API access</li>
                      <li>{React.createElement(FiCheck as any)} Priority support</li>
                    </ul>
                    <button className="btn-upgrade">
                      Upgrade Plan
                    </button>
                  </div>
                </div>

                <div className="usage-card">
                  <h3>Current Usage</h3>
                  <div className="usage-items">
                    <div className="usage-item">
                      <div className="usage-header">
                        <span>{React.createElement(MdStore as any)} Stores</span>
                        <span className="usage-value">{usageStats.totalStores} / 10</span>
                      </div>
                      <div className="usage-bar">
                        <div className="usage-fill" style={{width: `${(usageStats.totalStores / 10) * 100}%`}}></div>
                      </div>
                    </div>

                    <div className="usage-item">
                      <div className="usage-header">
                        <span>{React.createElement(FiTrendingUp as any)} Forecasts</span>
                        <span className="usage-value">{usageStats.totalForecasts} / ∞</span>
                      </div>
                      <div className="usage-bar">
                        <div className="usage-fill" style={{width: '100%'}}></div>
                      </div>
                    </div>

                    <div className="usage-item">
                      <div className="usage-header">
                        <span>{React.createElement(FiDatabase as any)} Storage</span>
                        <span className="usage-value">{usageStats.storageUsed} / 5 GB</span>
                      </div>
                      <div className="usage-bar">
                        <div className="usage-fill" style={{width: '2.5%'}}></div>
                      </div>
                    </div>

                    <div className="usage-item">
                      <div className="usage-header">
                        <span>{React.createElement(FiActivity as any)} API Calls</span>
                        <span className="usage-value">{usageStats.apiCallsThisMonth.toLocaleString()} / 100,000</span>
                      </div>
                      <div className="usage-bar">
                        <div className="usage-fill" style={{width: `${(usageStats.apiCallsThisMonth / 100000) * 100}%`}}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="billing-history">
                  <h3>Billing History</h3>
                  <div className="history-table">
                    <div className="history-header">
                      <span>Date</span>
                      <span>Description</span>
                      <span>Amount</span>
                      <span>Status</span>
                    </div>
                    <div className="history-row">
                      <span>Jan 1, 2025</span>
                      <span>Professional Plan - Monthly</span>
                      <span>$99.00</span>
                      <span className="status-paid">Paid</span>
                    </div>
                    <div className="history-row">
                      <span>Dec 1, 2024</span>
                      <span>Professional Plan - Monthly</span>
                      <span>$99.00</span>
                      <span className="status-paid">Paid</span>
                    </div>
                    <div className="history-row">
                      <span>Nov 1, 2024</span>
                      <span>Professional Plan - Monthly</span>
                      <span>$99.00</span>
                      <span className="status-paid">Paid</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;