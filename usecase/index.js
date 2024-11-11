const { ObjectId } = require('mongodb');
const ConnectMongoDB = require('../connection/MongoDB.js');
const { getApiAxway, sendMailAovService } = require('../api/index.js');
const { thaiTime } = require('./time.js');
const { joinArray } = require('./joinArray.js');
const { getDPRCode, addDPR, getLastTicket } = require('./DPRCode.js');
const GroupMongoDB = require('../repository/index.js');
const { UAParser } = require('ua-parser-js');
const USER_EXIT = "User exit or no have permission";

//function get data ecployee from api axway 
const getEmployeeDataApi = async (code) => {
    try {
        if (code.length > 6) { return USER_EXIT; } else {
            const data = await getApiAxway(code, 'Employee');
            if (!data) {
                throw new Error('No data returned from API');
            }
            return data;
        }

    } catch (err) {
        console.error("Failed to get employee data in middleware:", err);
        return null;
    }
}

//function check max level in oc and return data
const getEmployerDataApi = async (code) => {
    try {
        if (code.length > 6) { return USER_EXIT; } else {
            const data1 = await getApiAxway(code, 'Employee');
            const data2 = await getApiAxway(code, 'Employer');
            if (!data1 && !data2) {
                throw new Error('No data returned from API');
            }
            if (data2[0] === 'N') {
                return { MaxLavel: true, emp1: data1, emp2: data2 };
            } else {
                return { MaxLavel: false, emp1: data1, emp2: data2 };
            }
        }

    } catch (err) {
        console.error("Failed to get employee data in middleware:", err);
        return null;
    }
}
const _getsettings = async (params) => {
    const db = await ConnectMongoDB();
    try {
        const set = await db.collection("settings").find({ service: params }).toArray();
        return set
    } catch (error) {
        console.error('Error getting form data approver:', error);
        throw error;
    } finally {
        db.client.close();
    }
}

const QueueInsertDigitalForm = async (obj, status, id) => {
    const settings = await _getsettings('digital');
    const db = await ConnectMongoDB();
    try {
        let resolve = '';
        const requesterCode = obj.requesterCode;
        const Managerdata = await getApiAxway(requesterCode, 'Employer');
        const CH = await getApiAxway(Managerdata.code, 'Employer');
        const ManagerdataHlv = CH === undefined ? await getApiAxway(Managerdata.code, 'Employee') : CH;
        const lastTicketId = await getLastTicket(db, 'DPR');
        // Check if the ID is valid
        if (id && ObjectId.isValid(id)) {
            const objectId = new ObjectId(id);
            // Update existing form
            const getTickket = await db.collection("tickets").find({ formId: objectId }).toArray();
            if (getTickket.length > 0) {
                await db.collection("formDetails").updateOne({ _id: objectId }, { $set: obj });
                await db.collection("tickets").updateOne({ formId: objectId },
                    {
                        $set: { sectionHeadStatus: status, departmentHeadStatus: 'wait', createAt: thaiTime() }
                    });
            } else {
                // Insert new form if the ticket doesn't exist
                resolve = await insertNewForm(db, obj, requesterCode, Managerdata, ManagerdataHlv, status, lastTicketId);
            }
        } else {
            // Insert new form
            resolve = await insertNewForm(db, obj, requesterCode, Managerdata, ManagerdataHlv, status, lastTicketId);
        }
        if (status === 'wait') {
            await sendMailAovService({
                to: Managerdata.emailaddr, //Managerdata.emailaddr
                cc: settings[0].ccmail,
                requesterName: obj.coordinatorName,
                NameApprover: Managerdata.fname + ' ' + Managerdata.lname,
                jobDetails: [
                    obj.jobName, obj.jobDetails, obj.department, obj.objectives, obj.benefits, obj.workType,
                    obj.natureOfWork, obj.ValueTarget, obj.ValuePlatform, obj.fileName, obj.ValueImpact, obj.ValueCompliance,
                    obj.ValuePeriod, obj.fileName1, obj.budget, obj.budgetUsed, obj.ApprovedBy, obj.connecterRequest],
                fileName: obj.FileNameServer,
                fileName1: obj.FileNameServer1,
                action: 'Send' //Params Send, Approved, Reject
            });
        }
        db.client.close();
        return { 'insertedId': resolve.insertedId }
    } catch (err) {
        console.error("Failed to perform database operation:", err);
    }
};

