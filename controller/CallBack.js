require('dotenv').config({ path: '../.env' });
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const secretKeyMain = process.env.SECRET_KEY;
const {
    QueueInsertDigitalForm, getApprovalsRequest, updateSetApprove,
    updateSetReject, CheckApproverData, getFormDataRequest, getDataSent,
    getEmployeeDataApi, _setting, _getsettings, _deleteDraft, getEmployerDataApi,
    keepLogsSystem, getLogsUser, getLogsUserInMonth, QueueInsertFirewallForm, _updateSetApproveFirewall,
    _updateSetRejectFirewall
} = require('../usecase/index.js');
const { response } = require('express');

const getSessionDataToken = (req, res) => {
    const token = req.body.userLocal;
    const decoded = jwt.verify(token, secretKeyMain);
    if (decoded && decoded.userToken) {
        res.send(decoded.userToken);
    } else {
        res.status(401).send({ error: 'Invalid token' });
    }

};

const uploadFileCallBack = async (req, res) => {
    // Retrieve files if they exist, otherwise set to null
    const uploadedFile = req.files['file'] ? req.files['file'][0] : null;
    const uploadedFile1 = req.files['file1'] ? req.files['file1'][0] : null;

    // Parse formValues back to an object
    const formValues = JSON.parse(req.body.formValues);

    // Only add filename properties if files are present
    if (uploadedFile) {
        formValues.FileNameServer = uploadedFile.filename;
    }
    if (uploadedFile1) {
        formValues.FileNameServer1 = uploadedFile1.filename;
    }

    // Process the form values and send response
    const resolve = await QueueInsertDigitalForm(formValues, req.body.status, req.body.id,req.body.recall);
    return res.send(resolve);
};


const getDataFormdigital = async (req, res) => {
    try {
        const decoded = jwt.verify(req.body.userLocalToken, secretKeyMain);
        const response = await getApprovalsRequest(decoded.userToken);
        res.send(response);
    } catch (err) {
        res.send([])
    }
}

const getDataRequest = async (req, res) => {
    try {
        const decoded = jwt.verify(req.body.userLocalToken, secretKeyMain);
        const response = await getFormDataRequest(decoded.userToken);
        res.send(response);
    } catch (err) {
        res.send([])
    }
}

const checkTokenExpiration = async (req, res) => {
    try {
        const decoded = jwt.decode(req.body.userLocalToken, { complete: true });
        const exp = decoded.payload.exp;
        const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
        if (exp < currentTime) {
            res.send('error');
        } else {
            res.send('default');
        }
    } catch (err) {
        console.error('Error function CheckExpire :', err);
    }
}

const setTokenJwt = async (req, res) => {
    try {
        if (req.body.params) {
            const token = jwt.sign({ userToken: req.body.params }, secretKeyMain, { expiresIn: '2hr' });
            res.send(token);
        } else {
            res.status(401).send({ massage: 'Unauthorized: Invalid token' })
        }

    } catch (error) {
        console.error('Error session expired:', error);
    }
}

const setKeysX5t = async (req, res) => {
    try {
        const x_has_me = req.headers['x-has-me'];
        const token = req.headers.authorization?.split(' ')[1]; // Bearer token
        if (!x_has_me || !token) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }
        if (x_has_me === token) {
            const decodedToken = jwt.decode(token, { complete: true });
            if (!decodedToken) { return res.status(401).json({ message: 'Unauthorized: Invalid token' }); }
            const client = jwksClient({ jwksUri: `https://login.microsoftonline.com/${decodedToken.payload.tid}/discovery/v2.0/keys` });
            const key = await client.getSigningKey(decodedToken.header.kid || decodedToken.header.x5t);
            const publicKey = key.getPublicKey();
            const setToken = jwt.sign({ localToken: publicKey }, secretKeyMain, { expiresIn: '2hr' });
            res.send(setToken);
        } else {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }
    } catch (error) {
        console.error('Error session expired:', error);
    }
}

