// Payment routes - handles Stripe subscription management
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticateToken } = require('../middleware/auth');
const { updateUserSubscription, addTokensToUser, getUserById } = require('../config/database');

// Subscription tier configuration
const SUBSCRIPTION_TIERS = {
  tier1: {
    name: 'Starter',
    price: 15,
    tokens: 200,
    priceId: process.env.STRIPE_PRICE_TIER1
  },
  tier2: {
    name: 'Pro',
    price: 35,
    tokens: 1000,
    priceId: process.env.STRIPE_PRICE_TIER2
  }
};

// Create Stripe checkout session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { tier } = req.body;

    if (!tier || !SUBSCRIPTION_TIERS[tier]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription tier'
      });
    }

    const tierInfo = SUBSCRIPTION_TIERS[tier];
    let customerId = req.user.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: {
          userId: req.user.id.toString()
        }
      });
      customerId = customer.id;
    }

    // Ensure BASE_URL doesn't have trailing slash
    const baseUrl = process.env.BASE_URL.replace(/\/$/, '');

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: tierInfo.priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard?payment=success`,
      cancel_url: `${baseUrl}/dashboard?payment=cancelled`,
      metadata: {
        userId: req.user.id.toString(),
        tier: tier
      }
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session'
    });
  }
});

// Stripe webhook endpoint - handles subscription events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = parseInt(session.metadata.userId);
        const tier = session.metadata.tier;
        const tierInfo = SUBSCRIPTION_TIERS[tier];

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription);

        // Update user subscription in database
        await updateUserSubscription(
          tier,
          session.customer,
          subscription.id,
          subscription.status,
          userId
        );

        // Add tokens to user account
        await addTokensToUser(tierInfo.tokens, userId);

        console.log(`✓ Subscription created for user ${userId}: ${tier}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userId = parseInt(customer.metadata.userId);

        // Detect which tier based on the price ID in the subscription
        let newTier = null;
        if (subscription.items && subscription.items.data.length > 0) {
          const priceId = subscription.items.data[0].price.id;

          // Find matching tier
          for (const [tierKey, tierInfo] of Object.entries(SUBSCRIPTION_TIERS)) {
            if (tierInfo.priceId === priceId) {
              newTier = tierKey;
              break;
            }
          }
        }

        // If we detected a tier change, add tokens for the new tier
        const user = await getUserById(userId);
        if (user && newTier && newTier !== user.subscription_tier) {
          const tierInfo = SUBSCRIPTION_TIERS[newTier];

          // Update subscription with new tier
          await updateUserSubscription(
            newTier,
            subscription.customer,
            subscription.id,
            subscription.status,
            userId
          );

          // Add tokens for the upgrade
          await addTokensToUser(tierInfo.tokens, userId);

          console.log(`✓ Subscription upgraded for user ${userId}: ${user.subscription_tier} → ${newTier}, added ${tierInfo.tokens} tokens`);
        } else {
          // Just update status if no tier change
          await updateUserSubscription(
            user?.subscription_tier || newTier,
            subscription.customer,
            subscription.id,
            subscription.status,
            userId
          );

          console.log(`✓ Subscription updated for user ${userId}: ${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userId = parseInt(customer.metadata.userId);

        // Cancel subscription
        await updateUserSubscription(
          null,
          subscription.customer,
          null,
          'canceled',
          userId
        );

        console.log(`✓ Subscription canceled for user ${userId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userId = parseInt(customer.metadata.userId);

        // Find which tier this subscription is
        const user = await getUserById(userId);
        if (user && user.subscription_tier) {
          const tierInfo = SUBSCRIPTION_TIERS[user.subscription_tier];

          // Add monthly tokens
          await addTokensToUser(tierInfo.tokens, userId);

          console.log(`✓ Monthly tokens added for user ${userId}: ${tierInfo.tokens} tokens`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userId = parseInt(customer.metadata.userId);

        console.log(`✗ Payment failed for user ${userId}`);
        break;
      }
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Create Stripe Customer Portal session for managing payment methods and subscriptions
router.post('/create-portal-session', authenticateToken, async (req, res) => {
  try {
    if (!req.user.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        message: 'No payment account found. Please subscribe to a plan first.'
      });
    }

    const baseUrl = process.env.BASE_URL.replace(/\/$/, '');

    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${baseUrl}/dashboard`,
    });

    res.json({
      success: true,
      url: session.url
    });

  } catch (error) {
    console.error('Portal session error:', error);

    // Check if this is a configuration error
    if (error.message && error.message.includes('configuration')) {
      return res.status(500).json({
        success: false,
        message: 'Payment portal not configured. Please contact support or use the Cancel Subscription button instead.',
        error: 'STRIPE_PORTAL_NOT_CONFIGURED'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create portal session. Please try again later.'
    });
  }
});

// Cancel subscription
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
  try {
    if (!req.user.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Cancel subscription at period end
    await stripe.subscriptions.update(req.user.stripe_subscription_id, {
      cancel_at_period_end: true
    });

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period'
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

// Get subscription tiers info
router.get('/tiers', (req, res) => {
  res.json({
    success: true,
    tiers: {
      tier1: {
        name: SUBSCRIPTION_TIERS.tier1.name,
        price: SUBSCRIPTION_TIERS.tier1.price,
        tokens: SUBSCRIPTION_TIERS.tier1.tokens
      },
      tier2: {
        name: SUBSCRIPTION_TIERS.tier2.name,
        price: SUBSCRIPTION_TIERS.tier2.price,
        tokens: SUBSCRIPTION_TIERS.tier2.tokens
      }
    }
  });
});

module.exports = router;