const insertNewForm = async (db, obj, requesterCode, Managerdata, ManagerdataHlv, status, lastTicketId) => {
    obj.sectionHeadComment = '';
    obj.departmentHeadComment = '';
    const settings = await _getsettings('digital');
    const insertResult = await db.collection("formDetails").insertOne(obj);
    await db.collection("tickets").insertOne({
        ticketId: lastTicketId && lastTicketId.ticketId ?
            addDPR(lastTicketId.ticketId) : getDPRCode(1),
        formId: insertResult.insertedId,
        requesterCode: requesterCode,
        sectionHeadCode: Managerdata.code,
        departmentHeadCode: ManagerdataHlv.code,
        sectionHeadStatus: status,
        departmentHeadStatus: 'wait',
        maxLevelApprover: parseInt(settings[0].approver, 10),
        createAt: thaiTime(),
        updateAt: '',
    });
    return insertResult;
};


const getApprovalsRequest = async (code) => {
    const db = await ConnectMongoDB();
    try {
        if (!code) return [];
        // Fetch all necessary tickets in one query
        const getApprover = await db.collection("tickets").find({
            $or: [
                { sectionHeadStatus: 'wait', sectionHeadCode: code, maxLevelApprover: { $in: [3, 4] } },
                { departmentHeadCode: code, maxLevelApprover: 4 }
            ]
        }).toArray();
        const formIds = getApprover.map(item => item.formId);
        const resultDataForm = await db.collection("formDetails").find({ _id: { $in: formIds } }).toArray();
        const joinedData = joinArray(getApprover, resultDataForm);
        // Batch API calls
        const dataUser = await getApiAxway(code, 'Employee');
        const dataManagerHlvPromise = getApprover.some(
            ticket => ticket.departmentHeadCode !== code) ? getApiAxway(dataUser.code, 'Employee') : getApiAxway(dataUser.code, 'Employer');
        if (dataManagerHlvPromise === 'No data available') { return []; }
        const sectionHeadCodes = [...new Set(joinedData.map(data => data.sectionHeadCode))];
        const sectionHeadsPromise = Promise.all(sectionHeadCodes.map(code => getApiAxway(code, 'Employee')));
        const nextApproversPromise = Promise.all(sectionHeadCodes.map(code => getApiAxway(code, 'Employer')));
        if (nextApproversPromise === 'No data available') { return []; }
        const [dataManagerHlv, sectionHeads, nextApprovers] = await Promise.all([dataManagerHlvPromise, sectionHeadsPromise, nextApproversPromise]);
        // Map section head and next approver data
        const sectionHeadMap = new Map(sectionHeadCodes.map((code, index) => [code, sectionHeads[index]]));
        const nextApproverMap = new Map(sectionHeadCodes.map((code, index) => [code, nextApprovers[index]]));
        for (const data of joinedData) {
            try {
                const sectionHead = sectionHeadMap.get(data.sectionHeadCode) || {};
                const nextApprover = nextApproverMap.get(data.sectionHeadCode) || {};
                data.NameApprover = `${dataUser.fname} ${dataUser.lname}`;
                data.NextApprover = `${nextApprover.fname} ${nextApprover.lname}`;
                data.Reviewed = `${dataManagerHlv.fname} ${dataManagerHlv.lname}`;
                data.Managerdata = `คุณ${sectionHead.fname} ${sectionHead.lname}`;
                data.ManagerdataCode = sectionHead.code;
                data.ManagerdataMobile = sectionHead.mobile;
            } catch (error) {
                console.error(`Error fetching data for sectionHeadCode ${data.sectionHeadCode}:`, error);
            }
        }
        return joinedData;
    } catch (error) {
        console.error('Error getting form data:', error);
        throw error;
    } finally {
        db.client.close();
    }
};

