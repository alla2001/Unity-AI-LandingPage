/**
 * AI SaaS Platform - Main Server Entry Point
 *
 * This is a production-ready minimal SaaS application with:
 * - User authentication (JWT)
 * - Stripe subscription payments
 * - API key management
 * - AI API endpoint with token deduction
 * - Dashboard for managing account and API keys
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initializeDatabase } = require('./config/database');
const passport = require('./config/passport');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Setup
// Parse JSON bodies (except for Stripe webhook which needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/payment/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware for Passport
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Initialize database (async operation)
initializeDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Start token renewal scheduler
const { startTokenRenewalScheduler } = require('./config/scheduler');
startTokenRenewalScheduler();

// Import routes
const pageRoutes = require('./routes/pages');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const apiKeyRoutes = require('./routes/apikey');
const apiRoutes = require('./routes/api');

// Mount routes
app.use('/', pageRoutes);              // Landing, login, register, dashboard pages
app.use('/auth', authRoutes);          // Authentication endpoints
app.use('/payment', paymentRoutes);    // Stripe payment & subscription endpoints
app.use('/apikey', apiKeyRoutes);      // API key management endpoints
app.use('/api', apiRoutes);            // AI API endpoints

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 AI SaaS Platform Server Started');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('📋 Available Routes:');
  console.log(`   Landing Page:  http://localhost:${PORT}/`);
  console.log(`   Login:         http://localhost:${PORT}/login`);
  console.log(`   Register:      http://localhost:${PORT}/register`);
  console.log(`   Dashboard:     http://localhost:${PORT}/dashboard`);
  console.log(`   API Endpoint:  http://localhost:${PORT}/api/v1/ai`);
  console.log('');
  console.log('⚙️  Next Steps:');
  console.log('   1. Copy .env.example to .env');
  console.log('   2. Add your Stripe API keys to .env');
  console.log('   3. Create products in Stripe dashboard');
  console.log('   4. Update Stripe Price IDs in .env');
  console.log('');
  console.log('💡 Features:');
  console.log('   ✓ User registration with 20 free tokens');
  console.log('   ✓ JWT authentication');
  console.log('   ✓ Stripe subscription payments');
  console.log('   ✓ API key generation & management');
  console.log('   ✓ AI API endpoint with token deduction');
  console.log('   ✓ Dashboard for account management');
  console.log('═══════════════════════════════════════════════════════');
});

module.exports = app;