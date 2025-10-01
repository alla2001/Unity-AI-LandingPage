// Authentication routes - handles user registration and login
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const {
  createUser,
  getUserByEmail,
  setVerificationToken,
  getUserByVerificationToken,
  verifyEmail
} = require('../config/database');
const { redirectIfAuthenticated } = require('../middleware/auth');
const { sendVerificationEmail } = require('../config/email');

// Registration endpoint
router.post('/register',
  redirectIfAuthenticated,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map(e => e.msg)
        });
      }

      const { email, password } = req.body;

      // Check if user already exists
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user with 20 free tokens
      const result = await createUser(email, passwordHash);
      const userId = Number(result.lastInsertRowid);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await setVerificationToken(verificationToken, userId);

      // Send verification email
      await sendVerificationEmail(email, verificationToken);

      // Generate JWT token for immediate login
      const token = jwt.sign(
        { userId: userId },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({
        success: true,
        message: 'Account created successfully! Please verify your email to get 20 free tokens.',
        redirect: '/dashboard'
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during registration'
      });
    }
  }
);

// Login endpoint
router.post('/login',
  redirectIfAuthenticated,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const { email, password } = req.body;

      // Find user
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Login successful',
        redirect: '/dashboard'
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during login'
      });
    }
  }
);

// Logout endpoint
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

// Google OAuth routes
const passport = require('passport');

// Initiate Google OAuth
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=Google login failed' }),
  (req, res) => {
    // Generate JWT token for the authenticated user
    const token = jwt.sign(
      { userId: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.redirect('/dashboard');
  }
);

// Email verification endpoint
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect('/dashboard?error=Invalid verification link');
    }

    // Find user by verification token
    const user = await getUserByVerificationToken(token);

    if (!user) {
      return res.redirect('/dashboard?error=Invalid or expired verification link');
    }

    if (user.email_verified) {
      return res.redirect('/dashboard?success=Email already verified');
    }

    // Verify email
    await verifyEmail(user.id);

    res.redirect('/dashboard?success=Email verified successfully! Enjoy your tokens.');
  } catch (error) {
    console.error('Email verification error:', error);
    res.redirect('/dashboard?error=Verification failed');
  }
});

module.exports = router;