const getDataSent = async (id) => {
    const db = await ConnectMongoDB();
    const objectId = new ObjectId(id);
    try {
        if (!id) return [];
        const resultDataForm = await db.collection("formDetails")
            .find({ _id: objectId }).toArray();
        const resultTicketDataForm = await db.collection("tickets")
            .find({ formId: objectId }).toArray();
        const joinedData = joinArray(resultTicketDataForm, resultDataForm);
        return joinedData[0]
    } catch (error) {
        console.error('Error getting data id:', error);
        return [];
    } finally {
        db.client.close();
    }
}


const getNameApprover = async (joinedData, dataManager, dataManagerHlv, code) => {
    // Use map instead of forEach to correctly handle async operations
    const updatedData = await Promise.all(joinedData.map(async (data) => {
        // Perform your logic here as before
        if (data.sectionHeadCode !== code) {
            const NamedataManager = 'คุณ' + dataManager.fname + ' ' + dataManager.lname;
            const NamedataManagerHlv = 'คุณ' + dataManagerHlv.fname + ' ' + dataManagerHlv.lname;
            data.NameApprover =
                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' &&
                    data.maxLevelApprover === 4 ? NamedataManagerHlv :
                    data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' &&
                        data.maxLevelApprover === 4 ? NamedataManager :
                        data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' &&
                            data.maxLevelApprover === 4 ? NamedataManagerHlv :
                            data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' &&
                                data.maxLevelApprover === 4 ? NamedataManager + ' , ' + NamedataManagerHlv :
                                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' &&
                                    data.maxLevelApprover === 3 ? NamedataManager :
                                    data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' &&
                                        data.maxLevelApprover === 3 ? NamedataManager :
                                        data.sectionHeadStatus === 'wait' && data.departmentHeadStatus === 'wait' &&
                                            data.maxLevelApprover === 3 ? NamedataManager :
                                            NamedataManager;
        }
        if (data.sectionHeadCode === code || data.departmentHeadCode === code) {
            const Approver1 = await getApiAxway(code, 'Employee');
            const Approver2 = await getApiAxway(Approver1.code, 'Employer');
            const NamedataManager = 'คุณ' + Approver1.fname + ' ' + Approver1.lname;
            const NamedataManagerHlv = 'คุณ' + Approver2.fname + ' ' + Approver2.lname;
            const CodeName =
                data.sectionHeadStatus === 'approved' &&
                    data.departmentHeadStatus === 'approved' &&
                    data.maxLevelApprover === 4 &&
                    data.sectionHeadCode === code || data.departmentHeadCode === code ?
                    data.sectionHeadCode : data.departmentHeadCode;
            const NameApprover1 = await getApiAxway(CodeName, 'Employee');
            data.NameApprover =
                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' &&
                    data.maxLevelApprover === 4 && data.sectionHeadCode === code ? NamedataManagerHlv :
                    data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' &&
                        data.maxLevelApprover === 4 ? NamedataManager :
                        data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' &&
                            data.maxLevelApprover === 4 ? NamedataManagerHlv :
                            data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' &&
                                data.maxLevelApprover === 4 && data.sectionHeadCode === code ?
                                NamedataManager + ' , ' + NamedataManagerHlv :
                                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' &&
                                    data.maxLevelApprover === 4 && data.departmentHeadCode === code ?
                                    'คุณ' + NameApprover1.fname + ' ' + NameApprover1.lname + ', ' + NamedataManager :
                                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' &&
                                        data.maxLevelApprover === 3 ? NamedataManager :
                                        data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' &&
                                            data.maxLevelApprover === 3 ? NamedataManager :
                                            data.sectionHeadStatus === 'wait' && data.departmentHeadStatus === 'wait' &&
                                                data.maxLevelApprover === 3 ? NamedataManager :
                                                NamedataManager;
        }
        return data; // Return the updated data object
    }));

    return updatedData; // Return the entire array of updated data objects
}

