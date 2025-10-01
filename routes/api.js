// AI API routes - handles AI model requests with token deduction
const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { hashApiKey } = require('./apikey');
const {
  getApiKeyByHash,
  deductToken,
  logApiUsage,
  updateApiKeyLastUsed
} = require('../config/database');
const {
  getEnabledModels,
  getModelById,
  getFeaturedModels
} = require('../config/models');

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  }
});

// Middleware to authenticate API key
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      message: 'Please provide your API key in the X-API-Key header'
    });
  }

  try {
    // Hash the provided key and look it up
    const keyHash = hashApiKey(apiKey);
    const keyData = await getApiKeyByHash(keyHash);

    if (!keyData) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: 'The provided API key is invalid or has been revoked'
      });
    }

    // Check if user has tokens
    if (keyData.tokens <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient tokens',
        message: 'You have run out of tokens. Please upgrade your subscription.',
        tokens_remaining: 0
      });
    }

    // Check subscription status
    if (keyData.subscription_status === 'canceled' || keyData.subscription_status === 'past_due') {
      // Still allow usage if they have tokens, but warn them
      req.warningMessage = `Your subscription is ${keyData.subscription_status}. Please update your payment method.`;
    }

    // Attach key data to request
    req.apiKeyData = keyData;
    next();

  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: 'Internal server error'
    });
  }
}

// AI Live Paint endpoint - POST /api/v1/live-painting
router.post('/v1/live-painting', authenticateApiKey, upload.fields([{ name: 'image', maxCount: 1 }]), async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate image upload
    if (!req.files || !req.files.image || !req.files.image[0]) {
      return res.status(400).json({
        success: false,
        error: 'No image provided',
        message: 'Please upload an image file'
      });
    }

    const imageFile = req.files.image[0];

    // Deduct token BEFORE making the API call (to prevent abuse)
    const deductResult = await deductToken(req.apiKeyData.user_id);

    if (deductResult.rowsAffected === 0) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient tokens',
        message: 'Failed to deduct token. You may have run out of tokens.',
        tokens_remaining: 0
      });
    }

    // Log received parameters for debugging
    console.log('Received parameters:', {
      prompt: req.body.prompt,
      strength: req.body.strength,
      steps: req.body.steps,
      guidance: req.body.guidance
    });

    // Prepare form data for AI Live Paint backend
    const formData = new FormData();
    formData.append('image', imageFile.buffer, {
      filename: imageFile.originalname,
      contentType: imageFile.mimetype
    });

    // Add optional parameters (these come from Unity)
    if (req.body.prompt) {
      formData.append('prompt', req.body.prompt);
    }

    if (req.body.strength) {
      formData.append('strength', req.body.strength);
    }

    if (req.body.steps) {
      formData.append('steps', req.body.steps);
    }

    if (req.body.guidance) {
      formData.append('guidance', req.body.guidance);
    }

    // Call AI Live Paint backend
    const aiResponse = await axios.post(
      `${process.env.AI_LIVE_PAINT_URL}/process`,
      formData,
      {
        headers: formData.getHeaders(),
        responseType: 'arraybuffer', // Expect image response
        timeout: 60000, // 60 second timeout
        maxContentLength: 50 * 1024 * 1024, // 50MB max response
        maxBodyLength: 50 * 1024 * 1024
      }
    );

    // Update API key last used timestamp
    await updateApiKeyLastUsed(req.apiKeyData.id);

    // Log usage
    await logApiUsage(
      req.apiKeyData.user_id,
      req.apiKeyData.id,
      '/api/v1/live-painting',
      1
    );

    // Calculate remaining tokens
    const tokensRemaining = req.apiKeyData.tokens - 1;
    const processingTime = Date.now() - startTime;

    // Return processed image
    res.set({
      'Content-Type': 'image/png',
      'X-Tokens-Used': '1',
      'X-Tokens-Remaining': tokensRemaining.toString(),
      'X-Processing-Time-Ms': processingTime.toString(),
      'X-Model': 'AI-Live-Paint-v1'
    });

    if (req.warningMessage) {
      res.set('X-Warning', req.warningMessage);
    }

    res.send(Buffer.from(aiResponse.data));

  } catch (error) {
    console.error('AI Live Paint error:', error.message);

    // If we deducted a token but the AI call failed, ideally refund it
    // For production, implement a refund mechanism here

    const errorMessage = error.response?.data?.message || error.message || 'AI processing failed';

    res.status(500).json({
      success: false,
      error: 'AI Live Paint processing failed',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
router.get('/v1/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Get available AI models (public endpoint - no auth required)
router.get('/v1/models', (req, res) => {
  try {
    const models = getEnabledModels();
    const modelsInfo = models.map(model => ({
      id: model.id,
      name: model.name,
      description: model.description,
      version: model.version,
      endpoint: model.endpoint,
      method: model.method,
      tokensPerRequest: model.tokensPerRequest,
      requestSchema: model.requestSchema,
      responseType: model.responseType,
      exampleRequest: model.exampleRequest,
      featured: model.featured
    }));

    res.json({
      success: true,
      count: modelsInfo.length,
      models: modelsInfo
    });
  } catch (error) {
    console.error('Models list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve models list'
    });
  }
});

// Get specific model details (public endpoint)
router.get('/v1/models/:modelId', (req, res) => {
  try {
    const model = getModelById(req.params.modelId);

    if (!model || !model.enabled) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: 'The requested model does not exist or is not available'
      });
    }

    res.json({
      success: true,
      model: {
        id: model.id,
        name: model.name,
        description: model.description,
        version: model.version,
        endpoint: model.endpoint,
        method: model.method,
        tokensPerRequest: model.tokensPerRequest,
        requestSchema: model.requestSchema,
        responseType: model.responseType,
        exampleRequest: model.exampleRequest,
        limitations: model.limitations,
        featured: model.featured
      }
    });
  } catch (error) {
    console.error('Model details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve model details'
    });
  }
});

// Get API usage statistics (with API key authentication)
router.get('/v1/usage', authenticateApiKey, (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        tokens_remaining: req.apiKeyData.tokens,
        subscription_tier: req.apiKeyData.subscription_tier || 'free',
        subscription_status: req.apiKeyData.subscription_status || 'none'
      }
    });
  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage statistics'
    });
  }
});

module.exports = router;