// Database configuration and initialization using better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');

// Initialize database connection
const db = new Database(path.join(__dirname, '..', 'database.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  // Users table - stores user authentication and token information
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      display_name TEXT,
      tokens INTEGER DEFAULT 20,
      subscription_tier TEXT DEFAULT 'free',
      stripe_customer_id TEXT DEFAULT NULL,
      stripe_subscription_id TEXT DEFAULT NULL,
      subscription_status TEXT DEFAULT NULL,
      email_verified INTEGER DEFAULT 0,
      verification_token TEXT DEFAULT NULL,
      last_token_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API Keys table - stores hashed API keys for each user
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT DEFAULT 'Default Key',
      is_active INTEGER DEFAULT 1,
      last_used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // API Usage table - tracks API calls for analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      api_key_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
  `);

  console.log('✓ Database initialized successfully');
}

// Database helper functions - will be initialized after tables are created
let dbHelpers = {};

function initializeHelpers() {
  dbHelpers = {
    // User operations
    createUser: db.prepare(`
      INSERT INTO users (email, password_hash, tokens)
      VALUES (?, ?, 20)
    `),

    getUserByEmail: db.prepare(`
      SELECT * FROM users WHERE email = ?
    `),

    getUserById: db.prepare(`
      SELECT * FROM users WHERE id = ?
    `),

    updateUserTokens: db.prepare(`
      UPDATE users SET tokens = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateUserSubscription: db.prepare(`
      UPDATE users
      SET subscription_tier = ?,
          stripe_customer_id = ?,
          stripe_subscription_id = ?,
          subscription_status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    addTokensToUser: db.prepare(`
      UPDATE users
      SET tokens = tokens + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    deductToken: db.prepare(`
      UPDATE users
      SET tokens = tokens - 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tokens > 0
    `),

    // Google OAuth operations
    createGoogleUser: db.prepare(`
      INSERT INTO users (email, google_id, display_name, tokens)
      VALUES (?, ?, ?, 20)
    `),

    getUserByGoogleId: db.prepare(`
      SELECT * FROM users WHERE google_id = ?
    `),

    updateGoogleUser: db.prepare(`
      UPDATE users
      SET email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE google_id = ?
    `),

    // Email verification operations
    setVerificationToken: db.prepare(`
      UPDATE users
      SET verification_token = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    getUserByVerificationToken: db.prepare(`
      SELECT * FROM users WHERE verification_token = ?
    `),

    verifyEmail: db.prepare(`
      UPDATE users
      SET email_verified = 1, verification_token = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    // Token reset operations (for free tier monthly renewal)
    resetUserTokens: db.prepare(`
      UPDATE users
      SET tokens = 20, last_token_reset = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND subscription_tier = 'free'
    `),

    getUsersNeedingTokenReset: db.prepare(`
      SELECT id, email FROM users
      WHERE subscription_tier = 'free'
        AND datetime(last_token_reset, '+30 days') <= datetime('now')
    `),

    // API Key operations
    createApiKey: db.prepare(`
      INSERT INTO api_keys (user_id, key_hash, key_prefix, name)
      VALUES (?, ?, ?, ?)
    `),

    getApiKeyByHash: db.prepare(`
      SELECT
        ak.id,
        ak.user_id,
        ak.key_hash,
        ak.key_prefix,
        ak.name,
        ak.is_active,
        ak.last_used_at,
        ak.created_at,
        u.tokens,
        u.subscription_tier,
        u.subscription_status
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = ? AND ak.is_active = 1
    `),

    getUserApiKeys: db.prepare(`
      SELECT id, key_prefix, name, is_active, last_used_at, created_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `),

    deactivateApiKey: db.prepare(`
      UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?
    `),

    updateApiKeyLastUsed: db.prepare(`
      UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?
    `),

    // API Usage tracking
    logApiUsage: db.prepare(`
      INSERT INTO api_usage (user_id, api_key_id, endpoint, tokens_used)
      VALUES (?, ?, ?, ?)
    `),

    getUserUsageStats: db.prepare(`
      SELECT
        COUNT(*) as total_requests,
        SUM(tokens_used) as total_tokens_used,
        DATE(created_at) as date
      FROM api_usage
      WHERE user_id = ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `)
  };
}

module.exports = {
  db,
  initializeDatabase,
  initializeHelpers,
  get createUser() { return dbHelpers.createUser; },
  get getUserByEmail() { return dbHelpers.getUserByEmail; },
  get getUserById() { return dbHelpers.getUserById; },
  get updateUserTokens() { return dbHelpers.updateUserTokens; },
  get updateUserSubscription() { return dbHelpers.updateUserSubscription; },
  get addTokensToUser() { return dbHelpers.addTokensToUser; },
  get deductToken() { return dbHelpers.deductToken; },
  get createGoogleUser() { return dbHelpers.createGoogleUser; },
  get getUserByGoogleId() { return dbHelpers.getUserByGoogleId; },
  get updateGoogleUser() { return dbHelpers.updateGoogleUser; },
  get setVerificationToken() { return dbHelpers.setVerificationToken; },
  get getUserByVerificationToken() { return dbHelpers.getUserByVerificationToken; },
  get verifyEmail() { return dbHelpers.verifyEmail; },
  get resetUserTokens() { return dbHelpers.resetUserTokens; },
  get getUsersNeedingTokenReset() { return dbHelpers.getUsersNeedingTokenReset; },
  get createApiKey() { return dbHelpers.createApiKey; },
  get getApiKeyByHash() { return dbHelpers.getApiKeyByHash; },
  get getUserApiKeys() { return dbHelpers.getUserApiKeys; },
  get deactivateApiKey() { return dbHelpers.deactivateApiKey; },
  get updateApiKeyLastUsed() { return dbHelpers.updateApiKeyLastUsed; },
  get logApiUsage() { return dbHelpers.logApiUsage; },
  get getUserUsageStats() { return dbHelpers.getUserUsageStats; }
};