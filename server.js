require('dotenv').config({ path: './.env' });
const App = require("./router/router");
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const server = express();
const morgan = require('morgan');
const bodyParser = require('body-parser');
const port = process.env.BACKEND_PORT; //6006
const path = require('path');
const auth = require('./authentication/index.js');
// Middleware setup
server.use(morgan('dev'));
server.use(cors({
    origin: process.env.ORIGIN_URL,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Has-Me']
}));
server.use(express.json({ limit: '10mb' }));
server.use(bodyParser.json({ limit: '10mb' }));
server.use(cookieParser());
server.use(express.urlencoded({ extended: true, limit: '10mb' }));
server.use(auth.passport.initialize());
server.use('/api/uploads', express.static(path.join(__dirname, '../tso-aov-sr-uploads')));
server.use(App);
server.listen(port, () => { console.log(`Server listening on port ${port}`); });
server.get('/api/auth/login', auth.passportAuthenticate);
server.get('/api/auth/logout', auth.AzureLogout);
server.get('/api/auth/callback', auth.AzureCallback);
