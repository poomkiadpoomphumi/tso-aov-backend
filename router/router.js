const router = require('express').Router();
const config = require('../config/index');
const { ApiClearCache } = require('../api/index');
const { azureAuthMiddleware } = require('../middleware/index');
const { getSessionDataToken, uploadFileCallBack, getDataFormdigital, setTokenJwt, updateStatusApprove,
    updateStatusReject, CheckApprover, getDataRequest, getCodeImg, getDataFormSent, getEmployeeData,
    checkTokenExpiration, settingDigital, getsettings, Delete, isMaxHlvEmployer, LogsSystem, getLogsUserdata,
    setKeysX5t, getDataInMonth
} = require('../controller/CallBack');

router.post('/api/initail', setKeysX5t);
router.post('/api/Delete', azureAuthMiddleware, Delete);
router.post('/api/setToken', azureAuthMiddleware, setTokenJwt);
router.post('/api/LogsSystem', azureAuthMiddleware, LogsSystem);
router.post('/api/getCodeImg', azureAuthMiddleware, getCodeImg);
router.post('/api/getsettings', azureAuthMiddleware, getsettings);
router.post('/api/ApiClearCache', azureAuthMiddleware, ApiClearCache);
router.post('/api/CheckApprover', azureAuthMiddleware, CheckApprover);
router.post('/api/session', azureAuthMiddleware, getSessionDataToken);
router.post('/api/getLogsUser', azureAuthMiddleware, getLogsUserdata);
router.post('/api/getDataInMonth', azureAuthMiddleware, getDataInMonth);
router.post('/api/getDataRequest', azureAuthMiddleware, getDataRequest);
router.post('/api/settingDigital', azureAuthMiddleware, settingDigital);
router.post('/api/getEmployeeData', azureAuthMiddleware, getEmployeeData);
router.post('/api/getDataFormSent', azureAuthMiddleware, getDataFormSent);
router.post('/api/isMaxHlvEmployer', azureAuthMiddleware, isMaxHlvEmployer);
router.post('/api/updateStatusReject', azureAuthMiddleware, updateStatusReject);
router.post('/api/getDataFormdigital', azureAuthMiddleware, getDataFormdigital);
router.post('/api/updateStatusApprove', azureAuthMiddleware, updateStatusApprove);
router.post('/api/checkTokenExpiration', azureAuthMiddleware, checkTokenExpiration);
router.post('/api/upload', config.upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'file1', maxCount: 1 }
]), uploadFileCallBack);

module.exports = router;