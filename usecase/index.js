const { ObjectId } = require('mongodb');
const ConnectMongoDB = require('../connection/MongoDB.js');
const { getApiAxway, sendMailAovServiceDigital, sendMailAovServiceFirewall } = require('../api/index.js');
const { thaiTime } = require('./time.js');
const { joinArray } = require('./joinArray.js');
const { getDPRCode, addDPR, getLastTicket } = require('./generateCode.js');
const GroupMongoDB = require('../repository/index.js');
const { UAParser } = require('ua-parser-js');
const USER_EXIT = "User exit or no have permission";
const { getNameApproverDigitalRequest } = require('./ApproverName.js');

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

const QueueInsertFirewallForm = async (obj, status, id, recall) => {

    if (!recall) {
        obj.comment = obj.comment.map((c) => ({
            ...c,
            text: status === 'draft' ? 'draft' : c.text,
            updateAt: c.updateAt === '' ? thaiTime() : c.updateAt
        }));
    } else {
        obj.comment = obj.comment.map((c) => ({
            ...c,
            updateAt: c.updateAt === '' ? thaiTime() : c.updateAt
        }));
    }
    let mailAction = 'Send';
    const settings = await _getsettings('firewall');
    const db = await ConnectMongoDB();
    const firstSetting = settings[0];
    const requesterCode = obj.requesterCode;

    const generateActionLine = () => {
        return obj.actionLine.length > 0
            ? obj.actionLine.map(item => ({ ...item, action: 'wait' }))
            : firstSetting.to.map(item => ({ ...item, action: 'wait', comment: '', updateAt: '' }));
    };
    const actionLine = generateActionLine();
    const ticketPayload = {
        requesterCode,
        sectionHeadCode: actionLine[0]?.code,
        departmentHeadCode: actionLine[1]?.code,
        sectionHeadStatus: status,
        departmentHeadStatus: 'wait',
        maxLevelApprover: parseInt(firstSetting.approver, 10),
        actionLine,
    };
    //update timestamp comment
    obj.comment = obj.comment.map((c) => ({ ...c, updateAt: c.updateAt === '' ? thaiTime() : c.updateAt }));
    const isUpdating = id && ObjectId.isValid(id);
    const objectId = isUpdating ? new ObjectId(id) : null;


    const updateExistingTicket = async () => {
        await db.collection("formDetails").updateOne({ _id: objectId }, { $set: obj });
        await db.collection("tickets").updateOne(
            { formId: objectId },
            { $set: { ...ticketPayload, updateAt: thaiTime() } },
            { upsert: true }
        );
    };
    try {
        // RECALL CASE
        if (isUpdating && recall === 'true') {
            mailAction = 'Recall';
            const existingTickets = await db.collection("tickets").find({ formId: objectId }).toArray();
            if (existingTickets.length > 0) {
                const oldActionLine = existingTickets[0].actionLine;
                const approvedCount = oldActionLine.filter(a => a.action === 'approved').length;
                const nextApprover = oldActionLine[approvedCount];
                const nameApprover = await getApiAxway(nextApprover.code, 'Employee');
                const email = nextApprover ? nextApprover.email : null;
                //send email recall
                await sendMailAovServiceFirewall({
                    to: email, //email
                    cc: firstSetting.ccmail,
                    NameApprover: 'คุณ' + nameApprover.fname + ' ' + nameApprover.lname,
                    data: obj,
                    action: mailAction
                });
                await updateExistingTicket();
                return;
            }
        }
        // NORMAL UPDATE CASE
        if (isUpdating && !recall) {
            const existingTickets = await db.collection("tickets").find({ formId: objectId }).toArray();
            if (existingTickets.length > 0) {
                //send email 
                if (status === 'wait') {
                    await sendMailAovServiceFirewall({
                        to: firstSetting.to[0].email,
                        cc: firstSetting.ccmail,
                        NameApprover: firstSetting.to[0].name,
                        data: obj,
                        action: mailAction
                    });
                }
                await updateExistingTicket();
                return;
            }
        }
        // NEW INSERT CASE
        const lastTicketId = await getLastTicket(db, 'FWR');
        const insertResult = await db.collection("formDetails").insertOne(obj);
        const newTicketId = lastTicketId?.ticketId ? addDPR(lastTicketId.ticketId) : getDPRCode(1, 'FWR');
        //send email 
        if (status === 'wait') {
            await sendMailAovServiceFirewall({
                to: firstSetting.to[0].email,
                cc: firstSetting.ccmail,
                NameApprover: firstSetting.to[0].name,
                data: obj,
                action: mailAction
            });
        }
        await db.collection("tickets").insertOne({
            ticketId: newTicketId,
            formId: insertResult.insertedId,
            ...ticketPayload,
            createAt: thaiTime(),
            updateAt: ''
        });
    } catch (err) {
        console.error("Failed to perform database operation:", err);
    }
};




