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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const { initializeDatabase } = require('./config/database');
const passport = require('./config/passport');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security: Helmet - Set security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Security: Rate Limiting
// General rate limiter for all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts, please try again in 15 minutes',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter (per IP or API key)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'API rate limit exceeded, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use API key user ID if available, otherwise IP
    return req.apiKeyData?.user_id?.toString() || req.ip;
  }
});

// Apply general rate limiter to all routes
app.use(generalLimiter);

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
    httpOnly: true,
    sameSite: 'strict',
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

// Security: CSRF Protection (skip for API, webhook, and auth JSON endpoints)
const csrfProtection = csrf({ cookie: true });
app.use((req, res, next) => {
  // Skip CSRF for API routes (they use API keys), webhooks, and auth endpoints (they have rate limiting)
  if (req.path.startsWith('/api/v1/') ||
      req.path === '/payment/webhook' ||
      req.path.startsWith('/auth/')) {
    return next();
  }
  csrfProtection(req, res, next);
});

// Make CSRF token available to all views
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;
  next();
});

// Import routes
const pageRoutes = require('./routes/pages');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const apiKeyRoutes = require('./routes/apikey');
const apiRoutes = require('./routes/api');

// Export rate limiters for use in routes
app.locals.authLimiter = authLimiter;
app.locals.apiLimiter = apiLimiter;

// Mount routes
app.use('/', pageRoutes);              // Landing, login, register, dashboard pages
app.use('/auth', authLimiter, authRoutes);          // Authentication endpoints (with rate limiting)
app.use('/payment', paymentRoutes);    // Stripe payment & subscription endpoints
app.use('/apikey', apiKeyRoutes);      // API key management endpoints
app.use('/api/v1', apiLimiter, apiRoutes);            // AI API endpoints (with rate limiting)

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