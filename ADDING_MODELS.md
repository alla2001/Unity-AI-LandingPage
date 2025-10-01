# How to Add New AI Models

This guide explains how to add new AI models to your platform.

## Step 1: Define Your Model in `config/models.js`

Open `config/models.js` and add your model configuration to the `MODELS` object:

```javascript
const MODELS = {
  'live-painting': {
    // ... existing model ...
  },

  // ADD YOUR NEW MODEL HERE
  'your-model-name': {
    id: 'your-model-name',
    name: 'Your Model Display Name',
    description: 'What your model does',
    version: 'v1',
    endpoint: '/api/v1/your-model-name',
    method: 'POST',
    backendUrl: process.env.YOUR_MODEL_BACKEND_URL || 'http://localhost:5001',
    backendPath: '/process',  // Path on your backend server
    tokensPerRequest: 1,      // How many tokens this model costs

    // Define the request schema
    requestSchema: {
      type: 'multipart/form-data',  // or 'application/json'
      fields: [
        {
          name: 'image',              // Field name
          type: 'file',               // 'file', 'string', 'number', 'boolean'
          required: true,
          accepts: ['image/png', 'image/jpeg'],  // For file types
          maxSize: '10MB',
          description: 'The input image'
        },
        {
          name: 'strength',
          type: 'number',
          required: false,
          default: 1.0,
          min: 0.1,
          max: 2.0,
          description: 'Processing strength'
        }
      ]
    },

    responseType: 'image/png',  // or 'application/json'

    // Example curl command for documentation
    exampleRequest: `curl -X POST http://localhost:3002/api/v1/your-model-name \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "image=@input.png" \\
  -F "strength=1.5" \\
  --output result.png`,

    limitations: {
      maxFileSize: 10 * 1024 * 1024,  // 10MB
      timeout: 60000,                  // 60 seconds
      maxImageDimensions: { width: 2048, height: 2048 }
    },

    enabled: true,    // Set to false to disable
    featured: false   // Set to true to show star icon
  }
};
```

## Step 2: Create the API Route Handler

Create a new file `routes/models/your-model-name.js`:

```javascript
const axios = require('axios');
const FormData = require('form-data');
const { getModelById } = require('../../config/models');

async function handleYourModel(req, res, apiKeyData, deductToken, logApiUsage, updateApiKeyLastUsed) {
  const startTime = Date.now();
  const model = getModelById('your-model-name');

  try {
    // Validate request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image provided'
      });
    }

    // Deduct token
    const deductResult = deductToken.run(apiKeyData.user_id);
    if (deductResult.changes === 0) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient tokens',
        tokens_remaining: 0
      });
    }

    // Prepare request to your backend
    const formData = new FormData();
    formData.append('image', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    // Add other parameters
    if (req.body.strength) {
      formData.append('strength', req.body.strength);
    }

    // Call your AI backend
    const aiResponse = await axios.post(
      `${model.backendUrl}${model.backendPath}`,
      formData,
      {
        headers: formData.getHeaders(),
        responseType: 'arraybuffer',  // For image responses
        timeout: model.limitations.timeout
      }
    );

    // Update API key usage
    updateApiKeyLastUsed.run(apiKeyData.id);
    logApiUsage.run(apiKeyData.user_id, apiKeyData.id, model.endpoint, model.tokensPerRequest);

    const tokensRemaining = apiKeyData.tokens - model.tokensPerRequest;
    const processingTime = Date.now() - startTime;

    // Return response
    res.set({
      'Content-Type': model.responseType,
      'X-Tokens-Used': model.tokensPerRequest.toString(),
      'X-Tokens-Remaining': tokensRemaining.toString(),
      'X-Processing-Time-Ms': processingTime.toString(),
      'X-Model': model.name
    });

    res.send(Buffer.from(aiResponse.data));

  } catch (error) {
    console.error(`${model.name} error:`, error.message);

    res.status(500).json({
      success: false,
      error: `${model.name} processing failed`,
      message: error.message
    });
  }
}

module.exports = handleYourModel;
```

## Step 3: Register the Route in `routes/api.js`

Add your route handler to `routes/api.js`:

```javascript
const handleLivePainting = require('./models/live-painting');
const handleYourModel = require('./models/your-model-name');  // Import your handler

// ... existing code ...

// Your new model endpoint
router.post('/v1/your-model-name', authenticateApiKey, upload.single('image'), async (req, res) => {
  await handleYourModel(req, res, req.apiKeyData, deductToken, logApiUsage, updateApiKeyLastUsed);
});
```

## Step 4: Add Environment Variable (Optional)

Add to `.env`:

```env
# Your Model Backend
YOUR_MODEL_BACKEND_URL=http://localhost:5001
```

## Step 5: Test Your Model

1. **Restart the server**:
   ```bash
   npm start
   ```

2. **Check models list**:
   ```bash
   curl http://localhost:3002/api/v1/models
   ```

3. **View dashboard** - Your model should now appear with documentation!

4. **Test the endpoint**:
   ```bash
   curl -X POST http://localhost:3002/api/v1/your-model-name \
     -H "X-API-Key: YOUR_API_KEY" \
     -F "image=@test.png" \
     --output result.png
   ```

## Model Types

### Image-to-Image Models
- Accept: Image file
- Return: Image file
- Response type: `image/png`, `image/jpeg`

### Text-to-Image Models
```javascript
requestSchema: {
  type: 'application/json',
  fields: [
    {
      name: 'prompt',
      type: 'string',
      required: true,
      description: 'Text description of the image to generate'
    }
  ]
}
```

### Image-to-Text Models
```javascript
responseType: 'application/json'
// Return JSON instead of image buffer
```

## Tips

1. **Token Cost**: Set `tokensPerRequest` based on computational cost
2. **Timeouts**: Set appropriate timeout for your model's processing time
3. **File Sizes**: Limit `maxFileSize` to prevent abuse
4. **Featured**: Mark your best models as `featured: true`
5. **Disabled Models**: Set `enabled: false` to temporarily disable

## The Models Will Automatically:
- ✅ Appear on the dashboard
- ✅ Show in `/api/v1/models` endpoint
- ✅ Display documentation
- ✅ Generate example code
- ✅ Track token usage
- ✅ Validate requests

That's it! Your new model is now integrated into the platform.