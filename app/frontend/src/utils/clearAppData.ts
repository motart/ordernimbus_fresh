/**
 * Utility to clear all application data for a fresh start
 */

export const clearAllAppData = () => {
  // List of all possible localStorage keys used by the app
  const keysToRemove = [
    'ordernimbus_stores',
    'ordernimbus_forecasts', 
    'ordernimbus_settings',
    'ordernimbus_preferences',
    'forecast_history',
    'user_company',
    'user_phone',
    'user_timezone',
    'notification_settings',
    'forecast_preferences'
  ];

  // Remove old keys
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });

  // Also remove any user-specific data
  const userEmail = localStorage.getItem('userEmail');
  if (userEmail) {
    // Remove user-specific keys
    localStorage.removeItem(`stores_${userEmail}`);
    localStorage.removeItem(`sales_data_${userEmail}`);
    localStorage.removeItem(`products_${userEmail}`);
    localStorage.removeItem(`forecasts_${userEmail}`);
  }

  // Clear secure data keys
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    if (key.startsWith('secure_') || key.startsWith('ordernimbus_')) {
      localStorage.removeItem(key);
    }
  });

  console.log('All app data cleared for fresh start');
};

export const hasLegacyData = (): boolean => {
  return !!(
    localStorage.getItem('ordernimbus_stores') ||
    localStorage.getItem('ordernimbus_forecasts') ||
    localStorage.getItem('ordernimbus_settings') ||
    localStorage.getItem('forecast_history')
  );
};