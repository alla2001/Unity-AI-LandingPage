// Page routes - handles rendering of views
const express = require('express');
const router = express.Router();
const { authenticateToken, redirectIfAuthenticated } = require('../middleware/auth');

// Landing page
router.get('/', (req, res) => {
  res.render('landing');
});

// Login page
router.get('/login', redirectIfAuthenticated, (req, res) => {
  const error = req.query.error || null;
  res.render('login', { error });
});

// Register page
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register');
});

// Dashboard page (requires authentication)
router.get('/dashboard', authenticateToken, (req, res) => {
  res.render('dashboard', {
    user: req.user,
    payment: req.query.payment || null,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    baseUrl: process.env.BASE_URL
  });
});

module.exports = router;