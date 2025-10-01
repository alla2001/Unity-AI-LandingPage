// Script to add tokens to a user account
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.db'));

const email = 'alla2001@hotmail.fr';
const tokensToAdd = 1000; // Change this to however many tokens you want

try {
  // Get current user info
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    console.log(`❌ User not found with email: ${email}`);
    process.exit(1);
  }

  console.log(`\n📊 Current user info:`);
  console.log(`Email: ${user.email}`);
  console.log(`Current tokens: ${user.tokens}`);
  console.log(`Subscription: ${user.subscription_tier || 'free'}`);

  // Add tokens
  const newTokens = user.tokens + tokensToAdd;
  db.prepare('UPDATE users SET tokens = ? WHERE email = ?').run(newTokens, email);

  console.log(`\n✅ Added ${tokensToAdd} tokens!`);
  console.log(`New token balance: ${newTokens}`);

  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
