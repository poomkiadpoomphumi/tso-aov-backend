require('dotenv').config({ path: '../.env' });
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const multer = require('multer');

// Reusable upload config
const createUploadMiddleware = (folderName) => {
    return multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, `../tso-aov-sr-uploads/${folderName}`);
            },
            filename: (req, file, cb) => {
                const timestamp = Date.now();
                const extension = file.originalname.split('.').pop();
                const newFilename = `${timestamp}.${extension}`;
                req.newFilename = newFilename;
                cb(null, newFilename);
            }
        }),
        limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
    });
};

// Usage
const upload = createUploadMiddleware('digital-project');
const uploadFirewall = createUploadMiddleware('firewall-project');

const configAzure = {
    clientID: process.env.clientID,
    clientSecret: process.env.clientSecret,
    identityMetadata: process.env.identityMetadata,
    //redirectUrl: 'http://localhost:3000/auth/callback',
    redirectUrl: process.env.ORIGIN_URL,
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
    upload, uploadFirewall, AxwayHeader, configAzure, httpsAgent
}