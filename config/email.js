// Email configuration for sending verification emails
const nodemailer = require('nodemailer');

// Create email transporter (optional - will log to console if not configured)
let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  try {
    transporter = nodemailer.createTransporter({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  } catch (error) {
    console.warn('⚠️  Email service not configured properly. Verification emails will be logged to console.');
  }
}

// Send verification email
async function sendVerificationEmail(email, token) {
  const verificationUrl = `${process.env.BASE_URL}/auth/verify-email?token=${token}`;

  // If email not configured, just log the verification URL
  if (!transporter) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📧 EMAIL VERIFICATION (Development Mode)');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`To: ${email}`);
    console.log(`Verification URL: ${verificationUrl}`);
    console.log('═══════════════════════════════════════════════════════\n');
    return true;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your Email - AI Live Paint',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1a; color: #ffffff;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1;">AI Live Paint</h1>
        </div>

        <div style="background-color: #2a2a2a; padding: 30px; border-radius: 10px;">
          <h2 style="color: #6366f1; margin-top: 0;">Verify Your Email</h2>

          <p style="font-size: 16px; line-height: 1.6; color: #e5e7eb;">
            Welcome to AI Live Paint! Click the button below to verify your email address and activate your account with 20 free tokens.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}"
               style="display: inline-block; padding: 15px 40px; background-color: #6366f1; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Verify Email
            </a>
          </div>

          <p style="font-size: 14px; color: #9ca3af;">
            Or copy and paste this link into your browser:<br>
            <a href="${verificationUrl}" style="color: #6366f1; word-break: break-all;">${verificationUrl}</a>
          </p>

          <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280;">
          <p>&copy; 2025 AI Live Paint. All rights reserved.</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
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