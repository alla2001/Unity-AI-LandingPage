// Authentication middleware - verifies JWT tokens for protected routes
const jwt = require('jsonwebtoken');
const { getUserById } = require('../config/database');

// Middleware to verify JWT token and attach user to request
function authenticateToken(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect('/login?error=Please log in to continue');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = getUserById.get(decoded.userId);

    if (!user) {
      res.clearCookie('token');
      return res.redirect('/login?error=Invalid session');
    }

    // Attach user to request (exclude password)
    req.user = {
      id: user.id,
      email: user.email,
      tokens: user.tokens,
      subscription_tier: user.subscription_tier,
      subscription_status: user.subscription_status,
      stripe_customer_id: user.stripe_customer_id
    };

    next();
  } catch (error) {
    res.clearCookie('token');
    return res.redirect('/login?error=Session expired');
  }
}

// Middleware to check if user is already authenticated (for login/register pages)
function redirectIfAuthenticated(req, res, next) {
  const token = req.cookies.token;

  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return res.redirect('/dashboard');
    } catch (error) {
      res.clearCookie('token');
    }
  }

  next();
}

module.exports = {
  authenticateToken,
  redirectIfAuthenticated
};