const getFormDataRequest = async (code) => {
    const currentYear = new Date().getFullYear();
    const db = await ConnectMongoDB();
    let joinedData = [];
    try {
        if (!code) return []; // Early return if code is not provided
        // Fetch data in parallel
        const [resultDataForm, ticket] = await Promise.all([
            db.collection("formDetails").find({ requesterCode: code }).toArray(),
            db.collection("tickets").aggregate(GroupMongoDB.TicketMongoDB(code)).toArray()
        ]);
        const formIds = resultDataForm.map(item => item._id);
        // Fetch additional data in parallel
        const [DataFormTicket, DataForm1] = await Promise.all([
            db.collection("tickets").aggregate(GroupMongoDB.TicketGroup(formIds)).toArray(),
            db.collection("formDetails").find({ _id: { $in: ticket.map(item => item.formId) } }).toArray()
        ]);
        // Filter tickets by current year
        const filteredTickets = DataFormTicket.filter(ticket => {
            const ticketYear = ticket.createAt.split('-')[0];
            return ticketYear === currentYear.toString();
        });
        const dataManager = await getApiAxway(code, 'Employer');
        if (dataManager === 'No data available') { return []; }
        const CH = await getApiAxway(dataManager.code, 'Employer');
        if (CH === 'No data available') { return []; }
        const ManagerdataHlv = CH || await getApiAxway(dataManager.code, 'Employee');
        // Combine data based on availability
        if (resultDataForm.length > 0 || DataForm1.length > 0) {
            joinedData = joinArray(
                ticket.concat(filteredTickets),
                resultDataForm.concat(DataForm1)
            );
        } else {
            joinedData = joinArray(ticket, DataForm1);
        }
        joinedData.sort((a, b) => {
            // Helper function to convert custom date format to JavaScript Date object
            const parseDate = (dateStr) => {
                const [datePart, timePart] = dateStr.split(' ');
                const [year, day, month] = datePart.split('-');
                const formattedDate = `${year}-${month}-${day} ${timePart}`;
                return new Date(formattedDate);
            };
            const dateA = parseDate(a.createAt || a.updateAt);
            const dateB = parseDate(b.createAt || b.updateAt);
            return dateB - dateA; // Sort descending (latest date first)
        });
        return await getNameApprover(joinedData, dataManager, ManagerdataHlv, code); // Return the updated data array
    } catch (error) {
        console.error('Error getting form data:', error);
        return [];
    } finally {
        db.client.close();
    }
};


const CheckApproverData = async (code) => {
    const db = await ConnectMongoDB();
    try {
        if (!code) return [];
        // Perform a single query with $or to check both conditions
        const approvers = await db.collection("tickets").find({
            $or: [
                { sectionHeadCode: code },
                { departmentHeadCode: code }
            ]
        }).toArray();

        // Return the results, filtering if needed
        return approvers.length > 0 ? approvers : [];
    } catch (error) {
        console.error('Error getting form data approver:', error);
        throw error;
    } finally {
        db.client.close();
    }
};


