// AI Models Configuration
// Add new models here - each model has its own route, schema, and backend URL

const MODELS = {
  'live-painting': {
    id: 'live-painting',
    name: 'AI Live Painting',
    description: 'Transform your painted images into realistic artwork',
    version: 'v1',
    endpoint: '/api/v1/live-painting',
    method: 'POST',
    backendUrl: process.env.AI_LIVE_PAINT_URL || 'http://localhost:5000',
    backendPath: '/process',
    tokensPerRequest: 1,
    requestSchema: {
      type: 'multipart/form-data',
      fields: [
        {
          name: 'image',
          type: 'file',
          required: true,
          accepts: ['image/png', 'image/jpeg', 'image/jpg'],
          maxSize: '10MB',
          description: 'The painted image to transform'
        },
        {
          name: 'prompt',
          type: 'string',
          required: false,
          default: 'professional photograph, highly detailed, photorealistic',
          description: 'Text description to guide the image generation'
        },
        {
          name: 'strength',
          type: 'number',
          required: false,
          default: 0.5,
          min: 0.1,
          max: 1.0,
          description: 'Transformation strength (lower = closer to original)'
        },
        {
          name: 'steps',
          type: 'number',
          required: false,
          default: 4,
          min: 1,
          max: 50,
          description: 'Number of inference steps (4-8 recommended for speed)'
        },
        {
          name: 'guidance',
          type: 'number',
          required: false,
          default: 1.0,
          min: 0.0,
          max: 20.0,
          description: 'Guidance scale (higher = follow prompt more closely)'
        }
      ]
    },
    responseType: 'image/png',
    exampleRequest: `curl -X POST https://theinteractivelabs.com/api/v1/live-painting \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "image=@painting.png" \\
  -F "prompt=beautiful sunset landscape, photorealistic" \\
  -F "strength=0.5" \\
  -F "steps=4" \\
  -F "guidance=1.0" \\
  --output result.png`,
    limitations: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      timeout: 60000, // 60 seconds
      maxImageDimensions: { width: 4096, height: 4096 }
    },
    enabled: true,
    featured: true
  }

  // Example: Add more models here
  /*
  'style-transfer': {
    id: 'style-transfer',
    name: 'Style Transfer',
    description: 'Apply artistic styles to your images',
    version: 'v1',
    endpoint: '/api/v1/style-transfer',
    method: 'POST',
    backendUrl: process.env.AI_STYLE_TRANSFER_URL || 'http://localhost:5001',
    backendPath: '/transfer',
    tokensPerRequest: 1,
    requestSchema: {
      type: 'multipart/form-data',
      fields: [
        {
          name: 'content_image',
          type: 'file',
          required: true,
          accepts: ['image/png', 'image/jpeg'],
          maxSize: '10MB',
          description: 'The content image'
        },
        {
          name: 'style_image',
          type: 'file',
          required: true,
          accepts: ['image/png', 'image/jpeg'],
          maxSize: '10MB',
          description: 'The style reference image'
        },
        {
          name: 'strength',
          type: 'number',
          required: false,
          default: 1.0,
          min: 0.1,
          max: 2.0,
          description: 'Style transfer strength'
        }
      ]
    },
    responseType: 'image/png',
    exampleRequest: `curl -X POST https://theinteractivelabs.com/api/v1/style-transfer \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "content_image=@photo.jpg" \\
  -F "style_image=@style.jpg" \\
  -F "strength=1.5" \\
  --output styled.png`,
    limitations: {
      maxFileSize: 10 * 1024 * 1024,
      timeout: 90000,
      maxImageDimensions: { width: 2048, height: 2048 }
    },
    enabled: false,
    featured: false
  }
  */
};

// Get all enabled models
function getEnabledModels() {
  return Object.values(MODELS).filter(model => model.enabled);
}

// Get model by ID
function getModelById(modelId) {
  return MODELS[modelId];
}

// Get featured models
function getFeaturedModels() {
  return Object.values(MODELS).filter(model => model.enabled && model.featured);
}

// Validate request against model schema
function validateRequest(modelId, request) {
  const model = getModelById(modelId);
  if (!model) {
    return { valid: false, error: 'Model not found' };
  }

  const errors = [];
  const schema = model.requestSchema;

  // Validate required fields
  for (const field of schema.fields) {
    if (field.required) {
      if (field.type === 'file' && !request.files?.[field.name]) {
        errors.push(`Missing required field: ${field.name}`);
      } else if (field.type !== 'file' && !request.body?.[field.name]) {
        errors.push(`Missing required field: ${field.name}`);
      }
    }
  }

  // Validate file types and sizes
  if (request.files) {
    for (const [fieldName, file] of Object.entries(request.files)) {
      const fieldSchema = schema.fields.find(f => f.name === fieldName);
      if (fieldSchema && fieldSchema.type === 'file') {
        // Check file type
        if (fieldSchema.accepts && !fieldSchema.accepts.includes(file.mimetype)) {
          errors.push(`Invalid file type for ${fieldName}. Accepted: ${fieldSchema.accepts.join(', ')}`);
        }
        // Check file size
        if (file.size > model.limitations.maxFileSize) {
          errors.push(`File ${fieldName} exceeds maximum size of ${model.limitations.maxFileSize / 1024 / 1024}MB`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

module.exports = {
  MODELS,
  getEnabledModels,
  getModelById,
  getFeaturedModels,
  validateRequest
};