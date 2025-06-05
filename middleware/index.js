const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const azureAuthMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer token
    const x_has_me = req.headers['x-has-me'];
    if (!token || !x_has_me) { return res.status(401).json({ message: 'Oops! You forgot the token. Let\'s try that again!' }); }
    try {
        const [decodedToken, decodedXhasMe] = await Promise.all([
            jwt.decode(token, { complete: true }),
            jwt.decode(x_has_me, { complete: true })
        ]);
        if (!decodedToken || !decodedXhasMe) { return res.status(401).json({ message: 'Uh-oh, something went wrong! Those tokens are not quite right. Chill and try again.' }); }
        const publicKey = await new Promise((resolve, reject) => {
            jwksClient({ jwksUri: process.env.JWKS_URI })
                .getSigningKey(decodedToken.header.kid || decodedToken.header.x5t, (err, key) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(key.getPublicKey());
                });
        });
        if (decodedXhasMe.payload.localToken === publicKey) {
            return next();
        } else {
            return res.status(401).json({ message: 'Nope, those tokens didn’t match. You\'re almost there!' });
        }
    } catch (error) {
        console.error('Error during token validation:', error);
        return res.status(401).json({ message: 'Whoa, something cool just happened...but not in a good way. Token validation failed!', error });
    }
   //return next();
};

module.exports = { azureAuthMiddleware };
