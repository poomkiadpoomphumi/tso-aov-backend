require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const url_mongodb = process.env.MONGODB;
const ConnectMongoDB = async () => {
    if (!url_mongodb) {
        console.error("MONGODB environment variable is not set.");
        process.exit(1);
    }
    try {
        const client = new MongoClient(url_mongodb);
        await client.connect();
        return client.db('tso-aov-sr');
    } catch (err) {
        console.error("Failed to connect to the database:", err);
    }
};

module.exports = ConnectMongoDB;