const updateSetApprove = async (id, commentValue, params, userCode) => {
    const settings = await _getsettings('digital');
    const objectId = new ObjectId(id);
    const db = await ConnectMongoDB();
    const column = params === 'approver1' ? 'sectionHeadStatus' : 'departmentHeadStatus';
    const comment = params === 'approver1' ? 'sectionHeadComment' : 'departmentHeadComment';
    TicketDataForm = await db.collection("tickets").find({ _id: objectId }).toArray();
    await db.collection("tickets").updateOne({ _id: objectId },
        { $set: { [column]: 'approved', updateAt: thaiTime() } });
    const objectIdDataForm = new ObjectId(TicketDataForm[0].formId);
    await db.collection("formDetails").updateOne({ _id: objectIdDataForm },
        { $set: { [comment]: commentValue } });
    const getData = await db.collection("formDetails").find({ _id: objectIdDataForm }).toArray();
    const checkApprover = await db.collection("tickets").find({ _id: objectId }).toArray();
    const userData = await getApiAxway(userCode, 'Employee');
    const dataManager = await getApiAxway(userCode, 'Employer');
    const EmpMg = await getApiAxway(checkApprover[0].sectionHeadCode, 'Employee');
    const EmpMd = await getApiAxway(checkApprover[0].departmentHeadCode, 'Employee');
    settings[0].ccmail.unshift(dataManager.emailaddr); //Insert new email at the first index
    if (checkApprover[0].maxLevelApprover === 4) {
        if (checkApprover[0].sectionHeadStatus === 'approved' &&
            checkApprover[0].departmentHeadStatus === 'wait') {
            sendMailAovService({
                to: dataManager.emailaddr, // dataManager.emailaddr
                cc: settings[0].ccmail,
                reviewBy: userData.fname + ' ' + userData.lname,
                requesterName: getData[0].coordinatorName,
                NameApprover: dataManager.fname + ' ' + dataManager.lname,
                jobDetails: [
                    getData[0].jobName, getData[0].jobDetails, getData[0].department, getData[0].objectives, getData[0].benefits, getData[0].workType,
                    getData[0].natureOfWork, getData[0].ValueTarget, getData[0].ValuePlatform, getData[0].fileName,
                    getData[0].ValueImpact, getData[0].ValueCompliance, getData[0].ValuePeriod, getData[0].fileName1, getData[0].budget, getData[0].budgetUsed, getData[0].ApprovedBy, getData[0].connecterRequest],
                fileName: getData[0].FileNameServer,
                fileName1: getData[0].FileNameServer1,
                action: 'Send'
            });
        } else if (checkApprover[0].sectionHeadStatus === 'approved' &&
            checkApprover[0].departmentHeadStatus === 'approved') {
            const Approver = 'ผู้อนุมัติ : คุณ' + EmpMg.fname + ' ' + EmpMg.lname + ',' + 'คุณ' + EmpMd.fname + ' ' + EmpMd.lname
            sendMailAovService({
                to: getData[0].requesterEmail, //getData[0].requesterEmail
                cc: settings[0].ccmail,
                requesterName: getData[0].coordinatorName,
                NameApprover: Approver,
                jobDetails: [
                    getData[0].jobName, getData[0].jobDetails, getData[0].department, getData[0].objectives, getData[0].benefits, getData[0].workType,
                    getData[0].natureOfWork, getData[0].ValueTarget, getData[0].ValuePlatform, getData[0].fileName,
                    getData[0].ValueImpact, getData[0].ValueCompliance, getData[0].ValuePeriod, getData[0].fileName1, getData[0].budget, getData[0].budgetUsed, getData[0].ApprovedBy, getData[0].connecterRequest],
                comments: getData[0].sectionHeadComment + ' และ ' + getData[0].departmentHeadComment,
                fileName: getData[0].FileNameServer,
                fileName1: getData[0].FileNameServer1,
                action: 'Approved' //Params Send, Approved, Reject
            })
        }
    } else if (checkApprover[0].maxLevelApprover === 3) {
        if (checkApprover[0].sectionHeadStatus === 'approved' &&
            checkApprover[0].departmentHeadStatus === 'wait') {
            const Approver = 'ผู้อนุมัติ : คุณ' + EmpMg.fname + ' ' + EmpMg.lname;
            sendMailAovService({
                to: getData[0].requesterEmail, // getData[0].requesterEmail
                cc: settings[0].ccmail,
                requesterName: getData[0].coordinatorName,
                NameApprover: Approver,
                jobDetails: [
                    getData[0].jobName, getData[0].jobDetails, getData[0].department, getData[0].objectives,
                    getData[0].benefits, getData[0].workType,
                    getData[0].natureOfWork, getData[0].ValueTarget,
                    getData[0].ValuePlatform, getData[0].fileName, getData[0].ValueImpact, getData[0].ValueCompliance,
                    getData[0].ValuePeriod, getData[0].fileName1, getData[0].budget, getData[0].budgetUsed, getData[0].ApprovedBy, getData[0].connecterRequest],
                fileName: getData[0].FileNameServer,
                fileName1: getData[0].FileNameServer1,
                comments: getData[0].sectionHeadComment,
                action: 'Approved' //Params Send, Approved, Reject
            })
        }
    }
}



