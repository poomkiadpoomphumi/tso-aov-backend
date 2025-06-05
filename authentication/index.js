const passport = require('passport');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const config = require('../config/index');

passport.use(new OIDCStrategy(config.configAzure, (iss, sub, profile, accessToken, refreshToken, done) => {
    if (!profile.oid) {
        return done(new Error("No oid found"), null);
    }
    try {
        return done(null, profile);
    } catch (error) {
        return done(error, null);
    }
}));
const passportAuthenticate = () => {
    return passport.authenticate('azuread-openidconnect', { failureRedirect: '/' })
}
const AzureLogout = (req, res) => {
    req.logout();
    res.redirect('/');
    window.location.reload();
}
const AzureCallback = () => {
    passport.authenticate('azuread-openidconnect', { failureRedirect: '/' }),
        (req, res) => {
            res.redirect('/dashboard/default');
        }
}
passport.initialize = passport.initialize.bind(passport);

module.exports = { passport, passportAuthenticate, AzureLogout, AzureCallback };