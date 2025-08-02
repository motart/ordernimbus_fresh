const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Mock authentication - in production, integrate with Cognito
  if (email && password) {
    res.json({
      success: true,
      token: 'mock-jwt-token',
      user: { email, name: email.split('@')[0] }
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/api/sales/forecast', (req, res) => {
  // Mock forecast data
  const forecast = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    forecast.push({
      date: date.toISOString(),
      actual: Math.floor(Math.random() * 50000) + 30000,
      predicted: Math.floor(Math.random() * 50000) + 30000,
      confidence: 0.85 + Math.random() * 0.15
    });
  }
  res.json(forecast);
});

app.get('/api/stores', (req, res) => {
  res.json([
    { id: '001', name: 'Downtown Store', location: 'Downtown' },
    { id: '002', name: 'Mall Store', location: 'Shopping Mall' },
    { id: '003', name: 'Airport Store', location: 'International Airport' }
  ]);
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Catch all route - serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OrderNimbus server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});