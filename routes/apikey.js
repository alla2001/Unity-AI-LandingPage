// API Key management routes - handles creation and management of API keys
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const {
  createApiKey,
  getUserApiKeys,
  deactivateApiKey
} = require('../config/database');

// Generate a secure random API key
function generateApiKey() {
  // Generate a random key with prefix
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const apiKey = `sk_${randomBytes}`;
  return apiKey;
}

// Hash API key for storage
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Get user's API keys
router.get('/', authenticateToken, async (req, res) => {
  try {
    const apiKeys = await getUserApiKeys(req.user.id);

    res.json({
      success: true,
      apiKeys: apiKeys
    });

  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve API keys'
    });
  }
});

// Create new API key
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const keyName = name || 'Default Key';

    // Generate new API key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12) + '...';

    // Store in database
    const result = await createApiKey(
      req.user.id,
      keyHash,
      keyPrefix,
      keyName
    );

    // Return the full key only once (it won't be shown again)
    res.json({
      success: true,
      message: 'API key created successfully. Save it now - you won\'t see it again!',
      apiKey: apiKey,
      keyId: Number(result.lastInsertRowid),
      keyPrefix: keyPrefix
    });

  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create API key'
    });
  }
});

// Deactivate/revoke an API key
router.delete('/:keyId', authenticateToken, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);

    // Deactivate the key (only if it belongs to the user)
    const result = await deactivateApiKey(keyId, req.user.id);

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: 'API key not found or already deactivated'
      });
    }

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });

  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke API key'
    });
  }
});

module.exports = router;
module.exports.hashApiKey = hashApiKey; // Export for use in API authentication