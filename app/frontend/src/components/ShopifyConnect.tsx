import React, { useState, useEffect } from 'react';
import { SiShopify } from 'react-icons/si';
import { FiCheck, FiLoader, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './ShopifyConnect.css';

interface ShopifyConnectProps {
  userId: string;
  onSuccess: (storeData: any) => void;
  onCancel: () => void;
}

const ShopifyConnect: React.FC<ShopifyConnectProps> = ({ userId, onSuccess, onCancel }) => {
  const [step, setStep] = useState<'input' | 'connecting' | 'success' | 'error'>('input');
  const [storeDomain, setStoreDomain] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useCustomApp, setUseCustomApp] = useState(false);

  useEffect(() => {
    // Listen for OAuth callback message
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'shopify-oauth-success') {
        setStep('success');
        toast.success('Shopify store connected successfully!');
        setTimeout(() => {
          onSuccess(event.data.data);
        }, 1500);
      } else if (event.data.type === 'shopify-oauth-error') {
        setStep('error');
        setError(event.data.error || 'Failed to connect to Shopify');
        toast.error('Failed to connect to Shopify');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  const handleConnect = async () => {
    if (!storeDomain) {
      toast.error('Please enter your Shopify store domain');
      return;
    }

    if (useCustomApp && !apiToken) {
      toast.error('Please enter your Shopify Custom App token');
      return;
    }

    // Clean up domain
    let cleanDomain = storeDomain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    // Add .myshopify.com if not present
    if (!cleanDomain.includes('.myshopify.com')) {
      cleanDomain = cleanDomain.replace('.com', '') + '.myshopify.com';
    }

    setLoading(true);
    setStep('connecting');

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:3001';
      
      if (useCustomApp) {
        // Custom App mode - directly create store with token
        const response = await fetch(`${apiUrl}/api/stores`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'userId': userId
          },
          body: JSON.stringify({
            name: cleanDomain.replace('.myshopify.com', ''),
            displayName: cleanDomain.replace('.myshopify.com', ''),
            type: 'shopify',
            shopifyDomain: cleanDomain,
            apiKey: apiToken,
            status: 'active'
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create store');
        }

        const result = await response.json();
        
        // Test the connection by syncing data
        const syncResponse = await fetch(`${apiUrl}/api/shopify/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'userId': userId
          },
          body: JSON.stringify({
            userId,
            storeId: result.store.id,
            shopifyDomain: cleanDomain,
            apiKey: apiToken,
            syncType: 'full'
          })
        });

        if (syncResponse.ok) {
          setStep('success');
          toast.success('Shopify store connected successfully!');
          setTimeout(() => {
            onSuccess({ storeId: result.store.id, storeName: result.store.name });
          }, 1500);
        } else {
          throw new Error('Failed to sync data - check your token permissions');
        }
        
      } else {
        // OAuth mode - original flow
        const response = await fetch(`${apiUrl}/api/shopify/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            storeDomain: cleanDomain
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to initiate connection');
        }

        const { authUrl } = await response.json();

        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
          authUrl,
          'shopify-oauth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );

        // Check if popup was blocked
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          toast.error('Please allow popups for this site to connect to Shopify');
          setStep('error');
          setError('Popup was blocked. Please allow popups and try again.');
        }
      }

    } catch (error: any) {
      console.error('Connection error:', error);
      setStep('error');
      setError(error.message || 'Failed to connect to Shopify');
      toast.error('Failed to connect to Shopify');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shopify-connect-modal">
      <div className="shopify-connect-content">
        <div className="shopify-connect-header">
          {React.createElement(SiShopify as any, { className: "shopify-logo" })}
          <h2>Connect Your Shopify Store</h2>
        </div>

        {step === 'input' && (
          <>
            <p className="shopify-connect-description">
              Connect your Shopify store to OrderNimbus. Choose between OAuth (recommended for production) 
              or Custom App token (for development/testing).
            </p>

            <div className="connection-mode-toggle">
              <label className="toggle-label">
                <input
                  type="radio"
                  name="connectionMode"
                  checked={!useCustomApp}
                  onChange={() => setUseCustomApp(false)}
                />
                <span>OAuth (Production)</span>
              </label>
              <label className="toggle-label">
                <input
                  type="radio"
                  name="connectionMode"
                  checked={useCustomApp}
                  onChange={() => setUseCustomApp(true)}
                />
                <span>Custom App Token (Development)</span>
              </label>
            </div>

            <div className="shopify-connect-form">
              <label htmlFor="storeDomain">Store Domain</label>
              <div className="domain-input-wrapper">
                <input
                  type="text"
                  id="storeDomain"
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                  placeholder={useCustomApp ? "ordernimbus-dev" : "mystore"}
                  disabled={loading}
                  onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
                />
                <span className="domain-suffix">.myshopify.com</span>
              </div>
              <small className="input-help">
                Enter the first part of your Shopify domain (e.g., "mystore" for mystore.myshopify.com)
              </small>

              {useCustomApp && (
                <>
                  <label htmlFor="apiToken" style={{ marginTop: '16px' }}>Custom App Admin API Token</label>
                  <input
                    type="password"
                    id="apiToken"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="shpat_..."
                    disabled={loading}
                    onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
                    style={{ marginTop: '4px' }}
                  />
                  <small className="input-help">
                    Enter your Custom App's Admin API access token (starts with "shpat_")
                  </small>
                </>
              )}
            </div>

            <div className="shopify-connect-benefits">
              <h3>What we'll import:</h3>
              <ul>
                <li>{React.createElement(FiCheck as any)} All your products and variants</li>
                <li>{React.createElement(FiCheck as any)} Order history (last 90 days)</li>
                <li>{React.createElement(FiCheck as any)} Current inventory levels</li>
                <li>{React.createElement(FiCheck as any)} Customer data for analytics</li>
              </ul>
            </div>

            <div className="shopify-connect-actions">
              <button className="btn-cancel" onClick={onCancel}>
                Cancel
              </button>
              <button 
                className="btn-connect" 
                onClick={handleConnect}
                disabled={loading || !storeDomain || (useCustomApp && !apiToken)}
              >
                {loading ? (
                  <>
                    {React.createElement(FiLoader as any, { className: "spinner" })}
                    Connecting...
                  </>
                ) : (
                  <>
                    {React.createElement(SiShopify as any)}
                    Connect to Shopify
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === 'connecting' && (
          <div className="shopify-connect-status">
            {React.createElement(FiLoader as any, { className: "status-icon spinner" })}
            <h3>Connecting to Shopify...</h3>
            <p>Please approve the connection in the popup window.</p>
            <p className="status-hint">
              If you don't see a popup, please check your browser's popup blocker.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="shopify-connect-status">
            {React.createElement(FiCheck as any, { className: "status-icon success" })}
            <h3>Successfully Connected!</h3>
            <p>Your Shopify store has been connected. Importing your data...</p>
          </div>
        )}

        {step === 'error' && (
          <div className="shopify-connect-status">
            {React.createElement(FiAlertCircle as any, { className: "status-icon error" })}
            <h3>Connection Failed</h3>
            <p>{error}</p>
            <div className="shopify-connect-actions">
              <button className="btn-cancel" onClick={onCancel}>
                Cancel
              </button>
              <button className="btn-connect" onClick={() => setStep('input')}>
                Try Again
              </button>
            </div>
          </div>
        )}

        <div className="shopify-connect-footer">
          <p>
            <strong>Need help?</strong> Make sure you have:
          </p>
          <ul>
            <li>A Shopify store (development or production)</li>
            <li>Admin access to install apps</li>
            <li>Popups enabled for this site</li>
          </ul>
          <p className="footer-note">
            Don't have a Shopify store? Create a free development store at{' '}
            <a href="https://partners.shopify.com" target="_blank" rel="noopener noreferrer">
              partners.shopify.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShopifyConnect;