import React, { useState, useEffect } from 'react';
import { SiShopify } from 'react-icons/si';
import { FiCheck, FiLoader, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './ShopifyConnect.css';
import { getApiUrl, debugLog } from '../config/environment';

interface ShopifyConnectProps {
  userId: string;
  onSuccess: (storeData: any) => void;
  onCancel: () => void;
}

const ShopifyConnect: React.FC<ShopifyConnectProps> = ({ userId, onSuccess, onCancel }) => {
  const [step, setStep] = useState<'input' | 'connecting' | 'success' | 'error'>('input');
  const [storeDomain, setStoreDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Single message handler for OAuth callback
    const handleMessage = (event: MessageEvent) => {
      console.log('Received message:', event.data);
      
      if (event.data.type === 'shopify-oauth-success') {
        console.log('OAuth success received:', event.data.data);
        setStep('success');
        setLoading(false);
        toast.success('Shopify store connected successfully!');
        setTimeout(() => {
          onSuccess(event.data.data);
        }, 1500);
      } else if (event.data.type === 'shopify-oauth-error') {
        console.log('OAuth error received:', event.data.error);
        setStep('error');
        setLoading(false);
        setError(event.data.error || 'Failed to connect to Shopify');
        toast.error('Failed to connect to Shopify: ' + event.data.error);
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

    // Clean up domain
    let cleanDomain = storeDomain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    // Add .myshopify.com if not present
    if (!cleanDomain.includes('.myshopify.com')) {
      cleanDomain = cleanDomain.replace('.com', '') + '.myshopify.com';
    }

    setLoading(true);
    setStep('connecting');
    setError('');

    try {
      const apiUrl = getApiUrl();
      debugLog('Connecting to:', cleanDomain, 'via API:', apiUrl);
      
      // Always use OAuth mode (no dev/custom app logic)
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
      console.log('Got auth URL:', authUrl);

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
        setLoading(false);
        return;
      }

      // Monitor popup close without success message
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          if (step === 'connecting') {
            setStep('error');
            setError('Popup was closed before completing authentication');
            setLoading(false);
            toast.error('Authentication was cancelled');
          }
        }
      }, 1000);

    } catch (error: any) {
      console.error('Connection error:', error);
      setStep('error');
      setError(error.message || 'Failed to connect to Shopify');
      setLoading(false);
      toast.error('Failed to connect to Shopify');
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
              Connect your Shopify store to OrderNimbus using secure OAuth authentication.
              We'll import your products, orders, customers, and inventory data.
            </p>

            <div className="shopify-connect-form">
              <label htmlFor="storeDomain">Store Domain</label>
              <div className="domain-input-wrapper">
                <input
                  type="text"
                  id="storeDomain"
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                  placeholder="mystore"
                  disabled={loading}
                  onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
                />
                <span className="domain-suffix">.myshopify.com</span>
              </div>
              <small className="input-help">
                Enter the first part of your Shopify domain (e.g., "mystore" for mystore.myshopify.com)
              </small>
            </div>

            <div className="shopify-connect-benefits">
              <h3>What we'll import:</h3>
              <ul>
                <li>{React.createElement(FiCheck as any)} All your products and variants</li>
                <li>{React.createElement(FiCheck as any)} Recent orders with customer details</li>
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
                disabled={loading || !storeDomain}
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
            <p>Your Shopify store has been connected and data is being imported...</p>
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
              <button className="btn-connect" onClick={() => {
                setStep('input');
                setError('');
              }}>
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
            <li>A Shopify store with admin access</li>
            <li>Popups enabled for this site</li>
            <li>A stable internet connection</li>
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