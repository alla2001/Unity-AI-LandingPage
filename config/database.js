// Database configuration using Turso (LibSQL)
const { createClient } = require('@libsql/client');

// Initialize Turso database client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize database schema
async function initializeDatabase() {
  try {
    // Users table - stores user authentication and token information
    await db.execute(`
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
        verification_token_expires DATETIME DEFAULT NULL,
        last_token_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // API Keys table - stores hashed API keys for each user
    await db.execute(`
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
    await db.execute(`
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
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id)`);

    console.log('✓ Turso database initialized successfully');
  } catch (error) {
    console.error('✗ Failed to initialize database:', error);
    throw error;
  }
}

// Database helper functions
const dbHelpers = {
  // User operations
  async createUser(email, passwordHash) {
    const result = await db.execute({
      sql: 'INSERT INTO users (email, password_hash, tokens) VALUES (?, ?, 0)',
      args: [email, passwordHash]
    });
    return result;
  },

  async getUserByEmail(email) {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });
    return result.rows[0];
  },

  async getUserById(id) {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id]
    });
    return result.rows[0];
  },

  async updateUserTokens(tokens, id) {
    const result = await db.execute({
      sql: 'UPDATE users SET tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [tokens, id]
    });
    return result;
  },

  async updateUserSubscription(tier, customerId, subscriptionId, status, userId) {
    const result = await db.execute({
      sql: `UPDATE users SET subscription_tier = ?, stripe_customer_id = ?,
            stripe_subscription_id = ?, subscription_status = ?,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [tier, customerId, subscriptionId, status, userId]
    });
    return result;
  },

  async addTokensToUser(tokens, id) {
    const result = await db.execute({
      sql: 'UPDATE users SET tokens = tokens + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [tokens, id]
    });
    return result;
  },

  async deductToken(id) {
    const result = await db.execute({
      sql: 'UPDATE users SET tokens = tokens - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tokens > 0',
      args: [id]
    });
    return result;
  },

  // Google OAuth operations
  async createGoogleUser(email, googleId, displayName) {
    const result = await db.execute({
      sql: 'INSERT INTO users (email, google_id, display_name, tokens, email_verified) VALUES (?, ?, ?, 20, 1)',
      args: [email, googleId, displayName]
    });
    return result;
  },

  async getUserByGoogleId(googleId) {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE google_id = ?',
      args: [googleId]
    });
    return result.rows[0];
  },

  async updateGoogleUser(email, displayName, googleId) {
    const result = await db.execute({
      sql: 'UPDATE users SET email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE google_id = ?',
      args: [email, displayName, googleId]
    });
    return result;
  },

  // Email verification operations
  async setVerificationToken(token, id) {
    const result = await db.execute({
      sql: 'UPDATE users SET verification_token = ?, verification_token_expires = datetime("now", "+24 hours"), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [token, id]
    });
    return result;
  },

  async getUserByVerificationToken(token) {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE verification_token = ?',
      args: [token]
    });
    return result.rows[0];
  },

  async verifyEmail(id) {
    const result = await db.execute({
      sql: 'UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [id]
    });
    return result;
  },

  // Token reset operations (for free tier monthly renewal)
  async resetUserTokens(id) {
    const result = await db.execute({
      sql: `UPDATE users SET tokens = 20, last_token_reset = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP WHERE id = ? AND subscription_tier = 'free'`,
      args: [id]
    });
    return result;
  },

  async getUsersNeedingTokenReset() {
    const result = await db.execute(`
      SELECT id, email FROM users
      WHERE subscription_tier = 'free'
        AND datetime(last_token_reset, '+30 days') <= datetime('now')
    `);
    return result.rows;
  },

  // API Key operations
  async createApiKey(userId, keyHash, keyPrefix, name) {
    const result = await db.execute({
      sql: 'INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?)',
      args: [userId, keyHash, keyPrefix, name]
    });
    return result;
  },

  async getApiKeyByHash(keyHash) {
    const result = await db.execute({
      sql: `SELECT ak.id, ak.user_id, ak.key_hash, ak.key_prefix, ak.name, ak.is_active,
            ak.last_used_at, ak.created_at, u.tokens, u.subscription_tier, u.subscription_status
            FROM api_keys ak JOIN users u ON ak.user_id = u.id
            WHERE ak.key_hash = ? AND ak.is_active = 1`,
      args: [keyHash]
    });
    return result.rows[0];
  },

  async getUserApiKeys(userId) {
    const result = await db.execute({
      sql: `SELECT id, key_prefix, name, is_active, last_used_at, created_at
            FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
      args: [userId]
    });
    return result.rows;
  },

  async deactivateApiKey(id, userId) {
    const result = await db.execute({
      sql: 'UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?',
      args: [id, userId]
    });
    return result;
  },

  async updateApiKeyLastUsed(id) {
    const result = await db.execute({
      sql: 'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [id]
    });
    return result;
  },

  // API Usage tracking
  async logApiUsage(userId, apiKeyId, endpoint, tokensUsed) {
    const result = await db.execute({
      sql: 'INSERT INTO api_usage (user_id, api_key_id, endpoint, tokens_used) VALUES (?, ?, ?, ?)',
      args: [userId, apiKeyId, endpoint, tokensUsed]
    });
    return result;
  },

  async getUserUsageStats(userId) {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as total_requests, SUM(tokens_used) as total_tokens_used,
            DATE(created_at) as date FROM api_usage WHERE user_id = ?
            GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`,
      args: [userId]
    });
    return result.rows;
  }
};

module.exports = {
  db,
  initializeDatabase,
  ...dbHelpers
};