const updateStatusApprove = async (req, res) => {
    try {
        const update = await updateSetApprove(
            req.body.id, req.body.commentValue, req.body.params, req.body.userCode
        );
        res.send(update);
    } catch (e) {
        console.error('Error Approve:', e);
    }
}
const updateStatusReject = async (req, res) => {
    try {
        const reject = await updateSetReject(
            req.body.id, req.body.commentValue, req.body.params, req.body.userCode
        );
        res.send(reject);
    } catch (e) {
        console.error('Error Approve:', e);
    }
}
const CheckApprover = async (req, res) => {
    try {
        const decoded = jwt.verify(req.body.params, secretKeyMain);
        const CheckApprover = await CheckApproverData(decoded.userToken);
        res.send(CheckApprover);
    } catch (e) {
        res.send([])
    }
}

const getDataFormSent = async (req, res) => {
    try {
        const response = await getDataSent(req.body.id);
        res.send(response);
    } catch (e) {
        console.error('Error Function getDataFormSent:', e);
    }
}
const getCodeImg = async (req, res) => {
    try {
        const decoded = jwt.verify(req.body.token, secretKeyMain);
        const response = await getEmployeeDataApi(decoded.userToken);
        res.json(response);
    } catch (err) {
        res.send([]);
    }
}
const getEmployeeData = async (req, res) => {
    try {
        const data = await getEmployeeDataApi(req.body.code)
        res.send(data);
    } catch (e) {
        res.send([]);
    }
}

const isMaxHlvEmployer = async (req, res) => {
    try {
        const data = await getEmployerDataApi(req.body.code)
        res.send(data);
    } catch (e) {
        res.send([]);
    }
}

const settingDigital = async (req, res) => {
    try {
        res.json(await _setting(req.body.array, req.body.code, req.body.service));
    } catch (e) {
        console.error('Error Function getEmployeeData:', e);
    }
}

const getsettings = async (req, res) => {
    try {
        const response = await _getsettings(req.body.params);
        res.json(response);
    } catch (e) {
        console.error('Error Function getEmployeeData:', e);
    }
}

const Delete = async (req, res) => {
    try {
        const _delete = await _deleteDraft(req.body.id);
        res.send(_delete);
    } catch (e) {
        console.error('Error Function Delete:', e);
    }
}

const LogsSystem = async (req, res) => {
    try {
        const userAgent = req.headers['user-agent'];
        const sys = await keepLogsSystem(req.body.array, userAgent);
        res.send(sys);
    } catch (e) {
        console.error('Error Function LogsSystem:', e);
    }
}

const getLogsUserdata = async (req, res) => {
    try {
        const { s, e, module } = req.body;
        const logData = await getLogsUser(s, e, module);
        res.send(logData);
    } catch (e) {
        console.error('Error Function getLogsUserdata:', e);
    }
}
const getDataInMonth = async (req, res) => {
    try {
        const { s, e } = req.body;
        const logData = await getLogsUserInMonth(s, e);
        res.send(logData);
    } catch (e) {
        console.error('Error Function getDataInMonth:', e);
    }
}
const uploadDataFirewall = async (req, res) => {
    try {
        const uploadedFile = req.files['file'] ? req.files['file'][0] : null;
        // Parse formValues back to an object
        const formValues = JSON.parse(req.body.formValues);
        // Only add filename properties if files are present
        if (uploadedFile) {
            formValues.FileNameServer = uploadedFile.filename;
        }
        const resolve = await QueueInsertFirewallForm(formValues, req.body.status, req.body.id, req.body.recall);
        return res.send(resolve);
    } catch (e) {
        console.error('Error Function uploadDataFirewall:', e);
    }
}

const updateStatusFirewall = async (req, res) => {
    try {
        if (req.body.button === 'approve') {
            const update = await _updateSetApproveFirewall(
                req.body.id, req.body.comment, req.body.params, req.body.userCode
            );
            res.send(update);
        } else {
            const update = await _updateSetRejectFirewall(
                req.body.id, req.body.comment, req.body.params, req.body.userCode
            );
            res.send(update);
        }
    } catch (e) {
        console.error('Error Approve:', e);
    }
}

module.exports = {
    getSessionDataToken,
    uploadFileCallBack,
    getDataFormdigital,
    setTokenJwt,
    updateStatusApprove,
    updateStatusReject,
    CheckApprover,
    getDataRequest,
    getCodeImg,
    getDataFormSent,
    getEmployeeData,
    checkTokenExpiration,
    settingDigital,
    getsettings,
    Delete,
    isMaxHlvEmployer,
    LogsSystem,
    getLogsUserdata,
    setKeysX5t,
    getDataInMonth,
    uploadDataFirewall,
    updateStatusFirewall
};
