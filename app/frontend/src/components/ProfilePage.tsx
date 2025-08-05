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
  FiTrendingUp,
  FiUsers,
  FiPlus,
  FiTrash2,
  FiLink,
  FiGrid,
  FiZap,
  FiGlobe,
  FiKey,
  FiPackage,
  FiSliders
} from 'react-icons/fi';
import { MdStore, MdDashboard, MdShoppingCart } from 'react-icons/md';
import { SiShopify, SiStripe, SiSlack, SiZapier } from 'react-icons/si';

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
  orderAlerts: boolean;
  systemUpdates: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'pending';
  joinedAt: string;
  lastActive?: string;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected';
  icon: any;
  description: string;
  lastSync?: string;
}

const ProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'account' | 'settings' | 'notifications' | 'members' | 'billing' | 'integrations'>('account');
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);
  
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');

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
    salesMilestones: true,
    orderAlerts: true,
    systemUpdates: false
  });

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    {
      id: '1',
      name: 'You',
      email: profile.email || 'admin@company.com',
      role: 'owner',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    }
  ]);

  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: '1',
      name: 'Shopify',
      type: 'ecommerce',
      status: 'connected',
      icon: SiShopify,
      description: 'Sync your Shopify stores, products, and orders',
      lastSync: new Date().toISOString()
    },
    {
      id: '2',
      name: 'Stripe',
      type: 'payment',
      status: 'disconnected',
      icon: SiStripe,
      description: 'Process payments and manage transactions'
    },
    {
      id: '3',
      name: 'Slack',
      type: 'communication',
      status: 'disconnected',
      icon: SiSlack,
      description: 'Get notifications and alerts in Slack'
    },
    {
      id: '4',
      name: 'Zapier',
      type: 'automation',
      status: 'disconnected',
      icon: SiZapier,
      description: 'Connect with 5,000+ apps and automate workflows'
    }
  ]);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [settings, setSettings] = useState({
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    currency: 'USD',
    autoSave: true,
    darkMode: false,
    compactView: false,
    showTutorials: true
  });

  useEffect(() => {
    loadUserProfile();
    loadSettings();
  }, []);

  const loadUserProfile = async () => {
    try {
      const user = await getCurrentUser();
      const newProfile = {
        email: user.signInDetails?.loginId || '',
        username: user.username || '',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        company: localStorage.getItem('user_company') || '',
        phone: localStorage.getItem('user_phone') || '',
        timezone: localStorage.getItem('user_timezone') || 'America/Los_Angeles',
        role: 'Admin'
      };
      setProfile(newProfile);
      setEditedProfile(newProfile);
      
      // Update team members with actual email
      setTeamMembers([{
        id: '1',
        name: 'You',
        email: newProfile.email,
        role: 'owner',
        status: 'active',
        joinedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const loadSettings = () => {
    const savedNotifications = localStorage.getItem('notification_settings');
    const savedSettings = localStorage.getItem('app_settings');
    
    if (savedNotifications) {
      setNotifications(JSON.parse(savedNotifications));
    }
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
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

  const handleSettingChange = (key: string, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    localStorage.setItem('app_settings', JSON.stringify(updated));
    
    if (key === 'darkMode') {
      document.body.classList.toggle('dark-mode', value);
    }
  };

  const handleInviteMember = () => {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      status: 'pending',
      joinedAt: new Date().toISOString()
    };

    setTeamMembers([...teamMembers, newMember]);
    setInviteEmail('');
    setShowInviteMember(false);
    toast.success(`Invitation sent to ${inviteEmail}`);
  };

  const handleRemoveMember = (memberId: string) => {
    const member = teamMembers.find(m => m.id === memberId);
    if (member?.role === 'owner') {
      toast.error('Cannot remove the owner');
      return;
    }
    
    setTeamMembers(teamMembers.filter(m => m.id !== memberId));
    toast.success('Member removed');
  };

  const handleIntegrationToggle = (integrationId: string) => {
    setIntegrations(integrations.map(integration => {
      if (integration.id === integrationId) {
        const newStatus = integration.status === 'connected' ? 'disconnected' : 'connected';
        
        if (newStatus === 'connected') {
          toast.success(`${integration.name} connected successfully`);
        } else {
          toast.success(`${integration.name} disconnected`);
        }
        
        return {
          ...integration,
          status: newStatus,
          lastSync: newStatus === 'connected' ? new Date().toISOString() : undefined
        };
      }
      return integration;
    }));
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

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'owner': return 'badge-owner';
      case 'admin': return 'badge-admin';
      case 'member': return 'badge-member';
      case 'viewer': return 'badge-viewer';
      default: return '';
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="header-content">
          <h1>Account & Settings</h1>
          <p className="subtitle">Manage your account, team, and preferences</p>
        </div>
      </div>

      <div className="profile-tabs">
        <button
          className={`tab-button ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          {React.createElement(FiUser as any)} Account
        </button>
        <button
          className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          {React.createElement(FiSettings as any)} Settings
        </button>
        <button
          className={`tab-button ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          {React.createElement(FiBell as any)} Notifications
        </button>
        <button
          className={`tab-button ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          {React.createElement(FiUsers as any)} Members
        </button>
        <button
          className={`tab-button ${activeTab === 'billing' ? 'active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          {React.createElement(FiCreditCard as any)} Billing
        </button>
        <button
          className={`tab-button ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          {React.createElement(FiZap as any)} Integrations
        </button>
      </div>

      <div className="profile-container">
        <div className="profile-content">
          {/* Account Tab */}
          {activeTab === 'account' && (
            <div className="tab-content">
              <div className="section-card">
                <div className="content-header">
                  <h2>Profile Information</h2>
                  {!isEditing ? (
                    <button className="btn-primary" onClick={() => setIsEditing(true)}>
                      {React.createElement(FiEdit2 as any)} Edit Profile
                    </button>
                  ) : (
                    <div className="edit-actions">
                      <button className="btn-secondary" onClick={() => {setIsEditing(false); setEditedProfile(profile);}}>
                        Cancel
                      </button>
                      <button className="btn-primary" onClick={handleProfileUpdate}>
                        {React.createElement(FiSave as any)} Save Changes
                      </button>
                    </div>
                  )}
                </div>

                <div className="profile-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>{React.createElement(FiMail as any)} Email Address</label>
                      <input
                        type="email"
                        value={isEditing ? editedProfile.email : profile.email}
                        onChange={(e) => setEditedProfile({...editedProfile, email: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div className="form-group">
                      <label>{React.createElement(FiUser as any)} Username</label>
                      <input
                        type="text"
                        value={profile.username}
                        disabled
                        className="disabled-input"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>{React.createElement(MdStore as any)} Company Name</label>
                      <input
                        type="text"
                        value={isEditing ? editedProfile.company : profile.company}
                        onChange={(e) => setEditedProfile({...editedProfile, company: e.target.value})}
                        disabled={!isEditing}
                        placeholder="Your company name"
                      />
                    </div>
                    <div className="form-group">
                      <label>{React.createElement(FiUser as any)} Phone Number</label>
                      <input
                        type="tel"
                        value={isEditing ? editedProfile.phone : profile.phone}
                        onChange={(e) => setEditedProfile({...editedProfile, phone: e.target.value})}
                        disabled={!isEditing}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>{React.createElement(FiCalendar as any)} Timezone</label>
                      <select
                        value={isEditing ? editedProfile.timezone : profile.timezone}
                        onChange={(e) => setEditedProfile({...editedProfile, timezone: e.target.value})}
                        disabled={!isEditing}
                      >
                        <option value="America/New_York">Eastern Time (ET)</option>
                        <option value="America/Chicago">Central Time (CT)</option>
                        <option value="America/Denver">Mountain Time (MT)</option>
                        <option value="America/Los_Angeles">Pacific Time (PT)</option>
                        <option value="Europe/London">London (GMT)</option>
                        <option value="Europe/Paris">Paris (CET)</option>
                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{React.createElement(FiShield as any)} Account Role</label>
                      <input
                        type="text"
                        value={profile.role}
                        disabled
                        className="disabled-input"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Security</h2>
                </div>
                
                <div className="security-section">
                  <div className="security-item">
                    <div className="security-info">
                      <h3>{React.createElement(FiLock as any)} Password</h3>
                      <p>Last changed 30 days ago</p>
                    </div>
                    {!isChangingPassword ? (
                      <button className="btn-secondary" onClick={() => setIsChangingPassword(true)}>
                        Change Password
                      </button>
                    ) : (
                      <button className="btn-secondary" onClick={() => {
                        setIsChangingPassword(false);
                        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                      }}>
                        Cancel
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
                          placeholder="Enter new password (min. 8 characters)"
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
                      <button className="btn-primary" onClick={handlePasswordChange}>
                        Update Password
                      </button>
                    </div>
                  )}

                  <div className="security-item">
                    <div className="security-info">
                      <h3>{React.createElement(FiShield as any)} Two-Factor Authentication</h3>
                      <p>Add an extra layer of security to your account</p>
                    </div>
                    <span className="badge-warning">Not Enabled</span>
                  </div>

                  <div className="security-item">
                    <div className="security-info">
                      <h3>{React.createElement(FiKey as any)} API Keys</h3>
                      <p>Manage API keys for third-party integrations</p>
                    </div>
                    <button className="btn-secondary">Manage Keys</button>
                  </div>
                </div>
              </div>

              <div className="danger-zone">
                <h3>Danger Zone</h3>
                <div className="danger-item">
                  <div>
                    <h4>Delete Account</h4>
                    <p>Permanently delete your account and all associated data</p>
                  </div>
                  <button className="btn-danger">Delete Account</button>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="tab-content">
              <div className="section-card">
                <div className="content-header">
                  <h2>General Settings</h2>
                </div>

                <div className="settings-grid">
                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>{React.createElement(FiGlobe as any)} Language</h3>
                      <p>Choose your preferred language</p>
                    </div>
                    <select
                      value={settings.language}
                      onChange={(e) => handleSettingChange('language', e.target.value)}
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                    </select>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>{React.createElement(FiCalendar as any)} Date Format</h3>
                      <p>How dates are displayed</p>
                    </div>
                    <select
                      value={settings.dateFormat}
                      onChange={(e) => handleSettingChange('dateFormat', e.target.value)}
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>{React.createElement(FiDollarSign as any)} Currency</h3>
                      <p>Default currency for your account</p>
                    </div>
                    <select
                      value={settings.currency}
                      onChange={(e) => handleSettingChange('currency', e.target.value)}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Preferences</h2>
                </div>

                <div className="preference-list">
                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>Auto-save</h3>
                      <p>Automatically save changes as you work</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.autoSave}
                        onChange={(e) => handleSettingChange('autoSave', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>Dark Mode</h3>
                      <p>Use dark theme for better visibility in low light</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.darkMode}
                        onChange={(e) => handleSettingChange('darkMode', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>Compact View</h3>
                      <p>Show more information in less space</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.compactView}
                        onChange={(e) => handleSettingChange('compactView', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>Show Tutorials</h3>
                      <p>Display helpful tips and tutorials</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.showTutorials}
                        onChange={(e) => handleSettingChange('showTutorials', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Export & Import</h2>
                </div>

                <div className="export-section">
                  <div className="export-item">
                    <div>
                      <h3>Export Data</h3>
                      <p>Download all your data in CSV format</p>
                    </div>
                    <button className="btn-secondary">
                      {React.createElement(FiDatabase as any)} Export Data
                    </button>
                  </div>

                  <div className="export-item">
                    <div>
                      <h3>Import Data</h3>
                      <p>Bulk import data from CSV files</p>
                    </div>
                    <button className="btn-secondary">
                      {React.createElement(FiDatabase as any)} Import Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="tab-content">
              <div className="section-card">
                <div className="content-header">
                  <h2>Email Notifications</h2>
                </div>

                <div className="notification-settings">
                  <div className="setting-item">
                    <div className="setting-info">
                      <h3>All Email Notifications</h3>
                      <p>Master switch for all email notifications</p>
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

                  <div className="notification-group">
                    <h3>Sales & Forecasting</h3>
                    
                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Forecast Ready</h4>
                        <p>When new sales forecasts are generated</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.forecastReady}
                          onChange={() => handleNotificationToggle('forecastReady')}
                          disabled={!notifications.emailAlerts}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>

                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Weekly Reports</h4>
                        <p>Weekly performance and analytics summary</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.weeklyReports}
                          onChange={() => handleNotificationToggle('weeklyReports')}
                          disabled={!notifications.emailAlerts}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>

                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Sales Milestones</h4>
                        <p>When you reach important sales goals</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.salesMilestones}
                          onChange={() => handleNotificationToggle('salesMilestones')}
                          disabled={!notifications.emailAlerts}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>

                  <div className="notification-group">
                    <h3>Inventory & Orders</h3>
                    
                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Low Inventory Alerts</h4>
                        <p>When products are running low on stock</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.lowInventory}
                          onChange={() => handleNotificationToggle('lowInventory')}
                          disabled={!notifications.emailAlerts}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>

                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Order Alerts</h4>
                        <p>Important order status updates</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.orderAlerts}
                          onChange={() => handleNotificationToggle('orderAlerts')}
                          disabled={!notifications.emailAlerts}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>

                  <div className="notification-group">
                    <h3>System</h3>
                    
                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>System Updates</h4>
                        <p>Important updates and maintenance notifications</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={notifications.systemUpdates}
                          onChange={() => handleNotificationToggle('systemUpdates')}
                          disabled={!notifications.emailAlerts}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Notification Schedule</h2>
                </div>

                <div className="schedule-info">
                  <p>Configure when you want to receive notifications</p>
                  <div className="schedule-grid">
                    <div className="schedule-item">
                      <label>Daily Summary Time</label>
                      <input type="time" defaultValue="09:00" />
                    </div>
                    <div className="schedule-item">
                      <label>Weekly Report Day</label>
                      <select defaultValue="monday">
                        <option value="monday">Monday</option>
                        <option value="tuesday">Tuesday</option>
                        <option value="wednesday">Wednesday</option>
                        <option value="thursday">Thursday</option>
                        <option value="friday">Friday</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="tab-content">
              <div className="section-card">
                <div className="content-header">
                  <h2>Team Members</h2>
                  <button className="btn-primary" onClick={() => setShowInviteMember(true)}>
                    {React.createElement(FiPlus as any)} Invite Member
                  </button>
                </div>

                <div className="members-list">
                  {teamMembers.map(member => (
                    <div key={member.id} className="member-item">
                      <div className="member-info">
                        <div className="member-avatar">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4>{member.name} {member.id === '1' && '(You)'}</h4>
                          <p>{member.email}</p>
                        </div>
                      </div>
                      <div className="member-meta">
                        <span className={`role-badge ${getRoleBadgeClass(member.role)}`}>
                          {member.role}
                        </span>
                        <span className={`status-badge ${member.status}`}>
                          {member.status}
                        </span>
                        {member.role !== 'owner' && (
                          <button
                            className="btn-icon"
                            onClick={() => handleRemoveMember(member.id)}
                            title="Remove member"
                          >
                            {React.createElement(FiTrash2 as any)}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {showInviteMember && (
                  <div className="invite-form">
                    <h3>Invite New Member</h3>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Email Address</label>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="member@company.com"
                        />
                      </div>
                      <div className="form-group">
                        <label>Role</label>
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as any)}
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setShowInviteMember(false);
                          setInviteEmail('');
                        }}
                      >
                        Cancel
                      </button>
                      <button className="btn-primary" onClick={handleInviteMember}>
                        Send Invitation
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Roles & Permissions</h2>
                </div>

                <div className="roles-grid">
                  <div className="role-card">
                    <h3>Owner</h3>
                    <ul>
                      <li>Full access to all features</li>
                      <li>Manage billing & subscription</li>
                      <li>Add/remove team members</li>
                      <li>Delete organization</li>
                    </ul>
                  </div>
                  <div className="role-card">
                    <h3>Admin</h3>
                    <ul>
                      <li>Access all stores & data</li>
                      <li>Create & edit forecasts</li>
                      <li>Manage integrations</li>
                      <li>Invite team members</li>
                    </ul>
                  </div>
                  <div className="role-card">
                    <h3>Member</h3>
                    <ul>
                      <li>View assigned stores</li>
                      <li>Create forecasts</li>
                      <li>Upload data</li>
                      <li>View reports</li>
                    </ul>
                  </div>
                  <div className="role-card">
                    <h3>Viewer</h3>
                    <ul>
                      <li>View data only</li>
                      <li>Export reports</li>
                      <li>No editing access</li>
                      <li>Limited to assigned stores</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="tab-content">
              <div className="section-card">
                <div className="content-header">
                  <h2>Current Plan</h2>
                  <button className="btn-primary">Upgrade Plan</button>
                </div>

                <div className="plan-details">
                  <div className="plan-header">
                    <h3>Professional Plan</h3>
                    <div className="plan-price">
                      <span className="currency">$</span>
                      <span className="amount">99</span>
                      <span className="period">/month</span>
                    </div>
                  </div>

                  <div className="plan-features">
                    <h4>What's included:</h4>
                    <ul>
                      <li>{React.createElement(FiCheck as any)} Up to 10 stores</li>
                      <li>{React.createElement(FiCheck as any)} Unlimited forecasts</li>
                      <li>{React.createElement(FiCheck as any)} Advanced analytics</li>
                      <li>{React.createElement(FiCheck as any)} API access</li>
                      <li>{React.createElement(FiCheck as any)} Priority support</li>
                      <li>{React.createElement(FiCheck as any)} Team collaboration (up to 5 members)</li>
                    </ul>
                  </div>

                  <div className="plan-usage">
                    <h4>Current Usage</h4>
                    <div className="usage-grid">
                      <div className="usage-item">
                        <span>Stores</span>
                        <span>2 / 10</span>
                      </div>
                      <div className="usage-item">
                        <span>Team Members</span>
                        <span>{teamMembers.length} / 5</span>
                      </div>
                      <div className="usage-item">
                        <span>API Calls</span>
                        <span>1,234 / 100,000</span>
                      </div>
                      <div className="usage-item">
                        <span>Storage</span>
                        <span>125 MB / 5 GB</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Payment Method</h2>
                  <button className="btn-secondary">Update</button>
                </div>

                <div className="payment-method">
                  <div className="card-info">
                    {React.createElement(FiCreditCard as any, { size: 24 })}
                    <div>
                      <h4>•••• •••• •••• 4242</h4>
                      <p>Expires 12/2026</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Billing History</h2>
                  <button className="btn-secondary">Download All</button>
                </div>

                <div className="billing-table">
                  <div className="table-header">
                    <span>Date</span>
                    <span>Description</span>
                    <span>Amount</span>
                    <span>Status</span>
                    <span>Invoice</span>
                  </div>
                  <div className="table-row">
                    <span>Feb 1, 2025</span>
                    <span>Professional Plan - Monthly</span>
                    <span>$99.00</span>
                    <span className="status-success">Paid</span>
                    <button className="btn-link">Download</button>
                  </div>
                  <div className="table-row">
                    <span>Jan 1, 2025</span>
                    <span>Professional Plan - Monthly</span>
                    <span>$99.00</span>
                    <span className="status-success">Paid</span>
                    <button className="btn-link">Download</button>
                  </div>
                  <div className="table-row">
                    <span>Dec 1, 2024</span>
                    <span>Professional Plan - Monthly</span>
                    <span>$99.00</span>
                    <span className="status-success">Paid</span>
                    <button className="btn-link">Download</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && (
            <div className="tab-content">
              <div className="section-card">
                <div className="content-header">
                  <h2>Available Integrations</h2>
                </div>

                <div className="integrations-grid">
                  {integrations.map(integration => (
                    <div key={integration.id} className="integration-card">
                      <div className="integration-header">
                        <div className="integration-icon">
                          {React.createElement(integration.icon, { size: 32 })}
                        </div>
                        <span className={`status-badge ${integration.status}`}>
                          {integration.status === 'connected' ? 'Connected' : 'Not Connected'}
                        </span>
                      </div>
                      <h3>{integration.name}</h3>
                      <p>{integration.description}</p>
                      {integration.lastSync && (
                        <p className="last-sync">Last synced: {formatDateTime(integration.lastSync)}</p>
                      )}
                      <button
                        className={integration.status === 'connected' ? 'btn-secondary' : 'btn-primary'}
                        onClick={() => handleIntegrationToggle(integration.id)}
                      >
                        {integration.status === 'connected' ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>API Access</h2>
                </div>

                <div className="api-section">
                  <div className="api-info">
                    <h3>REST API</h3>
                    <p>Access your data programmatically with our REST API</p>
                    <div className="api-endpoint">
                      <code>https://api.ordernimbus.com/v1</code>
                    </div>
                  </div>

                  <div className="api-keys">
                    <h4>API Keys</h4>
                    <div className="key-item">
                      <div>
                        <h5>Production Key</h5>
                        <code>sk_live_****************************7a8b</code>
                      </div>
                      <button className="btn-secondary">Regenerate</button>
                    </div>
                    <div className="key-item">
                      <div>
                        <h5>Test Key</h5>
                        <code>sk_test_****************************9c2d</code>
                      </div>
                      <button className="btn-secondary">Regenerate</button>
                    </div>
                  </div>

                  <div className="api-docs">
                    <button className="btn-primary">
                      View API Documentation
                    </button>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="content-header">
                  <h2>Webhooks</h2>
                  <button className="btn-primary">Add Webhook</button>
                </div>

                <div className="webhooks-info">
                  <p>Receive real-time notifications when events happen in your account</p>
                  <div className="webhook-list">
                    <p className="empty-state">No webhooks configured yet</p>
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