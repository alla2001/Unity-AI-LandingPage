// Email configuration using Resend for sending verification emails
const { Resend } = require('resend');

// Initialize Resend client
let resend = null;

if (process.env.RESEND_API_KEY) {
  try {
    resend = new Resend(process.env.RESEND_API_KEY);
  } catch (error) {
    console.warn('⚠️  Resend not configured properly. Verification emails will be logged to console.');
  }
}

// Send verification email using Resend
async function sendVerificationEmail(email, token) {
  const verificationUrl = `${process.env.BASE_URL}/auth/verify-email?token=${token}`;

  // If Resend not configured, just log the verification URL
  if (!resend) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📧 EMAIL VERIFICATION (Development Mode)');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`To: ${email}`);
    console.log(`Verification URL: ${verificationUrl}`);
    console.log('═══════════════════════════════════════════════════════\n');
    return true;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: [email],
      subject: 'Verify Your Email to Get 20 Free Tokens - AI Live Paint',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1a; color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6366f1;">AI Live Paint</h1>
          </div>

          <div style="background-color: #2a2a2a; padding: 30px; border-radius: 10px;">
            <h2 style="color: #6366f1; margin-top: 0;">🎉 Verify Your Email to Get 20 Free Tokens!</h2>

            <p style="font-size: 16px; line-height: 1.6; color: #e5e7eb;">
              Welcome to AI Live Paint! You're just one step away from getting started.
            </p>

            <p style="font-size: 16px; line-height: 1.6; color: #e5e7eb;">
              <strong>Click the button below to verify your email address and instantly receive 20 free tokens</strong> to start transforming your images with AI!
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}"
                 style="display: inline-block; padding: 15px 40px; background-color: #6366f1; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Verify Email & Get 20 Free Tokens
              </a>
            </div>

            <p style="font-size: 14px; color: #9ca3af;">
              Or copy and paste this link into your browser:<br>
              <a href="${verificationUrl}" style="color: #6366f1; word-break: break-all;">${verificationUrl}</a>
            </p>

            <div style="background-color: #1a1a1a; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <p style="font-size: 14px; color: #e5e7eb; margin: 0;">
                💡 <strong>What you'll get:</strong><br>
                • 20 free tokens immediately upon verification<br>
                • Access to AI Live Painting API<br>
                • Transform your painted images into realistic artwork
              </p>
            </div>

            <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
              If you didn't create an account, you can safely ignore this email.
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280;">
            <p>&copy; 2025 AI Live Paint. All rights reserved.</p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('✗ Failed to send verification email:', error);
      return false;
    }

    console.log('✓ Verification email sent to:', email);
    return true;
  } catch (error) {
    console.error('✗ Failed to send verification email:', error);
    return false;
  }
}

module.exports = {
  sendVerificationEmail
};
