// Passport Google OAuth configuration
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getUserByGoogleId, createGoogleUser, updateGoogleUser, getUserById } = require('./database');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id, done) => {
  try {
    const user = getUserById.get(id);
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
      let user = getUserByGoogleId.get(profile.id);

      if (user) {
        // Update existing user info
        updateGoogleUser.run(
          profile.emails[0].value,
          profile.displayName,
          profile.id
        );
        user = getUserByGoogleId.get(profile.id);
      } else {
        // Create new user with 20 free tokens
        const result = createGoogleUser.run(
          profile.emails[0].value,
          profile.id,
          profile.displayName
        );
        user = getUserById.get(result.lastInsertRowid);
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

module.exports = passport;