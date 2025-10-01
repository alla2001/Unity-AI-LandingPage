# AI SaaS Platform

A production-ready minimal SaaS application built with Node.js and Express. Features include user authentication, Stripe subscription payments, API key management, and an AI API endpoint with token-based usage tracking.

## Features

### 🔐 Authentication System
- User registration and login with email/password
- JWT-based session management
- 20 free tokens on signup
- Secure password hashing with bcrypt

### 💳 Subscription & Payments
- Stripe integration for subscription management
- Two subscription tiers:
  - **Starter**: $15/month → 200 tokens
  - **Pro**: $35/month → 1000 tokens
- Automated token allocation on subscription renewal
- Subscription cancellation and management

### 🔑 API Key Management
- Generate multiple API keys per user
- Secure key storage (SHA-256 hashed)
- Easy key revocation
- Last used tracking

### 🤖 AI API Endpoint
- RESTful API endpoint at `/api/v1/ai`
- Token-based usage tracking
- API key authentication
- Mock AI model (ready to integrate real AI APIs)

### 📊 Dashboard
- Real-time token balance
- Subscription status
- API key management
- Usage analytics
- API documentation

## Project Structure

```
.
├── config/
│   └── database.js          # SQLite database configuration
├── middleware/
│   └── auth.js              # JWT authentication middleware
├── routes/
│   ├── api.js               # AI API endpoints
│   ├── apikey.js            # API key management
│   ├── auth.js              # Registration & login
│   ├── pages.js             # Page rendering
│   └── payment.js           # Stripe payments
├── views/
│   ├── landing.ejs          # Landing page
│   ├── login.ejs            # Login page
│   ├── register.ejs         # Registration page
│   └── dashboard.ejs        # User dashboard
├── public/
│   └── css/
│       └── styles.css       # Global styles
├── server.js                # Main entry point
├── package.json             # Dependencies
└── .env                     # Environment variables
```

## Installation

### 1. Clone and Install Dependencies

```bash
cd ai-saas-platform
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3000
NODE_ENV=development

# Generate a secure random string for JWT
JWT_SECRET=your-super-secret-jwt-key-change-this

# Get these from your Stripe dashboard
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Create products in Stripe and add their price IDs here
STRIPE_PRICE_TIER1=price_...
STRIPE_PRICE_TIER2=price_...

BASE_URL=http://localhost:3000
```

### 3. Set Up Stripe

1. Create a [Stripe account](https://stripe.com)
2. Go to **Products** in the Stripe dashboard
3. Create two subscription products:
   - **Starter**: $15/month (recurring)
   - **Pro**: $35/month (recurring)
4. Copy the **Price IDs** and add them to your `.env` file
5. Set up a webhook endpoint:
   - Go to **Developers → Webhooks**
   - Add endpoint: `http://localhost:3000/payment/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
   - Copy the webhook secret to your `.env` file

### 4. Run the Application

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:3000`

## Usage

### User Flow

1. **Sign Up**: Visit `/register` to create an account (get 20 free tokens)
2. **Log In**: Use `/login` to access your account
3. **Dashboard**: Manage your subscription and API keys
4. **Generate API Key**: Create an API key from the dashboard
5. **Make API Calls**: Use your API key to call the AI endpoint

### API Usage Example

```bash
curl -X POST http://localhost:3000/api/v1/ai \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "prompt": "Explain quantum computing in simple terms"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "response": "AI generated response...",
    "model": "mock-ai-v1",
    "processing_time_ms": 500
  },
  "usage": {
    "tokens_used": 1,
    "tokens_remaining": 19
  }
}
```

### API Endpoints

#### Public Endpoints
- `GET /` - Landing page
- `GET /login` - Login page
- `GET /register` - Registration page
- `POST /auth/register` - Create account
- `POST /auth/login` - Login

#### Protected Endpoints (Require Login)
- `GET /dashboard` - User dashboard
- `POST /auth/logout` - Logout
- `GET /apikey` - Get user's API keys
- `POST /apikey/create` - Create new API key
- `DELETE /apikey/:keyId` - Revoke API key
- `POST /payment/create-checkout-session` - Start subscription
- `POST /payment/cancel-subscription` - Cancel subscription

#### API Endpoints (Require API Key)
- `POST /api/v1/ai` - AI endpoint
- `GET /api/v1/usage` - Get usage statistics
- `GET /api/v1/health` - Health check

## Database Schema

### Users Table
```sql
- id (INTEGER PRIMARY KEY)
- email (TEXT UNIQUE)
- password_hash (TEXT)
- tokens (INTEGER DEFAULT 20)
- subscription_tier (TEXT)
- stripe_customer_id (TEXT)
- stripe_subscription_id (TEXT)
- subscription_status (TEXT)
- created_at (DATETIME)
- updated_at (DATETIME)
```

### API Keys Table
```sql
- id (INTEGER PRIMARY KEY)
- user_id (INTEGER FOREIGN KEY)
- key_hash (TEXT UNIQUE)
- key_prefix (TEXT)
- name (TEXT)
- is_active (INTEGER DEFAULT 1)
- last_used_at (DATETIME)
- created_at (DATETIME)
```

### API Usage Table
```sql
- id (INTEGER PRIMARY KEY)
- user_id (INTEGER FOREIGN KEY)
- api_key_id (INTEGER FOREIGN KEY)
- endpoint (TEXT)
- tokens_used (INTEGER)
- created_at (DATETIME)
```

## Integrating a Real AI Model

The current implementation includes a mock AI function. To integrate a real AI API:

### Option 1: OpenAI GPT

```javascript
// In routes/api.js, replace callAIModel function:

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callAIModel(prompt) {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  });

  return {
    model: 'gpt-3.5-turbo',
    response: completion.choices[0].message.content,
    tokens_used: 1,
    processing_time_ms: 500
  };
}
```

### Option 2: Anthropic Claude

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callAIModel(prompt) {
  const message = await anthropic.messages.create({
    model: "claude-3-sonnet-20240229",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return {
    model: 'claude-3-sonnet',
    response: message.content[0].text,
    tokens_used: 1,
    processing_time_ms: 500
  };
}
```

## Security Considerations

- ✅ Passwords are hashed with bcrypt
- ✅ API keys are hashed with SHA-256
- ✅ JWT tokens are httpOnly cookies
- ✅ SQL injection protected (prepared statements)
- ✅ Input validation with express-validator
- ✅ Environment variables for secrets
- ⚠️ Use HTTPS in production
- ⚠️ Set `NODE_ENV=production` in production
- ⚠️ Use strong JWT_SECRET (64+ random characters)

## Production Deployment

### Environment Setup
```bash
NODE_ENV=production
PORT=3000
JWT_SECRET=<64-character-random-string>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
BASE_URL=https://yourdomain.com
```

### Recommended Services
- **Hosting**: Railway, Render, DigitalOcean, AWS
- **Database**: Keep SQLite for small scale, or migrate to PostgreSQL for production
- **SSL**: Automatic with most hosting providers
- **Monitoring**: PM2 for process management

### Deploy with PM2
```bash
npm install -g pm2
pm2 start server.js --name "ai-saas"
pm2 save
pm2 startup
```

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT (jsonwebtoken)
- **Payments**: Stripe
- **Template Engine**: EJS
- **Styling**: Custom CSS
- **Security**: bcryptjs, express-validator

## License

ISC

## Support

For issues or questions, please open an issue on GitHub.

---

**Built with ❤️ for developers**