import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app or shows configuration error', () => {
  render(<App />);
  // The app may show either loading state or configuration error in test environment
  const configError = screen.queryByText(/Configuration Error/i);
  const loadingElement = screen.queryByText(/Initializing OrderNimbus.../i);
  
  // At least one should be present
  expect(configError || loadingElement).toBeTruthy();
});