const updateSetReject = async (id, commentValue, params, userCode) => {
    const settings = await _getsettings('digital');
    const objectId = new ObjectId(id);
    const db = await ConnectMongoDB();
    const column = params === 'approver1' ? 'sectionHeadStatus' : 'departmentHeadStatus';
    TicketDataForm = await db.collection("tickets").find({ _id: objectId }).toArray();
    await db.collection("tickets").updateOne({ _id: objectId },
        { $set: { [column]: 'reject', updateAt: thaiTime() } });
    const objectIdDataForm = new ObjectId(TicketDataForm[0].formId);
    await db.collection("formDetails").updateOne({ _id: objectIdDataForm },
        { $set: { comment: commentValue } });
    const getData = await db.collection("formDetails").find({ _id: objectIdDataForm }).toArray();
    const checkApprover = await db.collection("tickets").find({ _id: objectId }).toArray();
    const EmpMg = await getApiAxway(checkApprover[0].sectionHeadCode, 'Employee');
    const EmpMd = await getApiAxway(checkApprover[0].departmentHeadCode, 'Employee');
    const MgApprover = 'ปฏิเสธโดย : คุณ' + EmpMg.fname + ' ' + EmpMg.lname;
    const MdApprover = 'ปฏิเสธโดย : คุณ' + EmpMd.fname + ' ' + EmpMd.lname;
    settings[0].ccmail.unshift(EmpMd.emailaddr); //Insert new email at the first index
    if (checkApprover[0].maxLevelApprover === 4) {
        if (checkApprover[0].sectionHeadStatus === 'reject' &&
            checkApprover[0].departmentHeadStatus === 'wait') {
            sendMailAovService({
                to: getData[0].requesterEmail, // getData[0].requesterEmail
                cc: settings[0].ccmail,
                requesterName: getData[0].coordinatorName,
                NameApprover: MgApprover,
                jobDetails: [
                    getData[0].jobName, getData[0].jobDetails, getData[0].department, getData[0].objectives,
                    getData[0].benefits, getData[0].workType,
                    getData[0].natureOfWork, getData[0].ValueTarget,
                    getData[0].ValuePlatform, getData[0].fileName,
                    getData[0].ValueImpact, getData[0].ValueCompliance, getData[0].ValuePeriod, getData[0].fileName1, getData[0].budget, getData[0].budgetUsed, getData[0].ApprovedBy, getData[0].connecterRequest],
                fileName: getData[0].FileNameServer,
                fileName1: getData[0].FileNameServer1,
                action: 'Rejected' //Params Send, Approved, Reject
            });
        } else if (checkApprover[0].sectionHeadStatus === 'approved' &&
            checkApprover[0].departmentHeadStatus === 'reject') {
            sendMailAovService({
                to: getData[0].requesterEmail, // getData[0].requesterEmail
                cc: settings[0].ccmail,
                requesterName: getData[0].coordinatorName,
                NameApprover: MdApprover,
                jobDetails: [
                    getData[0].jobName, getData[0].jobDetails, getData[0].department, getData[0].objectives,
                    getData[0].benefits, getData[0].workType,
                    getData[0].natureOfWork, getData[0].ValueTarget,
                    getData[0].ValuePlatform, getData[0].fileName,
                    getData[0].ValueImpact, getData[0].ValueCompliance, getData[0].ValuePeriod, getData[0].fileName1, getData[0].budget, getData[0].budgetUsed, getData[0].ApprovedBy, getData[0].connecterRequest],
                fileName: getData[0].FileNameServer,
                fileName1: getData[0].FileNameServer1,
                comments: getData[0].sectionHeadComment + ' และ ' + getData[0].departmentHeadComment,
                action: 'Rejected' //Params Send, Approved, Reject
            })
        }
    } else if (checkApprover[0].maxLevelApprover === 3) {
        if (checkApprover[0].sectionHeadStatus === 'reject' &&
            checkApprover[0].departmentHeadStatus === 'wait') {
            sendMailAovService({
                to: getData[0].requesterEmail, // getData[0].requesterEmail
                cc: settings[0].ccmail,
                requesterName: getData[0].coordinatorName,
                NameApprover: MgApprover,
                jobDetails: [
                    getData[0].jobName, getData[0].jobDetails, getData[0].department, getData[0].objectives,
                    getData[0].benefits, getData[0].workType,
                    getData[0].natureOfWork, getData[0].ValueTarget,
                    getData[0].ValuePlatform, getData[0].fileName,
                    getData[0].ValueImpact, getData[0].ValueCompliance, getData[0].ValuePeriod, getData[0].fileName1, getData[0].budget, getData[0].budgetUsed, getData[0].ApprovedBy, getData[0].connecterRequest],
                fileName: getData[0].FileNameServer,
                fileName1: getData[0].FileNameServer1,
                comments: getData[0].sectionHeadComment,
                action: 'Rejected' //Params Send, Approved, Reject
            });
        }
    }
}
const _setting = async (array, code) => {
    const db = await ConnectMongoDB();
    try {
        if (array) {
            await db.collection("settings")
                .updateOne({ service: 'digital' },
                    { $set: { approver: array.approver, ccmail: array.ccmail, updatedBy: code, timeStamp: thaiTime() } });
            return array
        }

    } catch (error) {
        console.error('Error getting form data approver:', error);
        throw error;
    } finally {
        db.client.close();
    }
}



