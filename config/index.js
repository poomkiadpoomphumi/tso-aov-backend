require('dotenv').config({ path: '../.env' });
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const multer = require('multer');

const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, '../tso-aov-sr-uploads/'); // Destination folder
        },
        filename: function (req, file, cb) {
            const date = Date.now(); // Generate a unique timestamp
            const fileExtension = file.originalname.split('.').pop(); // Extract the file extension
            const newFilename = `${date}.${fileExtension}`; // Construct the new filename
            req.newFilename = newFilename; // Add the new filename to the req object
            cb(null, newFilename);
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB file size limit
    }
});

const configAzure = {
    clientID: process.env.clientID,
    clientSecret: process.env.clientSecret,
    identityMetadata: process.env.identityMetadata,
    //redirectUrl: 'http://localhost:3000/auth/callback',
    redirectUrl: 'https://tso-aov-sr.pttplc.com/',
    allowHttpForRedirectUrl: true,
    responseType: 'code',
    responseMode: 'query',
    scope: ['openid', 'profile', 'email']
};

const AxwayHeader = {
    headers: {
        "Content-Type": "application/json",
        "KeyId": process.env.KeyId
    },
    httpsAgent
}

module.exports = {
    upload, AxwayHeader, configAzure, httpsAgent
}