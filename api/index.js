const axios = require('axios');
const config = require('../config/index');


const apiCache = new Map(); // Use Map for better cache handling
const agent = config.httpsAgent
// Helper function to add time-based expiration to the cache
const setCache = (key, data, ttl = 7200000) => { // 2 hours TTL
    const expiresAt = Date.now() + ttl;
    apiCache.set(key, { data, expiresAt });
};
// Helper function to check if cache is still valid
const getCache = (key) => {
    const cachedData = apiCache.get(key);
    if (!cachedData) return null;
    const { data, expiresAt } = cachedData;
    if (Date.now() > expiresAt) {
        apiCache.delete(key); // Invalidate cache if expired
        return null;
    }
    return data;
};
// Periodically clean expired cache entries
const ApiClearCache = () => {
    const now = Date.now();
    for (const [key, { expiresAt }] of apiCache.entries()) {
        if (now > expiresAt) {
            apiCache.delete(key);
        }
    }
    console.log('Expired cache entries cleared.');
};
setInterval(ApiClearCache, 3600000); // Check every hour for expired cache

// Convert keys to lowercase to standardize data
const LowerCaseData = (data) => {
    return Object.keys(data).reduce((acc, key) => {
        acc[key.toLowerCase()] = data[key];
        return acc;
    }, {});
};

// Main function exports return ro data
const getApiAxway = async (code, emp) => {
    if (!code || !emp) return [];
    const cacheKey = `${code}-${emp}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) {
        console.log(`DATA ${code} in memory.`);
        return LowerCaseData(cachedData);
    }
    const isEmployer = emp === 'Employer';
    const endpointAxway = isEmployer ? process.env.iPortalEmployer : process.env.iPortalEmployee;
    const fallbackEndpoint = isEmployer ? process.env.iPortalEmployerSpare : process.env.iPortalEmployeeSpare;
    try {
        const apiAxWayGateWay = await axios.post(endpointAxway, { code }, config.AxwayHeader);
        if (apiAxWayGateWay.status === 200) {
            const result = apiAxWayGateWay.data[0] || [];
            setCache(cacheKey, result); // Cache result with TTL
            console.log(`DATA ${endpointAxway}`);
            return LowerCaseData(result);
        }
    } catch (error) {
        // Fallback to the regular API
        if (!fallbackEndpoint) {
            console.error(`Fallback API endpoint for ${emp} not found.`);
            return [];
        }
        try {
            const response = await axios.get(`${fallbackEndpoint}${code}`, { httpsAgent: agent });
            if (response.status === 200) {
                const result = response.data || [];
                setCache(cacheKey, result); // Cache result
                console.log(`DATA fallback: ${fallbackEndpoint}${code}`);
                return LowerCaseData(result);
            } else {
                console.error(`Fallback API returned unexpected status: ${response.status}`);
                return 404;
            }
        } catch (error) {
            console.error(`Error fetching data from fallback API: ${error.message}`);
            return 404;
        }
    }
};

//https://tso-aov-sr.pttplc.com/
const sendMailAovServiceDigital = async (array) => {
    try {
        //send to api folder tso-mail-service
        const response = await axios.post("https://tso-aov-sr.pttplc.com/mail/MailServiceDigital", array, { httpsAgent: agent });
        if (response) {
            console.log('Email sent to', array.to);
        }
    } catch (error) {
        console.error('Error sending email:', error);
    }
};
const sendMailAovServiceFirewall = async (array) => {
    try {
        //send to api folder tso-mail-service
        const response = await axios.post("https://tso-aov-sr.pttplc.com/mail/MailServiceFirewall", array, { httpsAgent: agent });
        if (response) {
            console.log('Email sent to', array.to);
        }
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

module.exports = { getApiAxway, sendMailAovServiceDigital, sendMailAovServiceFirewall, ApiClearCache };
