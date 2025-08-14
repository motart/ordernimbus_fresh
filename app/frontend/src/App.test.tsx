import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders loading state initially', () => {
  render(<App />);
  const loadingElement = screen.getByText(/Initializing OrderNimbus.../i);
  expect(loadingElement).toBeInTheDocument();
});