const _deleteDraft = async (id) => {
    const db = await ConnectMongoDB();
    const objectId = new ObjectId(id);
    try {
        await db.collection("formDetails").deleteOne({ _id: objectId });
        await db.collection("tickets").deleteOne({ formId: objectId })
        return true;
    } catch (error) {
        console.error('Error delete form data:', error);
        return false;
    } finally {
        db.client.close();
    }
}
const keepLogsSystem = async (array, userAgent) => {
    const db = await ConnectMongoDB();
    try {
        const parser = new UAParser(userAgent);
        const result = parser.getResult();
        if (array.code) {
            const existingLogs = await db.collection("system_logs").find({ user_code: array.code, time_stamp: thaiTime() }).toArray();
            if (existingLogs.length <= 0) {
                await db.collection("system_logs").insertOne({
                    user_code: array.code,
                    unitabbr: array.unitabbr,
                    browser: result.os.name + '/' + result.browser.name,
                    time_stamp: thaiTime()
                });
            }
        }

    } catch (e) {
        console.error('Error keepLogsSystem:', e);
    } finally {
        db.client.close();
    }
}


const getLogsUser = async (start, end) => {
    const db = await ConnectMongoDB();
    try {
        const [countUser, getMonth, getService] = await Promise.all([
            db.collection("system_logs").aggregate(GroupMongoDB.GroupByUserCode(start, end)).toArray(),
            db.collection("system_logs").aggregate(GroupMongoDB.GroupByMonth(start, end)).toArray(),
            db.collection('tickets').aggregate(GroupMongoDB.GroupBySystem(start, end)).toArray()
        ]);
        // Format the result to match the desired output
        const systemRequest = (getService || []).map(item => {
            const systemName = item.system || 'UnknownSystem';
            return {
                [systemName.replace(/ /g, '')]: item.count,
                ['lastDate']: item.createAt
            };
        });
        const ensureDigitalrequestFirst = (arr) => {
            return arr.sort((a, b) => {
                if (a.Digitalrequest !== undefined) return -1; // Move Digitalrequest to the beginning
                if (b.Digitalrequest !== undefined) return 1;  // Leave other elements as they are
                return 0;
            });
        }
        const monthMapping = {
            '01': 'Jan',
            '02': 'Feb',
            '03': 'Mar',
            '04': 'Apr',
            '05': 'May',
            '06': 'June',
            '07': 'July',
            '08': 'Aug',
            '09': 'Sept',
            '10': 'Oct',
            '11': 'Nov',
            '12': 'Dec'
        };
        const updatedGetMonth = getMonth.map(item => ({ _id: monthMapping[item._id.split('-')[1]], count: item.count }));
        // Transform the systemRequest array
        const updatedsystemRequest = systemRequest.map(item => {
            const systemKey = Object.keys(item).find(key => key !== 'lastDate'); // Find the key that isn't 'lastDate'
            const count = item[systemKey]; // Get the count using the system key
            const lastDate = monthMapping[item.lastDate]; // Map 'lastDate' to the month name
            // Return a new object with the formatted month and count
            return { [systemKey]: count, lastDate: lastDate };
        });
        // Get the current month
        const currentMonth = new Date().getMonth() + 1; // getMonth() is 0-based, so add 1
        const currentYear = new Date().getFullYear();
        // Calculate the last six months
        const lastSixMonths = [];
        for (let i = 5; i >= 0; i--) {
            let month = currentMonth - i;
            let year = currentYear;
            if (month <= 0) {
                month += 12;
                year -= 1;
            }
            const formattedMonth = month < 10 ? `0${month}` : `${month}`;
            lastSixMonths.push(monthMapping[formattedMonth]);
        }
        // Filter the data for the last six months
        const filteredData = updatedGetMonth.filter(item => lastSixMonths.includes(item._id));
        const sortMonth = filteredData.map(item => ({ count: item.count, month: item._id }));
        return { countUser: countUser, getMonth: sortMonth, systemRequest: ensureDigitalrequestFirst(updatedsystemRequest) };
    } catch (e) {
        console.error('Error get log user:', e);
    } finally {
        db.client.close();
    }
};

