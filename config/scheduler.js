// Token renewal scheduler for free tier users (20 tokens every 30 days)
const { getUsersNeedingTokenReset, resetUserTokens } = require('./database');

// Check and reset tokens for free tier users every day at midnight
function startTokenRenewalScheduler() {
  // Run immediately on startup
  checkAndResetTokens();

  // Then run every 24 hours
  setInterval(() => {
    checkAndResetTokens();
  }, 24 * 60 * 60 * 1000); // 24 hours

  console.log('✓ Token renewal scheduler started');
}

async function checkAndResetTokens() {
  try {
    // Get all free tier users who need token reset (30 days passed)
    const users = await getUsersNeedingTokenReset();

    if (users.length === 0) {
      console.log('Token renewal check: No users need token reset');
      return;
    }

    console.log(`Token renewal: Found ${users.length} users needing token reset`);

    // Reset tokens for each user
    let successCount = 0;
    for (const user of users) {
      try {
        await resetUserTokens(user.id);
        successCount++;
        console.log(`✓ Reset tokens for user: ${user.email}`);
      } catch (error) {
        console.error(`✗ Failed to reset tokens for user ${user.email}:`, error);
      }
    }

    console.log(`Token renewal complete: ${successCount}/${users.length} users updated`);
  } catch (error) {
    console.error('Token renewal scheduler error:', error);
  }
}

module.exports = {
  startTokenRenewalScheduler
};