const QueueInsertDigitalForm = async (obj, status, id, recall) => {
    const settings = await _getsettings('digital');//get service name setting form database
    const db = await ConnectMongoDB();
    try {
        if (!recall) {
            obj.comment = obj.comment.map((c) => ({
                ...c,
                text: status === 'draft' ? 'draft' : c.text,
                updateAt: c.updateAt === '' ? thaiTime() : c.updateAt
            }));
        } else {
            obj.comment = obj.comment.map((c) => ({
                ...c,
                updateAt: c.updateAt === '' ? thaiTime() : c.updateAt
            }));
        }
        let resolve = '';
        let mailAction = 'Send';
        const requesterCode = obj.requesterCode;
        const Managerdata = await getApiAxway(requesterCode, 'Employer');
        const CH = await getApiAxway(Managerdata.code, 'Employer');
        const ManagerdataHlv = CH === undefined ? await getApiAxway(Managerdata.code, 'Employee') : CH;
        //const lastTicketId = await getLastTicket(db, 'DPR');
        //const lastTicketId = getDPRCode(1, 'DPR');
        const TicketId = await getLastTicket(db, 'DPR');
        const lastTicketId = TicketId?.ticketId ? addDPR(TicketId.ticketId) : getDPRCode(1, 'DPR');
        // Check if the ID is valid
        const isUpdating = id && ObjectId.isValid(id);
        if (isUpdating && recall === 'true') {
            mailAction = 'Recall';
            const objectId = new ObjectId(id);
            // Update existing form
            const tickets = await db.collection("tickets").find({ formId: objectId }).toArray();
            if (!tickets.length) { console.warn('No ticket found for given objectId'); return; }
            const ticket = tickets[0];
            const approverCode = ticket.maxLevelApprover === 3
                ? ticket.sectionHeadCode
                : ticket.departmentHeadCode;
            const emailRecall = await getApiAxway(approverCode, 'Employee');
            await db.collection("formDetails").updateOne({ _id: objectId }, { $set: obj });
            await db.collection("tickets").updateOne({ formId: objectId },
                { $set: { sectionHeadStatus: status, departmentHeadStatus: 'wait', createAt: thaiTime() } })
            //send email recall
            await sendMailAovServiceDigital({
                to: emailRecall.emailaddr, //email
                cc: settings[0].ccmail,
                requesterName: obj.coordinatorName,
                NameApprover: Managerdata.fname + ' ' + Managerdata.lname,
                jobDetails: [
                    obj.jobName, obj.jobDetails, obj.department, obj.objectives, obj.benefits, obj.workType,
                    obj.natureOfWork, obj.ValueTarget, obj.ValuePlatform, obj.fileName, obj.ValueImpact, obj.ValueCompliance,
                    obj.ValuePeriod, obj.fileName1, obj.budget, obj.budgetUsed, obj.ApprovedBy, obj.connecterRequest],
                fileName: obj.FileNameServer,
                fileName1: obj.FileNameServer1,
                comment: obj.comment,
                action: mailAction
            });
        } else if (isUpdating && !recall) {
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
            await sendMailAovServiceDigital({
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
        ticketId: lastTicketId,
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
        const allApprover = await db.collection("tickets").find({
            $and: [
                {
                    $or: [
                        {
                            sectionHeadStatus: 'wait',
                            sectionHeadCode: code,
                            maxLevelApprover: { $in: [3, 4] }
                        },
                        {
                            sectionHeadStatus: 'approved',
                            departmentHeadCode: code,
                            maxLevelApprover: { $in: [3, 4] }
                        },
                        {
                            departmentHeadCode: code,
                            maxLevelApprover: 4
                        }
                    ]
                },
                {
                    sectionHeadStatus: { $ne: 'reject' },
                    departmentHeadStatus: { $ne: 'reject' }
                }
            ]
        }).toArray();
        const getApprover = allApprover.filter(item =>
            (
                item.departmentHeadCode === code && item.maxLevelApprover === 4
            ) || (
                item.sectionHeadCode === code && item.maxLevelApprover === 3
            ) || (
                item.departmentHeadCode === code && item.maxLevelApprover === 3
            )
        );
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
    return await getNameApproverDigitalRequest(joinedData, dataManager, dataManagerHlv, code);
}

const getDataFirewallRequest = async (db, code) => {
    // Get firewall tickets where user approved in actionLine
    const ticketFirewall = await db.collection("tickets").find({
        $or: [
            { requesterCode: code },
            {
                actionLine: {
                    $exists: true,
                    $elemMatch: {
                        code: code,
                        action: { $in: ['approved', 'rejected'] }
                    }
                }
            }
        ]
    }).toArray();
    let DataFirewall = [];
    if (ticketFirewall.length > 0) {
        const formIds = ticketFirewall.map(t => t.formId);
        DataFirewall = await db.collection("formDetails").find({
            _id: { $in: formIds }
        }).toArray();
    }
    return { ticketFirewall, DataFirewall }
}

const getDataDigitalReuest = async (db, code) => {
    // Get form + ticket by requesterCode
    const [resultDataForm, ticket] = await Promise.all([
        db.collection("formDetails").find({ requesterCode: code, system: 'Digital request' }).toArray(),
        db.collection("tickets").aggregate(GroupMongoDB.TicketMongoDB(code)).toArray()
    ]);
    // Find tickets by formId
    const formIds = resultDataForm.map(item => item._id);
    const [DataFormTicket, DataForm1] = await Promise.all([
        db.collection("tickets").aggregate(GroupMongoDB.TicketGroup(formIds)).toArray(),
        db.collection("formDetails").find({
            _id: { $in: ticket.map(item => item.formId) }
        }).toArray()
    ]);
    return { resultDataForm, ticket, DataFormTicket, DataForm1 }
}

const getFormDataRequest = async (code) => {
    const currentYear = new Date().getFullYear();
    const db = await ConnectMongoDB();
    let joinedData = [];

    try {
        if (!code) return [];
        // Get firewall request data
        const { ticketFirewall, DataFirewall } = await getDataFirewallRequest(db, code);
        // Get digital request data
        const { resultDataForm, ticket, DataFormTicket, DataForm1 } = await getDataDigitalReuest(db, code);

        // Filter ticket data by current year
        const filteredTickets = DataFormTicket.filter(ticket => {
            const ticketYear = ticket.createAt.split('-')[0];
            return ticketYear === currentYear.toString();
        });
        // Get approver hierarchy
        const dataManager = await getApiAxway(code, 'Employer');
        if (dataManager === 'No data available') return [];
        const CH = await getApiAxway(dataManager.code, 'Employer');
        if (CH === 'No data available') return [];
        const ManagerdataHlv = CH || await getApiAxway(dataManager.code, 'Employee');
        //  Combine all data and join
        const allTickets = [...ticket, ...filteredTickets, ...ticketFirewall];
        const allForms = [...resultDataForm, ...DataForm1, ...DataFirewall];
        const uniqueTickets = [
            ...new Map(allTickets.map(item => [item.formId.toString(), item])).values()
        ];
        const uniqueForms = [
            ...new Map(allForms.map(item => [item._id.toString(), item])).values()
        ];
        if (uniqueForms.length > 0 || uniqueTickets.length > 0) {
            joinedData = joinArray(uniqueTickets, uniqueForms);
        }
        // Sort by date
        joinedData.sort((a, b) => {
            const parseDate = (dateStr) => {
                if (!dateStr) return new Date(0); // fallback
                const [datePart, timePart] = dateStr.split(' ');
                const [year, day, month] = datePart.split('-');
                const formattedDate = `${year}-${month}-${day} ${timePart}`;
                return new Date(formattedDate);
            };
            const dateA = parseDate(a.createAt || a.updateAt);
            const dateB = parseDate(b.createAt || b.updateAt);
            return dateB - dateA; // latest first
        });
        //console.log(joinedData)
        // Return with approver names
        return await getNameApprover(joinedData, dataManager, ManagerdataHlv, code);

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

    const updatedComment = commentValue.map((item) => ({
        ...item,
        action: 'approved', updateAt: item.updateAt === '' ? thaiTime() : item.updateAt
    }));

    const settings = await _getsettings('digital');
    const objectId = new ObjectId(id);
    const db = await ConnectMongoDB();

    const column = params === 'approver1' ? 'sectionHeadStatus' : 'departmentHeadStatus';
    const commentField = params === 'approver1' ? 'sectionHeadComment' : 'departmentHeadComment';

    // ดึง Ticket
    const TicketDataForm = await db.collection("tickets").findOne({ _id: objectId });
    if (!TicketDataForm) throw new Error("Ticket not found");

    // อัปเดตสถานะ
    await db.collection("tickets").updateOne(
        { _id: objectId },
        { $set: { [column]: 'approved', updateAt: thaiTime() } }
    );

    // ดึง comment เดิมจาก formDetails
    const objectIdDataForm = new ObjectId(TicketDataForm.formId);
    const formDetail = await db.collection("formDetails").findOne({ _id: objectIdDataForm });

    const oldComment = Array.isArray(formDetail?.[commentField]) ? formDetail[commentField] : [];

    const mergedComment = [...oldComment, ...updatedComment]; // ต่อกัน

    // อัปเดต comment กลับเข้า database
    await db.collection("formDetails").updateOne(
        { _id: objectIdDataForm },
        { $set: { [commentField]: mergedComment } }
    );
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
            sendMailAovServiceDigital({
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
            sendMailAovServiceDigital({
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
            sendMailAovServiceDigital({
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
    const updatedComment = commentValue.map((item) => ({
        ...item,
        action: 'reject', updateAt: item.updateAt === '' ? thaiTime() : item.updateAt
    }));
    const settings = await _getsettings('digital');
    const objectId = new ObjectId(id);
    const db = await ConnectMongoDB();
    const column = params === 'approver1' ? 'sectionHeadStatus' : 'departmentHeadStatus';
    const commentField = params === 'approver1' ? 'sectionHeadComment' : 'departmentHeadComment';
    // อัปเดตสถานะใน tickets
    TicketDataForm = await db.collection("tickets").findOne({ _id: objectId });
    if (!TicketDataForm) throw new Error("Ticket not found");
    await db.collection("tickets").updateOne(
        { _id: objectId },
        { $set: { [column]: 'reject', updateAt: thaiTime() } }
    );
    // รวม comment ใหม่กับของเดิมใน formDetails
    const objectIdDataForm = new ObjectId(TicketDataForm.formId);
    const formDetail = await db.collection("formDetails").findOne({ _id: objectIdDataForm });
    const oldComments = Array.isArray(formDetail?.[commentField]) ? formDetail[commentField] : [];
    const mergedComments = [...oldComments, ...updatedComment]; // รวม
    // อัปเดต comment กลับเข้า database
    await db.collection("formDetails").updateOne(
        { _id: objectIdDataForm },
        { $set: { [commentField]: mergedComments } }
    );
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
            sendMailAovServiceDigital({
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
            sendMailAovServiceDigital({
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
            sendMailAovServiceDigital({
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

const _setting = async (array, code, service) => {
    const db = await ConnectMongoDB();

    try {
        const collection = db.collection("settings");
        const updateFields = {
            ccmail: array.ccmail,
            updatedBy: code,
            timeStamp: thaiTime(),
            ...(service === 'digital' && { approver: array.approver }),
            ...(service === 'firewall' && { to: array.to }),
        };
        await collection.updateOne(
            { service },
            { $set: updateFields }
        );
        return array;
    } catch (error) {
        console.error('Error updating settings:', error);
        throw error;
    } finally {
        await db.client.close();
    }
};



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


const getLogsUser = async (start, end, module) => {
    const db = await ConnectMongoDB();
    try {
        const [countUser, getMonth, getService, formData] = await Promise.all([
            db.collection("system_logs").aggregate(GroupMongoDB.GroupByUserCode(start, end)).toArray(),
            db.collection("system_logs").aggregate(GroupMongoDB.GroupByMonth(start, end)).toArray(),
            db.collection('tickets').aggregate(GroupMongoDB.GroupBySystem(start, end)).toArray(),
            db.collection('formDetails').aggregate(GroupMongoDB.GetDataRequest(module)).toArray()
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
        return {
            countUser: countUser,
            getMonth: sortMonth,
            systemRequest: ensureDigitalrequestFirst(updatedsystemRequest),
            // Filter out the objects where tickets.sectionHeadStatus is 'draft'
            formData: formData.filter(item => item.tickets && item.tickets.sectionHeadStatus !== 'draft')
        };
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


const _updateSetApproveFirewall = async (id, comment, params, userCode) => {

    try {
        const settings = await _getsettings('firewall');
        const firstSetting = settings[0];
        const db = await ConnectMongoDB();
        const objectId = new ObjectId(id);
        const ticket = await db.collection("tickets").findOne({ _id: objectId });
        const formObjectId = new ObjectId(ticket.formId);
        // ค้นหา formDetails ตาม formId
        const formDetail = await db.collection("formDetails").findOne({ _id: formObjectId });
        if (!ticket) {
            console.error("Ticket not found.");
            return;
        }
        const actionLine = ticket.actionLine;
        const currentIndex = actionLine.findIndex(item => item.code === userCode);

        if (currentIndex === -1) {
            console.error("User not found in actionLine.");
            return;
        }
        // เก็บ comment เก่า
        const oldComments = Array.isArray(actionLine[currentIndex].comment)
            ? actionLine[currentIndex].comment
            : [];
        // อัปเดต action และ comment
        actionLine[currentIndex].action = 'approved';
        actionLine[currentIndex].comment = [
            { text: comment, action: 'approved', updateAt: thaiTime() },
            ...oldComments
        ];
        actionLine[currentIndex].updateAt = thaiTime();
        const nextApprover = actionLine[currentIndex + 1];
        if (nextApprover && nextApprover.email) {
            const nextEmail = nextApprover.email;
            const nextdata = await getApiAxway(nextApprover.code, 'Employee')
            // nextEmail ต่อไป เช่น ส่งอีเมลแจ้งเตือน
            await sendMailAovServiceFirewall({
                to: nextEmail,
                cc: firstSetting.ccmail,
                NameApprover: 'คุณ' + nextdata.fname + ' ' + nextdata.lname,
                data: formDetail,
                action: 'Send'
            })
        }
        const updatePayload = { actionLine, updateAt: thaiTime() };
        // ถ้าคือคนที่ 1 (index 0)
        if (currentIndex === 0) {
            const next = actionLine[1];
            const final = actionLine[2];
            if (next) updatePayload.sectionHeadCode = next.code;
            if (final) updatePayload.departmentHeadCode = final.code;
        }
        // ถ้าคือคนที่ 2 (index 1)
        if (currentIndex === 1) {
            updatePayload.sectionHeadStatus = 'approved';
        }
        // ถ้าคือคนที่ 3 (index 2)
        if (currentIndex === 2) { updatePayload.departmentHeadStatus = 'approved'; }
        //ถ้าคือคนสุดท้ายใน actionLine ส่งกลับไปยัง Requester
        if (currentIndex === actionLine.length - 1) {
            const requester = await getApiAxway(formDetail.requesterCode, 'Employee');
            await sendMailAovServiceFirewall({
                to: formDetail.requesterEmail,
                cc: firstSetting.ccmail,
                NameApprover: 'คุณ' + requester.fname + ' ' + requester.lname,
                data: formDetail,
                action: 'Approved'
            })
        }
        await db.collection("tickets").updateOne({ _id: objectId }, { $set: updatePayload });
    } catch (error) {
        console.error('Error updating firewall approval:', error);
    }
};


const _updateSetRejectFirewall = async (id, comment, params, userCode) => {
    try {
        const settings = await _getsettings('firewall');
        const firstSetting = settings[0];
        const db = await ConnectMongoDB();
        const objectId = new ObjectId(id);
        const ticket = await db.collection("tickets").findOne({ _id: objectId });

        if (!ticket) {
            console.error("Ticket not found.");
            return;
        }

        const formObjectId = new ObjectId(ticket.formId);
        const formDetail = await db.collection("formDetails").findOne({ _id: formObjectId });

        const actionLine = ticket.actionLine;
        const currentIndex = actionLine.findIndex(item => item.code === userCode);

        if (currentIndex === -1) {
            console.error("User not found in actionLine.");
            return;
        }

        // เก็บ comment เก่า
        const oldComments = Array.isArray(actionLine[currentIndex].comment)
            ? actionLine[currentIndex].comment
            : [];

        // อัปเดต action และ comment
        actionLine[currentIndex].action = 'rejected';
        actionLine[currentIndex].comment = [
            { text: comment, action: 'reject', updateAt: thaiTime() },
            ...oldComments
        ];
        actionLine[currentIndex].updateAt = thaiTime();

        const updatePayload = {
            actionLine,
            updateAt: thaiTime()
        };

        // อัปเดตสถานะตามขั้น
        if (currentIndex === 0) {
            updatePayload.sectionHeadStatus = 'reject';
        }
        if (currentIndex === 1) {
            updatePayload.sectionHeadStatus = 'approved'; // ผ่านขั้น 1 แล้ว
            updatePayload.departmentHeadStatus = 'reject';
        }
        if (currentIndex === 2) {
            updatePayload.departmentHeadStatus = 'reject';
        }

        // ส่งอีเมลแจ้งกลับ requester
        const requester = await getApiAxway(formDetail.requesterCode, 'Employee');
        await sendMailAovServiceFirewall({
            to: formDetail.requesterEmail,
            cc: firstSetting.ccmail,
            NameApprover: 'คุณ' + requester.fname + ' ' + requester.lname,
            data: formDetail,
            action: 'Rejected'
        });

        await db.collection("tickets").updateOne({ _id: objectId }, { $set: updatePayload });
    } catch (error) {
        console.error('Error updating firewall rejection:', error);
    }
};




module.exports = {
    getApprovalsRequest,
    updateSetReject,
    updateSetApprove,
    CheckApproverData,
    QueueInsertDigitalForm,
    QueueInsertFirewallForm,
    getFormDataRequest,
    getDataSent,
    getEmployeeDataApi,
    getEmployerDataApi,
    _setting,
    _getsettings,
    _deleteDraft,
    keepLogsSystem,
    getLogsUser,
    getLogsUserInMonth,
    _updateSetApproveFirewall,
    _updateSetRejectFirewall
};