const groupByLastDate = (data) => {
    const result = [];
    const map = new Map();
    data.forEach(item => {
        const { lastDate, count } = item;
        if (map.has(lastDate)) {
            map.set(lastDate, map.get(lastDate) + count);
        } else {
            map.set(lastDate, count);
        }
    });
    map.forEach((count, lastDate) => {
        result.push({ count, lastDate });
    });
    return result;
}

const getLogsUserInMonth = async (start, end) => {
    const db = await ConnectMongoDB();
    try {
        const [LogsSystem, getUserData, RevenuData] = await Promise.all([
            db.collection("tickets").aggregate(GroupMongoDB.optimizedLogsSystemPipeline(start, end)).toArray(),
            db.collection("system_logs").aggregate(GroupMongoDB.optimizedGetUserDataPipeline(start, end)).toArray(),
            db.collection("tickets").aggregate(GroupMongoDB.optimizedGetRevenuDataPipeline(start, end)).toArray()
        ]);
        const systemRequest = (LogsSystem || []).map(item => {
            return {
                ['count']: item.count,
                ['lastDate']: item.createAt
            };
        });
        const systemRevenu = (RevenuData || []).map(item => {
            const systemName = item.system || 'UnknownSystem';
            return {
                [systemName.replace(/ /g, '')]: item.count,
                ['lastDate']: item.createAt
            };
        });
        const result = [];
        systemRevenu.forEach((item) => {
            const systemKey = Object.keys(item).find(key => key !== 'lastDate'); // Find the key that isn't 'lastDate'
            const count = item[systemKey] || 0; // Get the count associated with that key
            // Check if the systemKey already exists in result
            const existingEntry = result.find(entry => entry.hasOwnProperty(systemKey));
            if (existingEntry) {
                // If the systemKey exists, add to the count
                existingEntry[systemKey] += count;
            } else {
                // If the systemKey does not exist, add a new entry
                result.push({
                    [systemKey]: count,
                    lastDate: true
                });
            }
        });
        const transformedArray = getUserData.map(item => ({
            _id: item._id,
            unitabbr: item.unitabbr,
            count: item.count,
            date: new Date(item.date).getUTCDate()
        }));
        const aggregatedCounts = transformedArray.reduce((acc, item) => {
            // Find if the date already exists in the accumulator
            const existing = acc.find(entry => entry._id === item.date.toString());
            if (existing) {
                // If it exists, increment the count
                existing.count += item.count;
            } else {
                // If it does not exist, add a new entry
                acc.push({ _id: item.date.toString(), count: item.count });
            }
            return acc;
        }, []); // Initialize accumulator as an empty array
        //sort date
        const sortedAscending = aggregatedCounts.sort((a, b) => Number(a._id) - Number(b._id));
        return { countUser: getUserData, getMonth: sortedAscending, systemRequest: groupByLastDate(systemRequest), systemRevenu: result }
    } catch (e) {
        console.error('Error get logs user in month:', e);
    } finally {
        db.client.close();
    }
}

module.exports = {
    getApprovalsRequest,
    updateSetReject,
    updateSetApprove,
    CheckApproverData,
    QueueInsertDigitalForm,
    getFormDataRequest,
    getDataSent,
    getEmployeeDataApi,
    getEmployerDataApi,
    _setting,
    _getsettings,
    _deleteDraft,
    keepLogsSystem,
    getLogsUser,
    getLogsUserInMonth
};