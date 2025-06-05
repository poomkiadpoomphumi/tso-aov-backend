
const { getApiAxway } = require('../api/index.js');
const getNameApproverDigitalRequest = async (joinedData, dataManager, dataManagerHlv, code) => {
    const updatedData = await Promise.all(joinedData.map(async (data) => {
        // Handle "Digital request" logic
        if (data.system === 'Digital request') {
            // Your existing async logic goes here, only for 'Digital request'
            if (data.sectionHeadCode !== code) {
                const NamedataManager = 'คุณ' + dataManager.fname + ' ' + dataManager.lname;
                const NamedataManagerHlv = 'คุณ' + dataManagerHlv.fname + ' ' + dataManagerHlv.lname;
                data.NameApprover =
                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' && data.maxLevelApprover === 4 ? NamedataManagerHlv :
                        data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManager :
                            data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManagerHlv :
                                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' && data.maxLevelApprover === 4 ? NamedataManager + ' , ' + NamedataManagerHlv :
                                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                        data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                            data.sectionHeadStatus === 'wait' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                                NamedataManager;
            }
            if (data.sectionHeadCode === code || data.departmentHeadCode === code) {
                const Approver1 = await getApiAxway(code, 'Employee');
                const Approver2 = await getApiAxway(Approver1.code, 'Employer');
                const NamedataManager = 'คุณ' + Approver1.fname + ' ' + Approver1.lname;
                const NamedataManagerHlv = 'คุณ' + Approver2.fname + ' ' + Approver2.lname;
                const CodeName =
                    (data.sectionHeadStatus === 'approved' &&
                        data.departmentHeadStatus === 'approved' &&
                        data.maxLevelApprover === 4 &&
                        (data.sectionHeadCode === code || data.departmentHeadCode === code)) ?
                        data.sectionHeadCode : data.departmentHeadCode;
                const NameApprover1 = await getApiAxway(CodeName, 'Employee');
                data.NameApprover =
                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' && data.maxLevelApprover === 4 && data.sectionHeadCode === code ? NamedataManagerHlv :
                        data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManager :
                            data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManagerHlv :
                                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' && data.maxLevelApprover === 4 && data.sectionHeadCode === code ? NamedataManager + ' , ' + NamedataManagerHlv :
                                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' && data.maxLevelApprover === 4 && data.departmentHeadCode === code ? 'คุณ' + NameApprover1.fname + ' ' + NameApprover1.lname + ', ' + NamedataManager :
                                        data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                            data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                                data.sectionHeadStatus === 'wait' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                                    NamedataManager;
            }
        }
        // Handle "Firewall request": just update jobName
        if (data.system === 'Firewall request') {
            const islastActionLine = data.actionLine?.slice(-1)[0];
            if (data.sectionHeadCode !== code) {
                let firewallapprover1 = [];
                if (data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved') {
                    firewallapprover1 = await getApiAxway(data.departmentHeadCode, 'Employee');
                } else if (islastActionLine.action === 'rejected') {
                   firewallapprover1 = await getApiAxway(data.departmentHeadCode, 'Employee');
                   
                }else {
                    firewallapprover1 = await getApiAxway(data.sectionHeadCode, 'Employee');
                    
                }
                const firewallapprover2 = await getApiAxway(data.departmentHeadCode, 'Employee');
                const NamedataManager = 'คุณ' + firewallapprover1.fname + ' ' + firewallapprover1.lname;
                const NamedataManagerHlv = 'คุณ' + firewallapprover2.fname + ' ' + firewallapprover2.lname;
                data.NameApprover =
                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' && data.maxLevelApprover === 4 ? NamedataManagerHlv :
                        data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManager :
                            data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManagerHlv :
                                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' && data.maxLevelApprover === 4 ? NamedataManager + ' , ' + NamedataManagerHlv :
                                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManagerHlv :
                                        data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                            data.sectionHeadStatus === 'wait' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                                NamedataManager;
            }
            if (data.sectionHeadCode === code || data.departmentHeadCode === code) {
                
                let Approver1 = [];
                if ((data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3) ||
                    (data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' && data.maxLevelApprover === 3) && !islastActionLine) {
                    Approver1 = await getApiAxway(data.sectionHeadCode, 'Employee');
                } else if (islastActionLine.action === 'rejected') {
                    Approver1 = await getApiAxway(data.departmentHeadCode, 'Employee');
                } else if(data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' && data.maxLevelApprover === 3){
                    Approver1 = await getApiAxway(data.sectionHeadCode, 'Employee');
                }else {
                    Approver1 = await getApiAxway(data.departmentHeadCode, 'Employee');
                }

                const Approver2 = await getApiAxway(Approver1.code, 'Employer');
                const NamedataManager = 'คุณ' + Approver1.fname + ' ' + Approver1.lname;
                const NamedataManagerHlv = 'คุณ' + Approver2.fname + ' ' + Approver2.lname;
                const CodeName =
                    (data.sectionHeadStatus === 'approved' &&
                        data.departmentHeadStatus === 'approved' &&
                        data.maxLevelApprover === 4 &&
                        (data.sectionHeadCode === code || data.departmentHeadCode === code)) ?
                        data.sectionHeadCode : data.departmentHeadCode;
                const NameApprover1 = await getApiAxway(CodeName, 'Employee');
                data.NameApprover =
                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'reject' && data.maxLevelApprover === 4 && data.sectionHeadCode === code ? NamedataManagerHlv :
                        data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManager :
                            data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 4 ? NamedataManagerHlv :
                                data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' && data.maxLevelApprover === 4 && data.sectionHeadCode === code ? NamedataManager + ' , ' + NamedataManagerHlv :
                                    data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'approved' && data.maxLevelApprover === 4 && data.departmentHeadCode === code ? 'คุณ' + NameApprover1.fname + ' ' + NameApprover1.lname + ', ' + NamedataManager :
                                        data.sectionHeadStatus === 'approved' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                            data.sectionHeadStatus === 'reject' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                                data.sectionHeadStatus === 'wait' && data.departmentHeadStatus === 'wait' && data.maxLevelApprover === 3 ? NamedataManager :
                                                    NamedataManager;
            }
            return {
                ...data,
                jobName: `${data.jobName} ${data.systemRequested || ''}`.trim()
            };
        }
        // Return original or modified data
        return data;
    }));
    // Filter out any undefined or null values
    return updatedData;
}

module.exports = { getNameApproverDigitalRequest };