// Passport Google OAuth configuration
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getUserByGoogleId, createGoogleUser, updateGoogleUser, getUserById } = require('./database');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await getUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let user = await getUserByGoogleId(profile.id);

      if (user) {
        // Update existing user info
        await updateGoogleUser(
          profile.emails[0].value,
          profile.displayName,
          profile.id
        );
        user = await getUserByGoogleId(profile.id);
      } else {
        // Create new user with 20 free tokens
        const result = await createGoogleUser(
          profile.emails[0].value,
          profile.id,
          profile.displayName
        );
        user = await getUserById(result.lastInsertRowid);
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

module.exports = passport;