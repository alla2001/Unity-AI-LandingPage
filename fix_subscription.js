// Script to fix subscription and add Pro tier tokens
require('dotenv').config();
const { db, getUserByEmail, updateUserSubscription, addTokensToUser } = require('./config/database');

const email = 'alla2001@hotmail.fr';

async function fixSubscription() {
  try {
    // Get current user info
    const user = await getUserByEmail(email);

    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`\n📊 Current user info:`);
    console.log(`Email: ${user.email}`);
    console.log(`Current tokens: ${user.tokens}`);
    console.log(`Subscription: ${user.subscription_tier || 'free'}`);
    console.log(`Stripe Customer ID: ${user.stripe_customer_id}`);
    console.log(`Stripe Subscription ID: ${user.stripe_subscription_id}`);

    // Update to Pro tier (tier2)
    console.log(`\n🔄 Updating subscription to Pro (tier2)...`);
    await updateUserSubscription(
      'tier2',
      user.stripe_customer_id,
      user.stripe_subscription_id,
      'active',
      user.id
    );

    // Add 1000 tokens for Pro tier
    console.log(`💰 Adding 1000 tokens for Pro tier...`);
    await addTokensToUser(1000, user.id);

    // Get updated user info
    const updatedUser = await getUserByEmail(email);

    console.log(`\n✅ Subscription fixed!`);
    console.log(`New subscription tier: ${updatedUser.subscription_tier}`);
    console.log(`New token balance: ${updatedUser.tokens}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixSubscription();
