// Runtime configuration for OrderNimbus
// This file is loaded before React app starts and provides configuration
// that overrides environment variables at build time
window.RUNTIME_CONFIG = {
  REACT_APP_API_URL: 'https://p12brily0d.execute-api.us-west-1.amazonaws.com/production',
  REACT_APP_USER_POOL_ID: 'us-west-1_Ht3X0tii8',
  REACT_APP_CLIENT_ID: '29ebgu8c8tit6aftprjgfmf4p4',
  REACT_APP_REGION: 'us-west-1',
  REACT_APP_ENVIRONMENT: 'production',
  REACT_APP_GRAPHQL_URL: 'https://p12brily0d.execute-api.us-west-1.amazonaws.com/production/graphql',
  REACT_APP_WS_URL: 'wss://p12brily0d.execute-api.us-west-1.amazonaws.com/production/ws',
  REACT_APP_ENABLE_DEBUG: 'false',
  REACT_APP_ENABLE_ANALYTICS: 'true',
  REACT_APP_ENABLE_MOCK_DATA: 'false'
};